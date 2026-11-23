# Invite-only staging registration

The API accepts new registrations only with a matching email and private invite code when
`BETA_REGISTRATION_INVITE_DIGESTS` is configured. Existing accounts keep their access. The public
staging URL and health endpoints remain reachable. Production and local registration remain open
under this feature when the variable is unset; setting it outside Railway staging fails startup.

From the `colvin` directory on a trusted machine, run:

```bash
node apps/api-gateway/scripts/generate-beta-invites.mjs 3
```

Enter each address in order. The generator prints one random code per tester and one Railway
variable containing only digests. The email inputs and codes are visible in the local terminal;
avoid a shared terminal or session recording. Keep codes private and send each person only their
own code. Do not put addresses or codes in the repository, shared logs or invite links.

Deploy the API and web changes, then add the generated variable in **Railway → Colvin → staging →
api-gateway → Variables** and apply the deployment. Confirm a registration with an unapproved
address or missing code is denied. Have an invited tester register with their approved email and
code and verify their inbox. Password reset and sign-in use the normal flow without a code.

To close enrollment while keeping existing accounts, replace the value with a single 64-character
hex digest generated from random bytes that is not associated with any invite. Removing the variable
instead reopens registration. Changing or removing a digest prevents new registrations using that
invite; it does not revoke an existing account. The normal unique-email constraint prevents the same
email from registering twice.
