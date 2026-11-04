SELECT jsonb_build_object(
  'formatVersion', 1,
  'postgresVersionNumber', current_setting('server_version_num'),
  'origin', jsonb_build_object('projectId', :'project', 'environmentId', :'environment', 'serviceId', :'service'),
  'dumpClient', :'dump_client',
  'migrations', (SELECT jsonb_agg(jsonb_build_object('filename', filename, 'checksum', checksum) ORDER BY filename) FROM public.schema_migrations),
  'counts', jsonb_build_object(
    'users', (SELECT count(*)::text FROM public.users),
    'refresh_tokens', (SELECT count(*)::text FROM public.refresh_tokens),
    'vehicles', (SELECT count(*)::text FROM public.vehicles),
    'vehicle_history_records', (SELECT count(*)::text FROM public.vehicle_history_records),
    'lookup_logs', (SELECT count(*)::text FROM public.lookup_logs),
    'auth_audit_events', (SELECT count(*)::text FROM public.auth_audit_events),
    'account_action_tokens', (SELECT count(*)::text FROM public.account_action_tokens),
    'history_provider_checks', (SELECT count(*)::text FROM public.history_provider_checks),
    'provider_usage_daily', (SELECT count(*)::text FROM public.provider_usage_daily),
    'provider_runtime_state', (SELECT count(*)::text FROM public.provider_runtime_state),
    'schema_migrations', (SELECT count(*)::text FROM public.schema_migrations)
  ),
  'schema', jsonb_build_object(
    'tables', (SELECT jsonb_agg(c.relname ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')),
    'columns', (SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'column', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid)) ORDER BY c.relname, a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped),
    'constraints', (SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'name', k.conname, 'definition', pg_get_constraintdef(k.oid), 'validated', k.convalidated) ORDER BY c.relname, k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'),
    'indexes', (SELECT jsonb_agg(jsonb_build_object('table', c.relname, 'name', i.relname, 'definition', pg_get_indexdef(i.oid), 'valid', x.indisvalid, 'ready', x.indisready) ORDER BY c.relname, i.relname) FROM pg_index x JOIN pg_class c ON c.oid = x.indrelid JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'),
    'extensions', (SELECT jsonb_agg(jsonb_build_object('name', extname, 'version', extversion) ORDER BY extname) FROM pg_extension)
  )
);
