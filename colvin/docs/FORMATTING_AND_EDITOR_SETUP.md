# Colvin Formatting and Editor Setup

Colvin uses one formatting contract for contributors and CI.

## From the repository root

After dependencies are installed:

```bash
npm install
npm run format
npm run format:check
```

`npm run format` must be invoked from the directory that contains the root `package.json` whose `name` is `colvin`.

If the terminal is currently inside `apps/web-client`, use:

```bash
npm run format
```

The web workspace now has its own formatter script. The same applies inside `apps/api-gateway`.

From the root, workspace-specific commands are also available:

```bash
npm run format:web
npm run format:api
npm run format:go
```

## Go

Go source is formatted with the standard `gofmt` tool rather than Prettier:

```bash
npm run format:go
npm run format:go:check
```

## VS Code

The repository commits `.vscode/settings.json` and `.vscode/extensions.json` so clones share the formatter policy.

Recommended extensions:

- Prettier - Code formatter (`esbenp.prettier-vscode`)
- ESLint (`dbaeumer.vscode-eslint`)
- Go (`golang.go`)

If save-formatting still does not trigger:

1. Open the **Colvin repository root** as the VS Code folder, not only `apps/web-client`.
2. Run `npm install` at the root.
3. Open a JS/JSX file and use **Format Document With...** → **Prettier - Code formatter** → **Configure Default Formatter**.
4. Run `npm run doctor` from the root and resolve any reported dependency problem.
5. Run `npm run format:check` to distinguish an editor problem from a repository/tooling problem.

Prettier controls layout. ESLint controls JavaScript correctness. `gofmt` controls Go layout. CI will eventually enforce all three through `npm run quality`.
