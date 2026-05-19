# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinkML Visual Schema Editor — a cross-platform (web + Electron) graphical tool for authoring LinkML schemas on an ERD-style canvas. Monorepo managed with pnpm workspaces.

## Commands

```bash
# Development
pnpm dev                  # Web dev server (localhost:5173)
pnpm build                # Build core + web packages (Electron excluded; use build:all for desktop)
pnpm test                 # Run all Vitest tests
pnpm lint                 # ESLint across all packages
pnpm format               # Prettier formatting

# Single-package work
pnpm --filter @linkml-editor/core test        # Run only core tests
pnpm --filter @linkml-editor/core test:watch  # Watch mode for core tests

# Electron development (requires two terminals)
# Terminal 1: pnpm dev
# Terminal 2: pnpm --filter @linkml-editor/electron build && npx electron packages/electron/dist/main.js

# Electron packaging
pnpm --filter @linkml-editor/electron package          # All platforms
pnpm --filter @linkml-editor/electron package:linux    # Linux only

# Documentation (VitePress)
pnpm docs:dev
pnpm docs:build
```

## Development Workflow

**All contributors — human or agent — MUST follow this workflow.** It exists to keep history reviewable and revertible. Do not deviate without first discussing with the project owner.

### Branches

- **`main`** — stable. Releases are tagged here. Only dependency bumps, hotfixes, and `dev → main` promotion PRs land directly on `main`.
- **`dev`** — integration branch. All feature work merges here. Periodically promoted to `main` in batches.

### Starting a feature

1. **Every feature needs a GitHub issue first.** If one does not exist, create it with `gh issue create` before branching. Trivial fixes (typos, one-line corrections) may skip this and reference the PR alone.
2. **Branch from `dev`**, not `main`:
   ```
   git checkout dev && git pull
   git checkout -b feat/<issue#>-<short-slug>
   ```
   Examples: `feat/56-persistable-views`, `fix/72-layout-crash`, `chore/80-rename-foo`. Use `feat/`, `fix/`, `chore/`, or `docs/` as the prefix.
3. **One issue per branch.** Do not bundle multiple unrelated features into a single branch — it makes review and revert difficult.
4. If feature B genuinely depends on unmerged feature A, branch B from A's branch (stacked PR). Retarget B's PR to `dev` after A merges.

### Commits

- Use conventional-commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- Reference the GitHub issue: `Refs #56` on intermediate commits, `Closes #56` on the final commit (so the issue auto-closes when the PR merges).
- Write the *why* in the body, not just the *what*.

### Pull requests

- **Target `dev`**, never `main`, for feature work: `gh pr create --base dev`.
- Body must include `Closes #<issue>` (or `Refs #<issue>` if the PR is partial).
- One PR per branch, one feature per PR. If a PR grows to cover multiple features, split it before requesting review.
- **Merge strategy: squash.** Each merged PR becomes a single commit on `dev`. Use `gh pr merge --squash` or the squash option in the GitHub UI.
- Do not merge until CI is green.

### Dependency PRs (Dependabot, manual bumps, security patches)

- These target **`main` directly**, not `dev`. They are independent of feature work and should not be gated behind in-flight features.
- After any merge to `main`, sync `dev` from `main` (see next section).

### Keeping `dev` in sync with `main`

**This is critical.** Whenever `main` advances (dep merges, hotfixes), `dev` must be synced so feature branches are built against current dependencies. Do this:

- After every merge to `main`, or at least weekly.
- Always before opening a `dev → main` promotion PR.

```
git checkout dev && git pull
git merge main
# resolve any conflicts in dev
git push
```

Resolve conflicts in `dev`. Never force-push `main` to "fix" divergence.

### Promoting `dev → main` (releases)

A `dev → main` promotion is the **only event that produces a release tag**. Releases use **CalVer** (date-based), not SemVer. Compatibility signals live in release notes, not in the version number.

#### When to promote (cadence)

Promote when **any** of these triggers fire:

1. **2+ user-visible features** are merged to `dev` (closed issues, CI green, no known regressions).
2. **2 weeks have passed** since the last promotion (ships accumulated dep bumps and small fixes; prevents `dev` drift from `main`).
3. **A security or critical bug fix** is on `dev` and needs to ship immediately.

**Never promote** if:

- A known regression exists on `dev` and isn't fixed.
- A feature in-flight will land within ~24 hours (wait for it so the release is coherent).

**Agents propose, the project owner approves.** When triggers fire, the agent must:

1. Open a **draft** PR titled `release: v<YYYY.MM.DD>`.
2. Include proposed release notes in the body (see "Release notes" below).
3. Notify the owner that a release is ready for review.

Do **not** merge a promotion PR autonomously. Promotion is high-stakes — once tagged and out, you can't quietly un-ship.

#### Promotion checklist

Before opening the promotion PR:

