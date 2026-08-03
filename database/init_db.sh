#!/usr/bin/env bash
# Recreates the ProstaAI SQLite database from docs/schema.sql.
# Usage: bash database/init_db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DB_PATH="database/prostaai.db"

if [ -f "$DB_PATH" ]; then
  echo "Removing existing $DB_PATH"
  rm "$DB_PATH"
fi

sqlite3 "$DB_PATH" < docs/schema.sql
echo "Created $DB_PATH from docs/schema.sql"
sqlite3 "$DB_PATH" ".tables"
