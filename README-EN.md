<div align="center">

<p><b><a href="README.md">简体中文</a> · <a href="README-EN.md">English</a></b></p>

# 🍺 AI 酒馆 (AI Tavern)

**An AI role-playing chat app built on the SillyTavern architecture: multi-model chat · character cards · world books · group chat · story engine · community market · custom themes · custom vector-model RAG**

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/zhuweib-design/ai-roleplay/releases/tag/v0.2.0)
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
- [⚙️ Tech Stack](#-tech-stack)
- [🛣️ Roadmap](#-roadmap)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [More](#-more)

## 💡 Introduction

> AI 酒馆 (AI Tavern) is an AI role-playing chat app: chat with your own characters, build world settings, run multi-character group chats, and drive the plot with a story engine. It runs in the browser and also ships as a native Tauri 2 desktop app (system tray, global shortcuts, drag-and-drop import, auto-update).

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
| **Custom vector model + RAG** | Add vector models via ZIP or local folder to drive dynamic-memory / static-world semantic retrieval |
| **Custom themes** | Background-image color extraction (k-means) auto-matches component palettes, incl. light/dark & "theatre" font |
| **Worldbook / Lorebook** | Keyword-gated activation, settings auto-injected into context |
| **Character cards & group chat** | Card import, Persona, member/turn control, random NPCs |
| **Story engine** | Script analysis, protagonist config, time progression, random events |
| **Community market** | GitHub-indexed templates / cards / lorebooks with hash check & offline fallback |
| **Extension system** | Sandboxed execution, permission-gated (deny by default), not auto-run |
| **Desktop enhancements** | System tray, global shortcut (`Ctrl+Alt+Space`), drag-drop import, offline banner, auto-update |

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

Commands mirror CI; run them locally before committing:

```bash
npm run lint          # ESLint (0 errors)
npm run typecheck     # vue-tsc --noEmit
npm run test          # Vitest unit tests
npm run test:coverage # Coverage (statements ≥78 / branches ≥73)
npm run i18n:check:strict # i18n strict scan
npm run a11y:contrast # Accessibility contrast (≥ AA 4.5:1)
npm run tauri:build   # Desktop build check
```

> CI (`.github/workflows/ci.yml`) runs lint → i18n → coverage/build → contrast → Playwright e2e → Tauri build; `v*` tags or manual trigger produce signed installers.

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
src/stores/          Pinia stores (chat, settings, user vector models…)
src/components/      Components (chat, settings, common Modal/Icon…)
src/views/           Views
src/i18n/locales/    zh / en
src-tauri/           Tauri shell (tray, shortcut, updater, capabilities/ACL)
tests/               Unit / a11y / E2E
```

## 🛣️ Roadmap

- [x] **0.2.0** — custom vector model + RAG, custom themes, auto-update, market, tray/shortcut (released)
- [ ] **v1.0.0** — first stable release (planned)
- [ ] **RAG** — more preset embedding models, retrieval benchmarks (planned)
- [ ] **A11y** — runtime contrast pre-check for custom themes (planned)

## 🤝 Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) (includes acknowledgements to core open-source projects). Basic flow: `Fork → feature branch → PR`; for larger changes, please open an Issue first.

## 📄 License

This project is open-sourced under the **Apache License 2.0**. See [LICENSE](LICENSE).

## 📚 More

- [Security & Privacy](#-security--privacy)

### Security & Privacy

- Least-privilege client: capabilities only `core:default` + `updater:default`; no `fs/shell/http/dialog/os` permission
- Tightened CSP: `script-src 'self'`, `freezePrototype` enabled
- API keys encrypted at rest (PBKDF2 + AES-GCM); master password never stored locally
- Auto-update uses embedded public key; private key lives in repo Secrets, never in the binary