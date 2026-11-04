-- Synthetic CI data only; no password is usable and no real account is involved.
INSERT INTO users(id,email,password_hash) VALUES ('11111111-1111-4111-8111-111111111111','backup-fixture@example.invalid','synthetic-unusable-hash');
INSERT INTO refresh_tokens(user_id,token_hash,expires_at,family_id,family_expires_at) VALUES ('11111111-1111-4111-8111-111111111111','synthetic-refresh-hash',now()+interval '1 day','22222222-2222-4222-8222-222222222222',now()+interval '30 days');
INSERT INTO vehicles(id,vin,make) VALUES ('33333333-3333-4333-8333-333333333333','1HGCM82633A004352','Synthetic fixture');
INSERT INTO vehicle_history_records(vehicle_id,record_type,summary,source_name) VALUES ('33333333-3333-4333-8333-333333333333','service','Synthetic service record','fixture');
INSERT INTO lookup_logs(user_id,vin,success) VALUES ('11111111-1111-4111-8111-111111111111','1HGCM82633A004352',true);
INSERT INTO auth_audit_events(user_id,event_type,outcome) VALUES ('11111111-1111-4111-8111-111111111111','backup-fixture','success');
INSERT INTO account_action_tokens(user_id,purpose,token_hash,expires_at) VALUES ('11111111-1111-4111-8111-111111111111','password_reset',repeat('a',64),now()+interval '1 hour');
INSERT INTO history_provider_checks(vehicle_id,provider,check_type,status,checked_at,valid_until) VALUES ('33333333-3333-4333-8333-333333333333','fixture','synthetic','clear',now(),now()+interval '1 day');
INSERT INTO provider_usage_daily(provider,usage_date,call_count) VALUES ('fixture',current_date,1);
INSERT INTO provider_runtime_state(provider,total_successes) VALUES ('fixture',1);
