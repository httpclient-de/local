# ROADMAP — local.httpclient.de PWA

A fully offline-capable, installable HTTP client PWA. No backend required. Everything runs in the browser via Service Worker + IndexedDB.

---

## Phase 1 — Foundation ✅ (current)

### 1.1 Project Scaffolding
- [x] `manifest.json` — PWA manifest (name, icons, display, theme)
- [x] `sw.js` — Service Worker (cache-first strategy, offline support)
- [x] `index.html` — App shell
- [x] `app.js` — Core application logic
- [x] `style.css` — Design system + CSS variables

### 1.2 PWA Installability
- [x] Web App Manifest with all required fields
- [x] Service Worker registration with lifecycle management
- [x] HTTPS (required for SW; use `local.httpclient.de` with valid cert)
- [x] Install prompt (`beforeinstallprompt`) captured and surfaced in UI
- [x] Offline fallback page
- [x] App icons (192×192, 512×512 maskable)

### 1.3 Core HTTP Client
- [x] Method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- [x] URL bar with history autocomplete
- [x] Headers editor (key/value pairs, add/remove)
- [x] Body editor (raw JSON, form-data, x-www-form-urlencoded, none)
- [x] Send button + keyboard shortcut (Ctrl/Cmd+Enter)
- [x] Response viewer (status, headers, body)
- [x] JSON syntax highlighting in response

### 1.4 CORS Strategy
- [x] Service Worker intercepts all fetch events for app-shell assets (cache-first)
- [x] Outbound API requests are sent directly (fetch from SW context)
- [x] Clear CORS error detection and user-facing explanation
- [x] Optional: CORS-anywhere proxy URL field for user to plug in their own proxy
- [ ] Optional companion: tiny local proxy script (`proxy.js`) for running on `localhost:8080`

---

## Phase 2 — Data Persistence & UX

### 2.1 Request History
- [ ] IndexedDB store: `requests` — save every sent request + response metadata
- [ ] History sidebar: list recent requests, click to restore
- [ ] Search/filter history
- [ ] Clear history

### 2.2 Collections
- [ ] IndexedDB store: `collections` — named groups of saved requests
- [ ] Save current request to a collection
- [ ] Rename / delete collections and entries
- [ ] Export collection as JSON
- [ ] Import collection from JSON file

### 2.3 Environments & Variables
- [ ] Named environments (dev, staging, prod)
- [ ] `{{variable}}` interpolation in URL, headers, body
- [ ] IndexedDB store: `environments`

### 2.4 UI Polish
- [ ] Resizable panels (request / response split)
- [ ] Tab system — multiple open requests
- [ ] Dark / Light / System theme toggle
- [ ] Response time + size display
- [ ] Copy response to clipboard

---

## Phase 3 — Advanced Features

### 3.1 Auth Helpers
- [ ] Bearer token auto-injector
- [ ] Basic Auth (username/password → Base64 Authorization header)
- [ ] API Key header/query param helper

### 3.2 Code Generation
- [ ] Generate `curl` command from current request
- [ ] Generate `fetch()` snippet
- [ ] Generate `axios` snippet

### 3.3 Testing / Assertions
- [ ] Simple response assertions (status code, body contains, header exists)
- [ ] Run assertions after send, show pass/fail

### 3.4 WebSocket Client
- [ ] Connect to `ws://` / `wss://` endpoints
- [ ] Send/receive messages in a live log

---

## Phase 4 — Distribution & Operations

### 4.1 Self-Hosting
- [ ] Static file server config (nginx example)
- [ ] Nginx snippet for `local.httpclient.de` with HTTPS redirect
- [ ] Docker Compose for the optional local CORS proxy
- [ ] CI/CD: GitHub Actions → deploy to server on `main` push

### 4.2 Update Flow
- [ ] SW update notification banner ("New version available — reload")
- [ ] `skipWaiting` + `clients.claim` strategy
- [ ] Version badge in footer

### 4.3 Security
- [ ] CSP headers (`Content-Security-Policy`)
- [ ] No sensitive data (API keys, tokens) stored in plain text — consider IndexedDB encryption via `idb-keyval` + Web Crypto

---

## CORS — Design Decision

| Scenario | Behavior |
|---|---|
| Requests to `httpclient.de` or `local.httpclient.de` | ✅ No CORS (same origin) |
| Requests to servers that send `Access-Control-Allow-Origin: *` | ✅ Works fine |
| Requests to servers with restricted CORS | ⚠️ Browser blocks — SW cannot bypass this |
| User provides a CORS proxy URL | ✅ Request routed through proxy |
| User runs `proxy.js` locally on port 8080 | ✅ Full bypass via localhost |

A Service Worker **cannot** bypass the browser's CORS enforcement for cross-origin fetches — this is a browser security guarantee. The recommended escape hatch is a user-provided CORS proxy (self-hosted or local).

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| App Shell | Vanilla HTML/CSS/JS | Zero dependencies, fast, works offline |
| Service Worker | Native SW API | Full control, no library needed |
| Storage | IndexedDB (via `idb` library) | Structured, async, large capacity |
| Icons | SVG inline + PNG exports | Crisp at all sizes |
| Fonts | Self-hosted (WOFF2) | Works offline, no Google Fonts CDN |
| Build | None (phase 1) → Vite (phase 2+) | Start simple, add build only when needed |

---

*Last updated: Phase 1*
