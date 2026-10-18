# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| v1.0.x (web app) | Yes |
| Electron desktop build | No — experimental, not part of v1.0 supported surface |

## Scope

**v1.0 ships as a web app.** The desktop (Electron) build is included in the repository for community interest but is experimental and is not part of the v1.0 supported surface. Security disclosures for the Electron build are not in v1.0 scope and will be addressed in a future release.

This document covers the web platform security model for LinkML Visual Schema Editor.

---

## Trust Boundary 1 — OAuth Token Storage (T2 #9)

### Threat

A GitHub OAuth token with `repo` scope grants full read/write access to the
authenticated user's repositories. Storing this token in `localStorage` means
any JavaScript executing on the same origin (including injected XSS payloads)
can read it and exfiltrate repository access indefinitely.

### Chosen mitigation — no persistence (in-memory only)

**The web platform stores OAuth tokens exclusively in JavaScript heap memory
(a private `Map` on the `WebPlatform` instance).** Tokens are never written to
`localStorage`, `sessionStorage`, `IndexedDB`, cookies, or any other browser
persistence API.

Consequences:
- The token is cleared automatically when the browser tab is closed or the page
  is refreshed. Users must sign in again per browser session.
- XSS can still read an in-memory token during an active session. The defence
  against XSS is the application's Content Security Policy (planned for v1.1)
  and the absence of user-supplied script execution paths.
- On Electron, tokens are stored in the OS keychain via `keytar`, which is an
  appropriate native secret store for desktop environments.

### Residual risk

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| XSS reads in-memory token | Low (no script injection paths) | High | CSP (v1.1) |
| Token captured in browser memory snapshot | Very low | High | OS-level access control |

---

## Trust Boundary 2 — CORS Proxy (T2 #10)

### Threat

GitHub's API does not set CORS headers, so all remote git operations
(clone, push, pull) in the browser must route through a CORS proxy. The proxy
sees every HTTP request including the `Authorization: Bearer <token>` header
sent by isomorphic-git for authenticated operations (push, pull to private
repos). Using a **third-party** public proxy (e.g. `cors.isomorphic-git.org`)
means the token is disclosed to an untrusted intermediary.

### Chosen mitigation — no default proxy

**The web platform has no built-in CORS proxy default.** Remote git operations
return a clear error if `VITE_GIT_CORS_PROXY` is not set at build time.

Deployment administrators must make an explicit, informed choice:

1. **Self-host a CORS proxy** (recommended for production with private repos).
   Any HTTP reverse proxy that injects `Access-Control-Allow-Origin` headers
   works. Example: [isomorphic-git's cors-proxy](https://github.com/isomorphic-git/cors-proxy).
   Set `VITE_GIT_CORS_PROXY=https://your-proxy.example.com` at build time.

2. **Public repos only, accepting third-party visibility.**
   You may configure `VITE_GIT_CORS_PROXY=https://cors.isomorphic-git.org` for
   convenience when your repos are public and the token's repo-scope exposure is
   acceptable. Document this decision in your deployment runbook.

3. **Disable remote git features.**
   Omit `VITE_GIT_CORS_PROXY` entirely. Users can still edit and save schemas
   locally; only push/pull/clone fail with an explanatory error.

### Error message

When no proxy is configured, users see:

> Git remote operations require a CORS proxy. Configure `VITE_GIT_CORS_PROXY`
> in your deployment. See SECURITY.md.

### Residual risk

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Admin configures untrusted public proxy | Medium | High | Documented trust boundary above |
| Self-hosted proxy is compromised | Low | High | Standard proxy hardening |

---

---

## Electron IPC Hardening (Desktop Build)

The Electron desktop build is experimental and not part of the v1.0 supported surface, but the following hardening measures have been implemented.

### IPC Path Scoping

All IPC handlers that accept file-system paths from the renderer (`readFile`, `writeFile`, `listDirectory`, and all git operations) validate the path against an **allowed-roots set** before operating. A path is accepted only if it resolves (via `path.resolve`) to a location inside at least one registered root.

Roots are populated from:
- Paths returned by native OS file/directory picker dialogs (`openFile`, `saveFile`, `openDirectory`)
- Successful `gitClone` destination directories
- `app.getPath('documents')` — seeded at startup to allow clone operations to the default projects directory

Path comparison uses `path.relative` rather than `String.startsWith` to correctly reject sibling-prefix paths (e.g., `/foo/bar2` is not considered inside `/foo/bar`).

### URL Allowlist for `shell.openExternal`

URLs passed to `shell.openExternal` — both via the `shell:openExternal` IPC channel and via `window.open` in the renderer — are validated against an allowlist of safe schemes:

- `https:` — standard web
- `http:` — local/dev server
- `mailto:` — system mail client

All other schemes (`file:`, `javascript:`, `app:`, `data:`, `ftp:`, custom protocols) are blocked and logged to the console.

### DevTools Lockdown

The Chromium DevTools panel is disabled in packaged builds via `webPreferences.devTools: false`. This prevents users from injecting arbitrary JavaScript into the renderer process through the DevTools console. DevTools remain enabled in development mode (`app.isPackaged === false`).

### `gitCheckout` Per-File Path Validation

The `gitCheckout` IPC handler's filesystem fallback path (used when a file is untracked and must be deleted) resolves the per-file path against the validated repo root before calling `fs.unlink`, preventing a crafted relative path from deleting files outside the repository.

### Residual Risks and Future Work

| Risk | Status |
|------|--------|
| Symlink traversal (symlink inside allowed root points outside) | Not mitigated — `fs.realpath` resolution deferred to v1.1 |
| Per-file paths in `gitStage` / `gitUnstage` passed to isomorphic-git | Trusted to isomorphic-git's own relative-path handling |
| Credential exposure in memory (`credentialCache`) | In-process only; no IPC exposure |

---

## Reporting a Vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

For sensitive reports, email the maintainer directly at **labadorf@bu.edu** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if available)
- The version or commit SHA where the issue was observed

You can expect an acknowledgement within 3 business days. We will work with you on a coordinated disclosure timeline before any public announcement.

For non-sensitive reports (e.g., documentation gaps, low-severity hardening suggestions), opening a [GitHub issue](https://github.com/datahelix-platform/linkml-modeler-app/issues) with the `security` label is fine.
