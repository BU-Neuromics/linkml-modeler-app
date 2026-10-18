# Contributing to LinkML Visual Schema Editor

Thank you for your interest in contributing! This guide covers how to set up the project, run tests, and submit changes.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold those standards.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0 (`npm install -g pnpm`)
- Git

### Clone and install

```bash
git clone https://github.com/datahelix-platform/linkml-modeler-app.git
cd linkml-modeler-app
pnpm install
```

### Run the development server

```bash
pnpm dev
```

Opens at [http://localhost:5173](http://localhost:5173).

## Development Workflow

### Build

```bash
pnpm build          # Core + web packages (Electron excluded; use build:all for desktop)
```

### Test

```bash
pnpm test                                          # All packages
pnpm --filter @linkml-editor/core test             # Core only
pnpm --filter @linkml-editor/core test:watch       # Watch mode
```

### Lint and format

```bash
pnpm lint     # ESLint across all packages
pnpm format   # Prettier formatting
```

### Documentation

```bash
pnpm docs:dev    # Local preview at http://localhost:5173/docs/
pnpm docs:build  # Static build
```

## Monorepo Structure

```
packages/
├── core/       # Shared React app — canvas, editor, store, IO, model, UI
├── web/        # Vite web build + browser platform adapter
├── electron/   # Electron main process + IPC (experimental, not v1.0 scope)
└── docs/       # VitePress documentation site
```

Most feature work happens in `packages/core/`.

## Submitting Changes

1. **Fork** the repository and create a feature branch from `main`.
2. **Write tests** for any new behavior; run `pnpm test` before opening a PR.
3. **Lint** your code: `pnpm lint` must pass with no new errors.
4. **Open a pull request** against `main` using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
5. **Reference issues** in the PR description (e.g., `Fixes #42`).

PRs should be focused — one logical change per PR. Large refactors should be discussed in an issue first.

## Reporting Issues

Use the GitHub issue tracker with the appropriate template:

- [Bug report](https://github.com/datahelix-platform/linkml-modeler-app/issues/new?template=bug_report.md)
- [Feature request](https://github.com/datahelix-platform/linkml-modeler-app/issues/new?template=feature_request.md)

For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions will be licensed under the [MIT License](LICENSE).
