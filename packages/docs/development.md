# LinkML Visual Schema Editor — Developer Guide

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | >= 20.0.0 | https://nodejs.org |
| pnpm | >= 9.0.0 | `npm install -g pnpm` |
| Git | any | https://git-scm.com |

---

## Setup

```bash
git clone https://github.com/adamlabadorf/linkml-modeler-app.git
cd linkml-modeler-app
pnpm install
```

---

## Running in Development

### Web app

```bash
pnpm dev
```

Starts the Vite dev server at [http://localhost:5173](http://localhost:5173) with hot module replacement.

### Experimental: desktop (Electron) app

> **Note:** The Electron desktop build is experimental and is not part of the v1.0 supported surface. The web app is the primary development target.

To run the desktop build in development, you need both the web dev server and the compiled main process running simultaneously.

**Terminal 1 — web renderer:**
```bash
pnpm dev
```

**Terminal 2 — Electron main process:**
```bash
pnpm --filter @linkml-editor/core build
pnpm --filter @linkml-editor/electron build
NODE_ENV=development npx electron packages/electron/dist/main.js
```

---

## Building for Production

```bash
pnpm build
```

Builds core and web packages only — Electron is excluded:

1. `@linkml-editor/core` — TypeScript compilation + Vite library build → `packages/core/dist/`
2. `@linkml-editor/web` — TypeScript check + Vite static build → `packages/web/dist/`

To include the Electron main process in the build, use `pnpm build:all` instead.

### Serving the web build

```bash
# Preview the production web build locally
pnpm --filter @linkml-editor/web preview
```

The `packages/web/dist/` directory is a self-contained static site — deploy it to any web server or CDN.

### Deploying the web build with Docker

A Docker Compose stack (nginx + CORS proxy) is provided under `deploy/web/`. The web image is **self-contained** — a multi-stage build compiles the app inside Docker (pnpm build stage → nginx serve stage), so no host-side `pnpm build` is needed:

```bash
docker compose -f deploy/web/docker-compose.yml up --build
```

The app is served on port 80. The CORS proxy is reachable at `/cors-proxy/` on the same origin, and is baked into the bundle as the default `VITE_GIT_CORS_PROXY`.

### Serving behind a reverse proxy at a subpath

When your reverse proxy routes the app under a URL prefix (e.g. `https://your-domain.com/linkml-editor/`), set `BASE_PATH`. It is a single build arg that feeds **both** the Vite asset base (`VITE_BASE_URL`) and the nginx location prefix, so the two can no longer disagree:

```bash
BASE_PATH=/linkml-editor/ \
  docker compose -f deploy/web/docker-compose.yml up --build
```

`BASE_PATH` must end with `/`.

**Configuration summary** (all Docker build args — Vite config is compile-time, so changing any of these requires an image rebuild):

| Build arg | Feeds | Default | Example |
|---|---|---|---|
| `BASE_PATH` | `VITE_BASE_URL` (asset base in `index.html`) + nginx location prefix | `/` | `/linkml-editor/` |
| `GIT_CORS_PROXY` | `VITE_GIT_CORS_PROXY` (baked into JS bundle); relative paths resolve same-origin | `${BASE_PATH}cors-proxy` (compose) / empty = remote git disabled (bare `docker build`) | `/linkml-editor/cors-proxy` |
| `GITHUB_CLIENT_ID` | `VITE_GITHUB_CLIENT_ID` (GitHub device-flow sign-in; empty hides the sign-in UI) | empty | `Iv1.abc123` |

**Reverse proxy config (example nginx upstream):**

```nginx
location /linkml-editor/ {
    proxy_pass http://your-docker-host:80/linkml-editor/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Experimental: Electron production build

> **Note:** Not part of v1.0 supported surface.

```bash
# Build core, web, and the Electron main process together
pnpm build:all
npx electron packages/electron/dist/main.js
```

In production mode, Electron loads `packages/web/dist/index.html` from disk.

---

## Testing

```bash
# Run all tests across all packages
pnpm test

# Run tests for a specific package
pnpm --filter @linkml-editor/core test
pnpm --filter @linkml-editor/web test

# Watch mode (core only)
pnpm --filter @linkml-editor/core test:watch
```

Tests use [Vitest](https://vitest.dev/) with jsdom. Test files live in `packages/core/src/__tests__/`.

---

## Linting and Formatting

```bash
# Lint TypeScript/TSX across all packages
pnpm lint

# Auto-format all source files
pnpm format
```

ESLint is configured with `@typescript-eslint` + `eslint-plugin-react`. Prettier handles formatting.

---

## Repository Structure

```
linkml-modeler-app/
├── packages/
│   ├── core/              # Shared React renderer (platform-agnostic)
│   │   └── src/
│   │       ├── canvas/    # ReactFlow nodes, edges, auto-layout
│   │       ├── editor/    # Property panel forms
│   │       ├── store/     # Zustand state slices
│   │       ├── io/        # YAML parse/emit, Git operations
│   │       ├── model/     # TypeScript types for the LinkML metamodel
│   │       ├── ui/        # shadcn/ui components, layout chrome
│   │       ├── validation/# Schema validation engine
│   │       └── platform/  # PlatformContext interface + provider types
│   ├── web/               # Web harness
│   │   └── src/
│   │       ├── main.tsx   # React entry point, App component
│   │       ├── platform/  # WebPlatform adapter (File System Access API, OPFS git)
│   │       └── editor/    # Web-specific panels (GitPanel)
│   └── electron/          # Electron harness
│       └── src/
│           ├── main.ts    # Electron main process (BrowserWindow, IPC handlers)
│           └── preload.ts # Context bridge (exposes electronAPI to renderer)
├── docs/
│   ├── design-spec.md     # High-level design specification
│   ├── user-guide.md      # End-user guide
│   └── development.md     # This file
├── tsconfig.base.json     # Shared TypeScript base config
├── pnpm-workspace.yaml    # pnpm monorepo workspace definition
└── package.json           # Root scripts and shared dev dependencies
```

---

## Architecture

### Platform abstraction

The `core` package has **zero** Electron or Node.js imports. All platform differences (file dialogs, filesystem access, Git backend) are hidden behind a `PlatformAPI` interface defined in `packages/core/src/platform/`.

A `PlatformContext` React context provides the active implementation to the whole component tree. The two concrete implementations are:

| Implementation | Location | Mechanism |
|---|---|---|
| `WebPlatform` | `packages/web/src/platform/WebPlatform.ts` | File System Access API, OPFS for Git via `@isomorphic-git/lightning-fs` |
| `ElectronPlatform` | `packages/web/src/platform/ElectronPlatform.ts` | Thin wrapper over `window.electronAPI` (IPC, defined in preload) |

The Electron main process (`packages/electron/src/main.ts`) registers `ipcMain` handlers that implement the same operations using Node.js `fs` and `isomorphic-git`.

### State management

All application state lives in a single [Zustand](https://github.com/pmndrs/zustand) store (`packages/core/src/store/`), split into slices:

| Slice | Responsibility |
|---|---|
| `projectSlice` | Active project, schema file list, active schema selection |
| `canvasSlice` | ReactFlow node/edge positions, layout, focus mode |
| `editorSlice` | Selected element, properties panel open state |
| `gitSlice` | Git status, staged files, commit/push state |
| `uiSlice` | Toast notifications, panel open/close flags, dialogs |
| `validationSlice` | Validation issues, last-validated schema hash |

Undo/redo is provided by [zundo](https://github.com/charkour/zundo), wrapping the Zustand store.

### Data flow

```
User action
  → Zustand store mutation (via slice action)
    → React re-render (component subscriptions)
      → Canvas / Properties Panel update
        → YAML serialization (via serializeYaml in io/)
          → YAML Preview / file save
```

### Adding a new feature

1. Define or extend types in `packages/core/src/model/`.
2. Add store state and actions to the relevant slice in `packages/core/src/store/`.
3. Build the UI in `packages/core/src/canvas/` or `packages/core/src/editor/`.
4. If the feature needs platform I/O, add a method to the `PlatformAPI` interface and implement it in both `WebPlatform` and `ElectronPlatform`.
5. Export any new public API from `packages/core/src/index.ts`.
6. Write tests in `packages/core/src/__tests__/`.

---

## TypeScript Configuration

| File | Purpose |
|---|---|
| `tsconfig.base.json` | Shared compiler options (ES2022, strict mode, bundler resolution) |
| `packages/*/tsconfig.json` | Package-level config extending the base |
| `packages/core/tsconfig.test.json` | Test-specific config (relaxed for Vitest/jsdom) |

The project targets `ES2022` with `"moduleResolution": "bundler"` — do not use CommonJS `require()` in `core` or `web` packages.

---

## Common Issues

### `pnpm install` fails with EACCES

Run `npm install -g pnpm` as your normal user (not root). See [pnpm installation docs](https://pnpm.io/installation).

### Electron window shows a blank page

Make sure the web dev server is running on port 5173 before launching Electron in dev mode. Check `NODE_ENV=development` is set.

### TypeScript errors after pulling changes

Rebuild the core package first — other packages depend on its compiled output:

```bash
pnpm --filter @linkml-editor/core build
```

### Tests fail with "Cannot find module"

Run `pnpm install` to restore any missing workspace symlinks, then rebuild core.