1. Sync `dev` from `main`: `git checkout dev && git pull && git merge main && git push`. Resolve conflicts in `dev`.
2. Confirm CI is green on `dev`.
3. Bump the `version` field in each package's `package.json` to the new CalVer (e.g., `2026.5.19`). Commit on `dev` as part of the promotion PR.

After owner approves:

4. **Merge with a merge commit**, not squash. This preserves the per-feature commit history on `main`. (Feature PRs into `dev` use squash; the `dev → main` promotion PR is the one exception.)
5. Tag the merge commit on `main`:
   ```
   gh release create v2026.05.19 --target main --generate-notes --title "v2026.05.19" --notes-file release-notes.md
   ```

#### Release tag format (CalVer)

- **Git tag**: `vYYYY.MM.DD` with two-digit month and day — e.g., `v2026.05.19`, `v2026.11.03`.
- **`package.json` `version`**: same date without leading zeros — e.g., `2026.5.19`, `2026.11.3`. This is valid SemVer (MAJOR=2026), so npm/pnpm/electron-builder all accept it cleanly.
- **One tag per promotion**, on the merge commit on `main`.
- **Same-day re-release** (emergency hotfix only): append `-1`, `-2` as a SemVer prerelease suffix, e.g., `v2026.05.19-1` and `package.json` `2026.5.19-1`. Avoid by policy — prefer to roll to the next day.

#### Release notes

Because CalVer carries no compatibility signal, **release notes carry it instead**. Each promotion PR body includes a curated notes block:

```markdown
## v2026.05.19

### Features
- Persistable named views (#56)
- Outline rendering mode (#61)

### Fixes
- ...

### Breaking changes
- ...  (or: "None")

### Dependencies
- ...  (omit if no bumps)
```

The **Breaking changes** section must be explicit. It includes: changes to `.linkml-editor.yaml` manifest format, removed or renamed user-facing features, required migrations, and any change that would make a working older project misbehave on the new version. Agents must flag these candidates when drafting notes; owner makes the final call.

After merge, `gh release create --notes-file` uses the curated notes as the GitHub release description.

### Do not

- Open feature PRs against `main`.
- Bundle multiple unrelated features into one branch or PR.
- Force-push shared branches (`main`, `dev`).
- Merge without green CI.
- Use `--no-verify`, `--no-gpg-sign`, or other hook-skipping flags unless explicitly asked.

## Architecture

### Monorepo Layout (4 packages)

- **`packages/core`** — Platform-agnostic shared library. Contains all React components, Zustand state, LinkML model, YAML I/O, validation, and canvas rendering. This is where most development happens.
- **`packages/web`** — Vite web build harness. Provides `WebPlatform` (File System Access API + isomorphic-git over OPFS) and the app entry point (`main.tsx`).
- **`packages/electron`** — Electron main process. Provides IPC handlers implementing PlatformAPI via Node.js fs + isomorphic-git. Preload script bridges to renderer.
- **`packages/docs`** — VitePress documentation site.

### Platform Abstraction

The `PlatformAPI` interface (`packages/core/src/platform/PlatformContext.ts`) defines file I/O and git operations. Two implementations exist:
- `WebPlatform` (`packages/web/src/platform/WebPlatform.ts`) — browser APIs + isomorphic-git/lightning-fs
- `ElectronPlatform` (`packages/web/src/platform/ElectronPlatform.ts`) — thin IPC bridge to electron main process

The active platform is provided via React context. All file/git operations go through this abstraction.

### State Management

Zustand store (`packages/core/src/store/index.ts`) composed of 6 slices: Project, Canvas, Editor, Git, UI, Validation. Undo/redo via zundo middleware (tracks schema state only, 50-item history).

### Key Modules in Core

- **`model/`** — TypeScript types mirroring LinkML metamodel (ClassDefinition, SlotDefinition, EnumDefinition, etc.)
- **`io/yaml.ts`** — YAML round-trip parsing/serialization. Preserves unknown fields via `extras` map.
- **`io/importResolver.ts`** — Resolves LinkML `imports:` directives, builds dependency graph.
- **`canvas/`** — ReactFlow canvas: custom ClassNode/EnumNode, ELK-based auto-layout (`autoLayout.ts`), schema-to-graph derivation (`deriveGraph.ts`).
- **`editor/`** — Properties panel, project panel, validation panel.
- **`validation/`** — Schema validation producing errors and warnings.

### Electron Build

Electron bundles the web dist as `extraResources` and serves it via a custom `app://` protocol (not `file://`). The electron-builder config is in `packages/electron/package.json`.

## Tech Stack

- React 18, TypeScript 5.4, Vite 5, Vitest (jsdom)
- ReactFlow 11 (canvas), Zustand 4 (state), js-yaml (YAML), elkjs (auto-layout)
- shadcn/ui (Radix + Tailwind) for UI primitives
- isomorphic-git + lightning-fs (browser git), keytar (desktop credentials)
- Electron 30, electron-builder 25

## Requirements

- Node.js >= 20.0.0
- pnpm >= 9.0.0
