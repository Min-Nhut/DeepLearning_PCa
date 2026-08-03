# ProstaAI database

SQLite database for local development, generated from [docs/schema.sql](../docs/schema.sql).

- `prostaai.db` — the actual database file. **Not committed** (see `.gitignore`) — it's
  a generated artifact, regenerate it any time with the script below. Currently empty
  (schema only, no seed data).
- `init_db.sh` — drops and recreates `prostaai.db` from `docs/schema.sql`.

## Regenerate

```bash
bash database/init_db.sh
```

## Important: foreign keys are off by default

SQLite disables foreign-key enforcement per-connection unless you turn it on explicitly —
`PRAGMA foreign_keys = ON;` at the top of `schema.sql` only affects the session that
*creates* the file, not later connections. Any client that opens `prostaai.db` (a FastAPI
backend, a script, `sqlite3` CLI) must run `PRAGMA foreign_keys = ON;` on its own
connection, or `ON DELETE CASCADE` / `REFERENCES` checks will silently not apply. With
SQLAlchemy this is a `connect` event listener:

```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _):
    dbapi_connection.execute("PRAGMA foreign_keys=ON")
```

## Inspecting the database

```bash
sqlite3 database/prostaai.db ".tables"
sqlite3 database/prostaai.db ".schema cases"
sqlite3 database/prostaai.db "PRAGMA foreign_key_check;"   # empty output = no violations
```
