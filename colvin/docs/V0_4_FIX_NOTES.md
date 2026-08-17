# Colvin v0.4 Quality Gate Fixes

This patch responds to the first developer workstation run of `npm run doctor` and `npm run quality`.

## Fixed

1. **False npm-unavailable doctor result on Windows**
   - `npm run doctor` now reads npm's own user-agent environment first.
   - Direct Windows execution falls back to a fixed `cmd.exe /c npm --version` invocation.

2. **Node DEP0190 warning in Go formatting check**
   - `scripts/check-go-format.mjs` no longer launches `gofmt` with `shell: true`.

3. **API gateway ESLint error**
   - `setTimeout` is imported explicitly from `node:timers`.

4. **React hook dependency warning**
   - `save` and `logout` are stable `useCallback` callbacks.
   - the provider value includes complete `useMemo` dependencies.

5. **React Fast Refresh warning**
   - context, provider component, and consumer hook now live in separate modules.

## Apply safely to the developer workstation

Keep these locally generated files:

- `package-lock.json`
- `apps/services-go/history-service/go.sum`

Overlay the patch onto the current Colvin working tree, then remove:

- `apps/web-client/src/features/auth/AuthContext.jsx`

Finally run:

```bash
npm run doctor
npm run format
npm run quality
```
