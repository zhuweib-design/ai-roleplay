<div align="center">

<p><b><a href="README.md">简体中文</a> · <a href="README-EN.md">English</a></b></p>

# 🍺 AI 酒馆 (AI Tavern)

**An AI role-playing chat app built on the SillyTavern architecture: multi-model chat · character cards · world books · group chat · story engine · community market · custom themes · custom vector-model RAG · Virtual Character OS Runtime**

[![Version](https://img.shields.io/badge/version-1.1.1-blue.svg)](https://github.com/zhuweib-design/ai-roleplay/releases/tag/v1.1.1)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-42b883.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)]()
[![Tauri 2](https://img.shields.io/badge/Tauri-2.0-24c8db.svg)]()

</div>

---

## 📑 Table of Contents

- [Introduction](#-introduction)
- [✨ Features](#-features)
- [🖼️ Preview](#-preview)
- [🚀 Quick Start](#-quick-start)
- [🧠 Virtual Character OS Runtime](#-virtual-character-os-runtime)
- [⚙️ Tech Stack](#-tech-stack)
- [🛣️ Roadmap](#-roadmap)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [More](#-more)

## 💡 Introduction

> AI 酒馆 (AI Tavern) is an AI role-playing chat app: chat with your own characters, build world settings, run multi-character group chats, and drive the plot with a story engine. It runs in the browser and also ships as a native Tauri 2 desktop app (system tray, global shortcuts, drag-and-drop import).

Built for role-playing and narrative creation, **AI 酒馆** focuses on more than just "generating a reply" — it provides a coherent, character-first storytelling workflow: from a single character's personality and opener, to turn scheduling across a group chat, to story-arc progression.

- **Story-first, not Q&A**: a keyword-gated Lorebook keeps world settings alive and injects them into context for long-term consistency; the story engine handles script structure, protagonist setup, time progression, and random events.
- **Deeply customizable**: upload a background image to auto-extract a theme palette, or add your own vector model via ZIP / local folder, with RAG semantic retrieval surfacing relevant memory into context.
- **Privacy & local-first**: run local models offline through WebLLM without an API key; API keys are encrypted at rest and the master password is never stored locally.

**Use cases**: role-players building long-running world sagas · privacy-focused users who prefer offline chat · developers exploring RAG-style semantic memory in character-driven apps.

> See Features, Tech Stack, Security below.

## ✨ Features

| Feature | What it solves |
| --- | --- |
| **Multi-model chat** | Multiple profiles (OpenAI / Anthropic …) with streaming, regenerate, translation, TTS, summarization |
| **Inner monologue (narration)** | `⟦ … ⟧` written by the model renders **outside** the bubble, typeset apart from speech; configurable first-person for the user; copy / TTS / translate / export strip the markers |
| **Custom vector model + RAG** | Add vector models via ZIP or local folder to drive dynamic-memory / static-world semantic retrieval |
| **Custom themes** | Background-image color extraction (k-means) auto-matches component palettes, incl. light/dark & "theatre" font |
| **Worldbook / Lorebook** | Keyword-gated activation, settings auto-injected into context |
| **Character cards & group chat** | Batch card import (up to 50 per batch), Persona, member/turn control, random NPCs |
| **Virtual Character OS Runtime** | Batch characters, 2–8 member model-backed group chat, per-member Context/Event, PostgreSQL transactions, version CAS, replay audit |
| **Story engine** | Script analysis, protagonist config, time progression, random events |
| **Community market** | GitHub-indexed templates / cards / lorebooks with hash check & offline fallback |
| **Extension system** | Sandboxed execution, permission-gated (deny by default), not auto-run |
| **Desktop enhancements** | System tray, global shortcut (`Ctrl+Alt+Space`), drag-drop import, offline banner |
| **Mobile and Android shell** | Bottom navigation, composer that grows with input and avoids the soft keyboard, long-press message action bar, narrow-screen labels no longer squeezed one glyph per line; `node scripts/android-apk.mjs` builds a debug APK (installers stay out of git and are not hosted on GitHub Releases either - build locally when needed) |

## 🖼️ Preview

<!-- Screenshots / demo GIF to be added here. Do not insert invalid image links. -->

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Frontend dev (runs in browser)
npm run dev

# Native desktop dev (Tauri)
npm run tauri:dev

# Build frontend
npm run build
```

### Local quality gates

The gate list has a single source of truth: the `quality-gates` job in `.github/workflows/ci.yml`. Walk the whole list locally, in that order:

```bash
npm run lint                  # ESLint (no new errors; existing warnings stay)
npm run runtime:db:schema:check  # Runtime schema drift (migrations vs code)
npm run snapshot:migration:check # Snapshot migration plan
npm run i18n:check:strict     # i18n strict scan (no hardcoded Chinese; zh/en key parity)
npm run eval:manifest        # Eval manifest self-check (strict)
npm run check:css-conventions # CSS guard: breakpoints / viewport / hover / !important ratchet / I-7 font size
npm run check:file-size       # Per-file line-count ratchet (over 1000 lines fails; whitelisted files may only shrink)
npm run check:control-size    # Control height literals ratchet (heights must come from --size-control-* tokens)
npm run check:primitives      # Shared primitive guard (copying a rule that already exists in primitives.css fails)
npm run check:save-blob       # Exports go through the single saveBlob entry point (baseline 0)
npm run check:no-artifact     # Installers and large binaries must not enter git
npm run check:no-release-assets # GitHub Releases must carry zero assets (needs network; it fails as "undecidable" when the API is unreachable)
npm run check:token-baseline  # Token dead-reference ratchet
npm run a11y:contrast         # Contrast audit (semantic pairs >= AA 4.5:1; legacy baseline is a zero-headroom ratchet)
npm run test:coverage         # Vitest + coverage (statements 78 / branches 73 / functions 78 / lines 78)
npm run build                 # vue-tsc + vite production build
npm run check:csp             # CSP contract guard (must run after build)
npm run check:ort             # ORT first-screen isolation guard (must run after build)
```

> A 2026-10-16 lesson: a `.load-earlier-btn:hover` violation reached `master` because local verification only ran the familiar subset. Walk the full `ci.yml` step list; treat CI's 4 parallel E2E groups as the E2E verdict (the local full serial run takes ~15 minutes and is memory-hungry).

> CI (`.github/workflows/ci.yml`) has three jobs. `quality-gates` (ubuntu-latest, with a postgres:16 service) runs, in order: dependency audit (high and above) → lint → runtime schema drift → snapshot migration plan → i18n strict → eval manifest self-check → CSS conventions guard (breakpoints / viewport / hover / `!important` ratchet / editable control font size I-7) → per-file line-count ratchet → control-height literal ratchet → shared-primitive guard → save-blob guard (+ self-test) → no-artifact-in-git guard (+ self-test) → no-release-assets guard (+ self-test) → token dead-reference ratchet (+ self-test) → contrast audit (+ self-test) → test and coverage gate (78/73/78/78; the same step carries the real PostgreSQL integration cases, so no duplicate job) → build → CSP guard → ORT first-screen guard. `e2e` runs Playwright in 4 weight-balanced groups derived from measured single-worker durations (`e2e/shard-groups.mjs`, guarded by a "every spec belongs to exactly one group" census test), chromium for desktop and the Pixel 5 viewport, webkit as the Safari-class engine. `tauri-build` checks that the desktop release binary compiles (`--no-bundle`; no installer is built or uploaded). GitHub Releases keep only the automatically generated source archives.

**Runtime changes (`src/runtime/`, `migrations/`) add:**

```bash
npm run runtime:db:schema:check  # migration vs. authoritative schema drift check
npm run typecheck                # Runtime types and contract check
```

## 🧠 Virtual Character OS Runtime

AI Tavern ships with Virtual Character OS: a deterministic state machine for long-term character evolution instead of letting the LLM rewrite state freely. It uses local snapshots (IndexedDB / Tauri file storage) by default and switches to a PostgreSQL transactional boundary when a server runtime URL is configured.

| Capability | Description |
| --- | --- |
| **Batch characters** | Import up to 50 character cards per batch with per-item created / already-exists / validation results; stable character IDs make retries non-destructive |
| **Multi-character group chat** | 2–8 members with natural rotation or designated speakers; each member keeps an independent Runtime Context and event stream |
| **PostgreSQL persistence boundary** | Tenant-scoped group, member and public turn tables; group turns plus each member's Event, projection, Snapshot and Audit commit in one transaction |
| **Concurrency and consistency** | Character-level and group-level version CAS; group definition conflicts return an explicit 409 instead of silently overwriting members |
| **Replay and audit** | Deterministic reducer plus `replayRuntimeEvents`, replaying by event time and input order for state repair and offline audit |
| **Reliable retry** | Failed remote group turns enter a local pending queue and retry idempotently with the same stable turn ID, without regenerating replies or duplicating events |

### Enabling the server runtime

```bash
# 1. Apply the schema migration
psql "$DATABASE_URL" -f migrations/001_virtual_character_os.sql

# 2. Verify the migration and the authoritative schema doc have not drifted
npm run runtime:db:schema:check
```

Setting `VITE_RUNTIME_BASE_URL` switches chat and group chat to the server Runtime HTTP API; leaving it unset keeps the existing local snapshot behaviour.

```bash
# Inject at frontend build time (.env.local or a CI variable)
VITE_RUNTIME_BASE_URL=https://runtime.example.com npm run build
```

```ts
// Server composition entry point (tenantId must come from auth middleware)
const handler = createPgPoolRuntimeHttpHandler(pool, tenantId);
```

Server routes:

```text
GET    /v1/runtime/health
POST   /v1/runtime/characters
POST   /v1/runtime/characters/batch
GET    /v1/runtime/characters/:id
POST   /v1/runtime/characters/:id/events
POST   /v1/runtime/characters/:id/turns
POST   /v1/runtime/characters/:id/context
POST   /v1/runtime/groups
GET    /v1/runtime/groups/:id
GET    /v1/runtime/groups/:id/turns
POST   /v1/runtime/groups/:id/turns
POST   /v1/runtime/groups/:id/context
POST   /v1/runtime/groups/:id/members
DELETE /v1/runtime/groups/:id/members/:characterId
```

Design and verification records: [`docs/design/virtual-character-os-实现基线.md`](docs/design/virtual-character-os-实现基线.md) and [`docs/design/virtual-character-os-多角色群聊实施计划.md`](docs/design/virtual-character-os-多角色群聊实施计划.md).

> Production deployment still requires your own authentication, gateway routing, migration backup and rollback drills; this repository provides the Runtime boundary, schema and verifiable implementation, not a production auth host.

## ⚙️ Tech Stack

| Layer | Tech |
| --- | --- |
| Frontend | Vue 3 · TypeScript · Vite · Vue Router · Pinia |
| Desktop | Tauri 2.0 (native wrapper + web fallback) |
| Local models | onnxruntime-web (embeddings) · WebLLM (local LLM engine) |
| Security / render | DOMPurify (XSS sanitize) · gpt-tokenizer · marked · fflate |
| Quality / tests | Vitest · Playwright · axe-core · ESLint |

### Directory (highlights)

```
src/core/            Core logic (RAG, embeddings, theme, market, extensions…)
src/runtime/         Virtual Character OS Runtime (events/state/context, replay, PostgreSQL and group transactions)
src/stores/          Pinia stores (chat, settings, user vector models…)
src/components/      Components (chat, settings, common Modal/Icon…)
src/views/           Views
src/i18n/locales/    zh / en
src-tauri/           Tauri shell (tray, shortcut, capabilities/ACL)
tests/               Unit / a11y / E2E
```

## 🛣️ Roadmap

Order rule: **newest version first**, same as `CHANGELOG.md`. When a release ships, add its line at the
top of this list; capabilities that span versions go in the "Capability tracks" block below, never
between version numbers.

- [x] **1.1.1** — patch: the About page now shows the real version (build-time injection), one-off probe scripts moved out of the product gates (complete, no data migration)
- [x] **1.1.0** — usable on phones, inner-monologue narration, injection visibility, derived token budgets, Android packaging and engineering guardrails (complete, no data migration)
- [x] **1.0.0** — first stable release (complete)
- [x] **0.9.0** — one local user account with world-specific roleplay profiles (complete)
- [x] **0.8.0** — Runtime memory confirmation, rejection, disabling, and replayable review events (complete)
- [x] **0.7.0** — memory validity windows and auditable runtime context sources (complete)
- [x] **0.6.0** — deterministic appraisal, behavior planning, and configurable long-term state decay (complete)
- [x] **0.5.0** — full-text search, historical message navigation, and virtualized-window integration for long chats (complete)
- [x] **0.4.0** — local long-term memory persistence, incremental dual-channel vector RAG, conversation summaries and context status (complete)
- [x] **0.3.1** — Runtime and group chat productionization: tenant/member authorization, server-side reliable outbox, group definition CAS conflict recovery, state inspector and replay self-check (released)
- [x] **0.3.0** — Runtime and group chat MVP: cross-device group history, reliable outbox, conflict recovery, Runtime state inspector (released)
- [x] **0.2.0** — custom vector model + RAG, custom themes, market, tray/shortcut (released)

Capability tracks (they span versions and are not version numbers):

- [x] **Virtual Character OS Runtime** — batch characters, multi-character group chat, PostgreSQL transactions, version CAS and replay audit (landed)
- [x] **RAG** — stopword filtering, installed-model selection and recall@3 benchmark (complete)
- [x] **A11y** — runtime contrast pre-check for custom themes (complete)

## 🤝 Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) (includes acknowledgements to core open-source projects). Basic flow: `Fork → feature branch → PR`; for larger changes, please open an Issue first.

## 📄 License

This project is open-sourced under the **Apache License 2.0**. See [LICENSE](LICENSE).

## 📚 More

- [Deployment](#deployment)
- [Release notes](#release-notes)
- [Security & Privacy](#-security--privacy)

### Deployment

- **Web (static hosting)**: full procedure in [`docs/dev/web-deployment-sop.md`](docs/dev/web-deployment-sop.md) - pre-deploy checklist, the 6 hard requirements (HTTPS / `frame-ancestors` header / **`.wasm` MIME** / SPA fallback exclusion / caching policy / shipping without source maps), concrete Nginx / Caddy / Vercel / Netlify / object-storage+CDN configs, a 12-item post-deploy checklist and the known traps.
  Before deploying run `npm run build && npm run check:csp`, then `npm run csp:audit` under `vite preview` (per-route CSP violations + negative control + WASM/blob Worker capability probe).
- **Desktop (Tauri)**: releases never upload installers; build locally with `npm run tauri:build`. GitHub Releases keep only the source archives.
- **Android (Capacitor shell)**: `node scripts/android-apk.mjs` builds a debug APK in one command (needs JDK 21 and the Android SDK on the machine, with `sdk.dir` set in `android/local.properties`). Installers are kept out of the repository by `.gitignore` plus the no-artifact guard, and are **not hosted on GitHub Releases** either - the no-release-assets guard fails if any Release carries an asset. Build from source when you need a device package. The native shell disables the Service Worker at build time (otherwise an overwrite install would not take effect); real-device debugging uses Chrome 133 WebView + CDP. Why everything was withdrawn, which 7 assets came down, and how to re-verify: [`docs/dev/installer-distribution-2026-10-19.md`](docs/dev/installer-distribution-2026-10-19.md).

### Release notes

- **1.1.1**: see [`docs/dev/release-notes-1.1.1.md`](docs/dev/release-notes-1.1.1.md) - why a patch release was cut instead of folding the fix into the published `v1.1.0` tag, the verification readings and the items still open.
- **1.1.0**: see [`docs/dev/release-notes-1.1.0.md`](docs/dev/release-notes-1.1.0.md) for this release's user-visible changes, data compatibility and verification readings, and [`docs/dev/release-evidence-1.1.0.md`](docs/dev/release-evidence-1.1.0.md) for the per-gate evidence.
- **1.0.0**: see [`docs/dev/release-notes-1.0.0.md`](docs/dev/release-notes-1.0.0.md) for the stable release boundary and verification results. Previous: [`docs/dev/release-notes-0.9.0.md`](docs/dev/release-notes-0.9.0.md).
- **0.4.0**: see [`docs/dev/release-notes-0.4.0.md`](docs/dev/release-notes-0.4.0.md) for new capabilities, data compatibility and validation results.
- **0.3.1**: see [`docs/dev/release-notes-0.3.1.md`](docs/dev/release-notes-0.3.1.md) for new capabilities, upgrade steps and known limitations.
- **0.3.0**: see [`docs/dev/release-notes-0.3.0.md`](docs/dev/release-notes-0.3.0.md) for new capabilities, upgrade steps and known limitations.
- **Database migration drill**: see [`docs/dev/runtime-database-migration-runbook.md`](docs/dev/runtime-database-migration-runbook.md).

### Security & Privacy

- Least-privilege client: capabilities only `core:default`; updater, `fs/shell/http/dialog/os` permissions are not enabled
- Tightened CSP: `script-src 'self'`, `freezePrototype` enabled
- API keys encrypted at rest (PBKDF2 + AES-GCM); master password never stored locally
- GitHub Releases contain only the automatically generated source archives; no installer of any kind (desktop or Android) and no updater manifest is uploaded - `check:no-release-assets` enforces it, so build the app locally from source
