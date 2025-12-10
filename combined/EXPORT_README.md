## Exporting full data dumps (Dispatch + Frontrunner)

The two Postgres instances you have running:

- Dispatch: `localhost:5434` (`komatsu_dispatch`, user `dispatch_user`, pass `dispatch_password`)
- Frontrunner: `localhost:5433` (`infrastructure_db`, user `infra_user`, pass `infra_password`)

Use `pg_dump` to export **all tables** from each DB. From repo root:

```bash
# Dispatch (full DB dump)
pg_dump -h localhost -p 5434 -U dispatch_user -d komatsu_dispatch -Fc -f combined/dumps/dispatch.dump

# Frontrunner (full DB dump)
pg_dump -h localhost -p 5433 -U infra_user -d infrastructure_db -Fc -f combined/dumps/frontrunner.dump
```

Notes:
- The `-Fc` format is portable and can be restored with `pg_restore`.
- Ensure `combined/dumps/` exists (created below).
- If you prefer plain SQL: replace `-Fc` with `-Fp` and use `.sql` filenames.

To restore into another Postgres later:

```bash
createdb -h <target_host> -p <target_port> -U <target_user> <target_db>
pg_restore -h <target_host> -p <target_port> -U <target_user> -d <target_db> combined/dumps/dispatch.dump
pg_restore -h <target_host> -p <target_port> -U <target_user> -d <target_db> combined/dumps/frontrunner.dump
```


