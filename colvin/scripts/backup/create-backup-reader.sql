-- Operator-run in STAGING Postgres only. Not an application migration.
-- The new role stays NOLOGIN until its password is set separately at a terminal.
\set ON_ERROR_STOP on
SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='colvin_backup_reader') AS already_exists \gset
\if :already_exists
  \echo 'Backup reader already exists. No password rotation or grants performed; inspect its state first.'
  \quit 1
\endif
BEGIN;
CREATE ROLE colvin_backup_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SELECT format('GRANT CONNECT ON DATABASE %I TO colvin_backup_reader',current_database()) \gexec
GRANT USAGE ON SCHEMA public TO colvin_backup_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO colvin_backup_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO colvin_backup_reader;
-- Preserve read access for future migrations by the current table owners.
DO $$ DECLARE owner_name text; BEGIN
  FOR owner_name IN SELECT DISTINCT pg_get_userbyid(relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S') LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO colvin_backup_reader',owner_name);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON SEQUENCES TO colvin_backup_reader',owner_name);
  END LOOP;
END $$;
ALTER ROLE colvin_backup_reader SET default_transaction_read_only=on;
COMMIT;
\echo 'Backup reader created with SELECT grants and NOLOGIN. Set its password and enable LOGIN separately; existing credentials were not changed.'
