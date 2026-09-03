#!/usr/bin/env bash
# Applies every migration to a throwaway database, then asserts the RLS policies
# and RPCs actually behave. Needs a Postgres reachable via the usual PG* vars, or
# a local one it can start itself.
set -euo pipefail

DB="${TEST_DB:-social_credit_test}"
PSQL_ARGS="${PGHOST:+-h $PGHOST} ${PGPORT:+-p $PGPORT} ${PGUSER:+-U $PGUSER}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

psql $PSQL_ARGS -d postgres -q -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"

# Supabase creates these cluster roles; a bare Postgres does not.
for role in anon authenticated service_role; do
  psql $PSQL_ARGS -d postgres -q -c "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$role') THEN
      CREATE ROLE $role NOLOGIN;
    END IF;
  END \$\$;"
done

psql $PSQL_ARGS -d "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/stubs.sql"

echo "--- applying migrations ---"
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql $PSQL_ARGS -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f"
  echo "ok   $(basename "$f")"
done

echo ""
echo "--- policy assertions ---"
psql $PSQL_ARGS -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/rls.test.sql" 2>&1 \
  | grep -E "^(NOTICE|ERROR|ok|---|ALL RLS|psql)" \
  | sed 's/^NOTICE:  //'
