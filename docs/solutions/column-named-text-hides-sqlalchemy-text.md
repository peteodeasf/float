# A column named `text` breaks `server_default=text(...)` in the same model

**2026-11-25, action plans.**

## What happened

`ActionPlanItem` has a column called `text`. Every column after it that used
`server_default=text("false")` failed at import with `TypeError: 'MappedColumn' object is not
callable`. Inside a class body, `text = mapped_column(...)` replaces the name `text` that was
imported from SQLAlchemy, for every line below it.

## The fix

Import SQLAlchemy's function under another name in that file:
`from sqlalchemy import ..., text as sql`, then `server_default=sql("false")`.

## Next time

Any column named after something imported at the top of the model file does this: `text`, `func`,
`select`, `date`. Rename the import, not the column, when the column name is the right word.
