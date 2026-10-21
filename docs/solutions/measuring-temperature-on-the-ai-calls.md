# Measuring temperature on the AI calls

Found while working on "Make the AI answer the same way each run" (2026-10-21).

## Opus 5.5 refuses any temperature but the default

Step sentences (`combination_wording.py`) run on `claude-opus-5-5`. Sending `temperature=0` there
returns a 400: "`temperature` is deprecated for this model." Sending `temperature=1` (the default) is
accepted and changes nothing. The same holds for the reviewers, which also run on Opus 5.5. So step
sentences cannot be steadied with temperature at all. Only a different model or a prompt change
would do it.

`claude-sonnet-4-6` (monitoring analysis, the preliminary report, voice notes, suggested rungs)
accepts it. None of those calls use thinking, so nothing else on the call conflicts with it.

Temperature 0 does not promise the same answer every time, on any model. It only makes it more
likely.

## Measuring without changing the app

`run.py --temperature 0` sends that temperature on the feature's own calls, in place of the app's
setting. It goes through `MeteredClient(..., temperatures={model: value})`, which only touches calls
to the feature's model. That matters for step sentences: the reviewers share the client, run on
Opus 5.5, and would fail if they were sent a temperature.

The report's header line says which temperature ran, so two reports can be told apart.

## Background commands on the agent are stopped after 10 minutes

A full monitoring analysis or suggested rungs run takes longer than the 10-minute default limit for
an agent's background command. The run is killed, and because the runner writes its report only at
the end, nothing is kept (backlog: "A stopped test run keeps no report..."). The money is still
spent. Give long runs an explicit `timeout` of up to an hour, and plan the session's $10 from each
run's `--budget` cap, since a killed run's real spend is unknown.
