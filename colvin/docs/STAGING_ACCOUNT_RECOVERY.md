# Staging account recovery

Use the normal email password-reset flow whenever delivery is available. This operator command is for a verified owner's staging account when the temporary email sender cannot deliver to that account. It requires authenticated Railway SSH access and does not expose an HTTP recovery endpoint.

## Before running

1. Merge the reviewed recovery change after CI passes and wait for the staging API Gateway deployment to succeed.
2. Confirm the original account email and user ID in the staging database. Keep the existing row.
3. In the Railway dashboard, select **staging → api-gateway** and copy its SSH command. Run that command in your terminal. Use `railway login` first if authentication is required.

Railway documents [SSH access](https://docs.railway.com/cli/ssh) and its [provided environment variables](https://docs.railway.com/variables/reference). Use `railway ssh`, which connects to the running container; a local `railway shell` or `railway run` is not the recovery workflow.

## Run inside the deployed container

```bash
cd /app/apps/api-gateway
node scripts/recover-staging-account.mjs --project-id PROJECT_ID --environment-id STAGING_ENVIRONMENT_ID --service-id API_GATEWAY_SERVICE_ID
```

Replace the three IDs using the staging dashboard. These identifiers are not passwords. The command refuses missing or mismatched IDs, an environment not named `staging`, a service not named `api-gateway`, or a noninteractive terminal. Do not change Railway variables to satisfy a failed target check.

Enter the original account email, check the displayed user ID against the existing row, and enter a new unique password twice. Password input is hidden and terminal input history is disabled. At the final prompt, type the exact `RESET account-email` confirmation only if the account and environment match. Ctrl+C or an incorrect confirmation cancels before recovery.

The final confirmation prompt should appear immediately after repeating the password. Database recovery starts only after the exact confirmation is submitted, when the command prints **Applying staging recovery...**. If an older deployment erases the confirmation prompt in an SSH terminal, cancel with Ctrl+C and rerun the same Node command with `TERM=dumb` before `node`. This affects terminal handling for that invocation only.

The command enforces Colvin's existing password length, bcrypt byte limit and configured compromised-password screening. It rejects reuse of the stored password. If the proposed password already matches, investigate the login request instead of changing the account.

The password hash update, `password_changed_at`, incremented `auth_version`, refresh-session revocation, outstanding password-reset-link revocation and operator audit event commit in one PostgreSQL transaction. An audit write failure rolls back recovery. The account ID, email, role, email-verification status and associated data are preserved. The password and hash are not printed or included in the audit event.

## Verify

1. Wait for **Recovery complete**, then enter `exit` to leave SSH.
2. Sign in to the original account through the staging website using the new password. Refresh once and perform a VIN lookup.
3. Confirm the original row now has a password-change timestamp and its auth version increased by one. The separate Resend test account should remain usable.

If the command or SSH session disconnects before a completion message, the result may be uncertain. Try signing in with the new password and check the timestamp/auth version before repeating recovery. Respect authentication rate limits if earlier attempts have temporarily limited the account.

This command is not a production account-recovery policy. Production recovery requires verified email delivery and an approved operational process.
