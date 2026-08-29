"""The access dependencies have to be wired to the id the handler actually uses.

A `get_permitted_*` dependency binds its parameter BY NAME. If the name does not match a path
parameter on the route, FastAPI does not error — it quietly promotes that parameter to a required
QUERY parameter, and the caller then supplies the id their own access is checked against while the
handler goes on using the id in the path.

That is what happened on `GET /rungs/{rung_id}/experiments`, which was guarded by
`get_permitted_behavior` (parameter `behavior_id`). The security review found it in the app's own
OpenAPI schema. The route sweep could not: it only fills path parameters, so its request omitted
the query parameter, got a 422, and passed.

These tests need no database and no fixtures — they read the app's dependency graph.
"""
import re

from fastapi.routing import APIRoute

import app.main


def _routes():
    return [r for r in app.main.app.routes if isinstance(r, APIRoute)]


def _all_query_params(route):
    """Query parameters contributed by the route AND by everything it depends on."""
    found = list(route.dependant.query_params)
    stack = list(route.dependant.dependencies)
    while stack:
        d = stack.pop()
        found.extend(d.query_params)
        stack.extend(d.dependencies)
    return found


def test_no_route_takes_an_id_from_the_query_string():
    """An id in the query string is caller-supplied. If an access check reads one, the caller is
    choosing what gets authorised."""
    offenders = []
    for route in _routes():
        for param in _all_query_params(route):
            if param.name.endswith("_id"):
                method = sorted(m for m in route.methods if m != "HEAD")[0]
                offenders.append(f"{method} {route.path}  ->  {param.name}")
    assert not offenders, (
        "an id reaches these routes through the query string rather than the path:\n  "
        + "\n  ".join(offenders)
    )


def test_every_access_dependency_binds_to_a_path_parameter():
    """Directly: each get_permitted_* on a route must name a parameter that route's path has."""
    problems = []
    for route in _routes():
        # From the path TEMPLATE, not from route.dependant.path_params: a handler need not
        # declare a parameter its dependency consumes, and often does not.
        path_params = set(re.findall(r"{([^}:]+)", route.path))
        stack = list(route.dependant.dependencies)
        while stack:
            d = stack.pop()
            name = getattr(d.call, "__name__", "")
            if name.startswith("get_permitted"):
                for p in d.path_params:
                    if p.name not in path_params:
                        method = sorted(m for m in route.methods if m != "HEAD")[0]
                        problems.append(f"{method} {route.path}: {name} wants {p.name}")
                for p in d.query_params:
                    method = sorted(m for m in route.methods if m != "HEAD")[0]
                    problems.append(
                        f"{method} {route.path}: {name} takes {p.name} from the query string"
                    )
            stack.extend(d.dependencies)
    assert not problems, "access dependencies bound to the wrong parameter:\n  " + "\n  ".join(problems)


# --- route ordering -------------------------------------------------------------------------
#
# FastAPI matches routes in declaration order. A literal path segment declared AFTER a UUID
# parameter on the same prefix is unreachable: "reorder" gets parsed as a uuid, fails, and the
# request 422s. Both ladder-rung and trigger reorder were broken this way and nothing noticed,
# because a 422 on drag-to-reorder looks like nothing happening.

LITERAL_ROUTES = [
    ("PUT", "/ladders/{}/rungs/reorder", "reorder_ladder_rungs"),
    ("PUT", "/plans/{}/triggers/reorder", "reorder_trigger_situations"),
    ("PUT", "/plans/{}/accommodations/reorder", "reorder_accommodation_behaviors"),
]


def test_literal_paths_are_not_shadowed_by_uuid_routes():
    """Each of these must reach its own handler, not a {some_id} route declared above it."""
    fake = "00000000-0000-0000-0000-000000000001"
    wrong = []
    for method, template, expected in LITERAL_ROUTES:
        url = template.format(fake)
        hit = None
        for route in _routes():
            if method in route.methods and route.path_regex.match(url):
                hit = route.endpoint.__name__
                break
        if hit != expected:
            wrong.append(f"{method} {url} -> {hit or 'no route'} (wanted {expected})")
    assert not wrong, (
        "a literal path is shadowed by a uuid route declared above it:\n  " + "\n  ".join(wrong)
    )
