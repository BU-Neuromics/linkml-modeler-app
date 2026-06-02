# Changelog

## [1.1.0] - 2026-06-02

First feature release since the v1.0 OSS launch. Bundles the large-schema UX sprint (12 features), the new Display Panel / Canvas Views workflow with guided tours, per-view and per-subset canvas layout persistence, and a security-hardening pass on transitive dependencies. The web build remains the primary distribution; Electron desktop stays on the future-enhancement track.

### Added

#### Large-schema UX sprint (A1–D1, #86)

- **Named views (A1)**: persistable named views — save, switch, duplicate, and delete curated canvas views; the active view and its per-view node layout persist in `.linkml-editor.yaml` (#69)
- **Outline / tree view (A2)**: alternate tree-based rendering mode for navigating large schemas (#72)
- **Selection neighborhood operations (A3)**: grow and shrink the selection by graph neighborhood (#71)
- **Subset editing (A4)**: inline subset-membership editor backed by store mutations (#85)
- **Display Panel sidebar (B0)**: dedicated sidebar for display and visibility controls (#70)
- **Range-edges mode (B1)**: show / inline / auto rendering for range edges (#78)
- **Edge-type filters (B2)**: hide edge types by kind; hidden edges are also removed from ELK auto-layout (#80)
- **Hop-distance dimming (B3)**: dim nodes by graph distance from the current selection (#81)
- **Dissolve ghost-node grouping (B4)**: remove the `importGroup` compound grouping for cleaner imported-entity layout (#68)
- **Command Palette (C1)**: Cmd-K / Ctrl-K command palette for quick actions (#75)
- **Tabular bulk edit (C2)**: `TableView` spreadsheet component for bulk attribute and slot editing (#79)
- **Import-source clustering (D1)**: swimlane background tinting that clusters entities by import source (#82)

#### Display Panel, Canvas Views & guided tours

- **Display Panel & Canvas Views**: expanded Display Panel with canvas view-mode switching (#104)
- **Guided tours**: driver.js help tours covering the Views & Subsets workflows (#104)
- **Per-view & per-subset canvas layouts**: node positions are now preserved per named view and per subset, persisted via a new optional `subsetLayouts` field in `.linkml-editor.yaml` (#106)

### Fixed

- **Display Panel**: panel content now scrolls when it is taller than the viewport (#108)

### Security

- Patched 9 of 10 transitive-dependency advisories via pnpm `overrides` (#98)

### Documentation

- New docs pages: Display Panel, View Modes, and Named Views & Subsets (#102)

### Dependencies

- Maintenance bumps since v1.0.0, including zustand 4 → 5, Electron 42.2.0, Vite 8.0.14, Vitest 4.1.7, isomorphic-git 1.38.1, and lucide-react 1.17.0, plus routine Dependabot updates.

### Breaking changes

- None. The new `subsetLayouts` field in `.linkml-editor.yaml` is optional and additive: projects created by older versions open unchanged, and the field is ignored by builds that do not understand it.

## [1.0.0-rc.1] - 2026-05-01

Release candidate for v1.0 — first public OSS launch. Web build is the primary distribution; Electron desktop is descoped from v1.0 and remains as a future-enhancement track.

### Added

- **OSS hygiene**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub issue templates (bug, feature, config), and pull request template (PTS-109)
- **CI**: All GitHub Actions `uses:` references pinned to commit SHAs (PTS-105)
- **QA**: Coverage thresholds now enforced with realistic floors; broken per-glob config repaired (PTS-110)

### Changed

- **Core build**: `pnpm build` excludes `@linkml-editor/electron` by default; Electron build is opt-in via `pnpm build:all` or `package:electron` scripts
- **CI**: `electron-build.yml` is now `workflow_dispatch` only — no Electron artifacts ship from tag pushes (PTS-105)
- **Docs**: README hero, Quick Start, and feature narrative are web-first; Electron documented as an "Experimental" desktop track (PTS-109)
- **Security**: OAuth tokens kept in-memory only (no `localStorage` persistence); default CORS proxy removed — opt-in via `VITE_GIT_CORS_PROXY` (PTS-108)

### Fixed

- **Build**: 13 TypeScript `TS6133` unused-import errors in Properties panel and YAML fixture generators resolved (PTS-107)
- **Live demo**: `/app/` GitHub Pages route now returns 200 — `deploy-docs.yml` builds `core` before `web` so the web bundle has its workspace dependency present at deploy time (PTS-105)
- **Accessibility**: Slot, rule, and permissible-value collapsibles in the Properties panel are now native `<button>` elements with full keyboard activation (PTS-107)
- **Round-trip**: `TypeDefinition.base` and `repr` are preserved through YAML load/save (PTS-106)
- **Round-trip**: Schema-level slot `is_a` and `mixins` are preserved through YAML load/save (PTS-106)
- **Validation**: Schema-level slot `range` references are now checked against the class/type/enum namespace (PTS-106)

### Deferred to v1.1+

- Code signing / notarization for desktop installers (Tier 3 #14) — moot for v1.0 since no installers ship; reopens if Electron is re-scoped
- Electron 30 → 38+ runtime CVE upgrade (Tier 3 #15) — moot for v1.0 since `electron-build.yml` is dormant; reopens if Electron is re-scoped
- Electron IPC path validation (Tier 2 #11) and Electron CloudPlatform auto-sync keytar / `_onAuth` fix (Tier 2 #12) — Electron-only; tracked with the future-enhancement Electron track

## [0.4.3] - 2026-04-08

### Fixed

- Allow clearing is_a relationship (by @clandaverde)

## [0.4.2] - 2026-04-08

### Fixed

- **Git Panel**: "Unstage" checkbox and "Unstage all" button now actually remove files from the git index (previously only cleared in-memory state, leaving staged files unchanged)
- **Git Panel**: Revert button (↺) now also appears on staged files, allowing discard of both staged and working-directory changes in one click
- **Git Panel**: Added `gitUnstage` operation across all platforms (web, electron, cloud) using `git.resetIndex`

## [0.4.1] - 2026-04-08

### Added

- **Help**: App version number now displayed in the Help > About dialog

## [0.4.0] - 2026-04-08

### Added

- **Git Panel**: Revert (discard) individual file changes directly from the Git panel — each unstaged file now shows a ↺ button, and a "Revert all" button discards all unstaged changes at once; both prompt for confirmation before executing

## [0.3.2] - 2026-04-08

### Added

- **Editor**: Rules block support for classes in the properties panel
- **Canvas**: Inherited slots now displayed on class nodes

## [0.3.1] - 2026-04-08

### Added

- **Editor**: Mixins field in the class properties panel for assigning mixin classes

### Fixed

- **Editor**: Restored "Delete attribute" label in the attributes panel (was previously blank)

## [0.3.0] - 2026-04-08

### Added

- **Editor**: Schema-level slot definitions with full UI — create, edit, and delete slots at the schema level; slots display in a dedicated panel with badge indicators on class nodes
- **Editor**: Attribute and slot names are now editable inline after creation
- **Editor**: Prefixes section in the schema properties panel for managing namespace prefix declarations
- **Help**: Driver.js guided tours accessible from the Help menu to walk users through key editor workflows

### Fixed

- **Deployment**: nginx `try_files` fallback now uses a `BASE_PATH`-relative path for correct SPA routing when deployed under a sub-path
- **Tests**: Restored passing test suite after driver.js and localStorage regressions

## [0.2.0] - 2026-04-07

### Added

- **Git panel**: Initialize a git repo from the UI, set remote URL, configure author name/email, store GitHub username and token credentials persistently
- **Git panel**: Auto-populate remote URL, author name, and email from the existing git config when opening settings
- **Cross-schema imports**: Schema properties panel now has an Imports section for adding local file and URL imports with live resolution
- **Cross-schema imports**: Range and `is_a` dropdowns include entities from imported schemas; connecting to a ghost node or selecting a cross-schema value automatically adds the required import
- **Canvas**: Ghost nodes (imported entities referenced by the active schema) are now draggable; their positions are persisted in `.linkml-editor.yaml`
- **Canvas**: Imported entity groups are collapsible via click and draggable as a unit using ReactFlow parent-child nodes
- **Canvas**: Entity search panel with instant filtering, accessible via the 🔍 button in the project panel header
- **Canvas**: Range and `is_a` dropdowns are filterable by typing
- **Project panel**: Split into two sections — local schema files (top) and a collapsible Imports section (bottom) listing transitively imported schemas
- **Project panel**: Clicking an imported schema opens it in the canvas in read-only mode; add/delete/connect operations and context menus are disabled; a "Read Only" banner is shown
- **Properties panel**: Shows a read-only notice when the active schema is an imported schema
- **Canvas layout**: Canvas positions and schema visibility are persisted to `.linkml-editor.yaml` for all schemas (local and imported)
- **New Schema dialog**: Create a blank YAML schema file within an open project
- **Schema file import**: Import an existing YAML file into the current project via the File menu
- **Project switcher**: Switch between recent projects without returning to the splash screen
- **Git pull**: Pull latest changes for URL-linked (cloned) projects
- **Git clone**: Friendly error messages for common failure cases (auth, not found, network)
- **Deployment**: `packages/proxy` — self-contained CORS proxy wrapping `@isomorphic-git/cors-proxy` for browser git operations; configurable via `PORT` and `ALLOW_ORIGIN` env vars
- **Deployment**: `deploy/web` — Docker Compose recipe with nginx (SPA routing + `/cors-proxy/` reverse proxy) and the proxy service; `VITE_GIT_CORS_PROXY` build-time env var to point at any proxy

### Fixed

- **Cross-schema**: `is_a` and range values referencing entities in other loaded schemas now automatically add the missing import to the active schema
- **Cross-schema**: URL-sourced imported schema paths were being mangled by the relative import helper; URL schemas are now returned as-is
- **Canvas**: Ghost nodes were not appearing for classes that referenced imported entities via `is_a`
- **Canvas**: Ghost node visibility and entity search result ordering improved (sorted by reference frequency)
- **Canvas**: `is_a` and range dropdowns now populate from all schemas in the project, not just the active one
- **Electron**: Credential key mismatch caused 401 Unauthorized on git push and pull; fixed to match the key written by `storeCredential`
- **Electron**: Missing `PlatformAPI` methods (`gitCreateRepo`, `gitSetRemote`, `gitReadConfig`) implemented in the Electron main-process platform
- **Web**: Buffer polyfill alias added to Vite config to fix Windows Electron build failures
- **Web**: Project title in the panel header showed the full directory path on Windows; now shows only the directory name on all platforms
- **Web**: "Open Project" from the splash page now correctly returns to the splash on cancel; Electron project storage path corrected
- **Web**: Git availability flag in the store was not set after clone or open-project
- **Web**: `onNewProject` and `onOpenProject` callbacks in `MenuBar` were not wired up

## [0.1.3] - 2026-04-03

### Added

- **Editor**: Show imported schema classes and enums in range slot dropdown

### Fixed

- **Canvas**: Change multi-select modifier key from Ctrl to Shift
- **Canvas**: Group imported schema classes in collapsible containers to prevent overlap

## [0.1.2] - 2026-04-02

### Fixed

- **Electron**: Serve web assets via custom `app://` protocol instead of `file://`. ES module scripts are blocked by Chromium's CORS policy when loaded from `file://` URLs, which caused the blank page on all platforms. The custom protocol is registered as privileged with full CORS and fetch API support.

## [0.1.1] - 2026-04-02

### Fixed

- **Electron**: Use relative asset paths (`./assets/...`) for `file://` protocol compatibility. The packaged Electron app was showing a blank page because Vite generated absolute asset paths that resolve to the filesystem root under the `file://` protocol.

## [0.1.0] - 2026-03-31

Initial release of LinkML Modeler as a desktop application.

### Added

- Visual schema editor with drag-and-drop class and enum creation
- Canvas-based editing with ReactFlow
- YAML round-trip parsing and serialization for LinkML schemas
- Edge attribute editing for range-edge slot properties
- Git integration (status, stage, commit, push) via isomorphic-git
- Electron desktop packaging for Linux, macOS, and Windows
- MIT license
