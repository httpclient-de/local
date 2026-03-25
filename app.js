// app.js — httpclient PWA

'use strict';

// ── IndexedDB ─────────────────────────────────────────────────────────────────

const DB_NAME    = 'httpclient';
const DB_VERSION = 1;
const STORE_HISTORY = 'history';

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_HISTORY)) {
        const store = d.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

async function dbAdd(storeName, record) {
  const tx = db.transaction(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(storeName).add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const tx = db.transaction(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(storeName).index('ts').getAll();
    req.onsuccess = () => resolve(req.result.reverse());
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(storeName, id) {
  const tx = db.transaction(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  headers: [{ key: '', value: '' }],
  bodyType: 'none',
  activeTab: 'headers',
  response: null,
  loading: false,
  proxyEnabled: false,
  proxyUrl: 'http://localhost:8080',
};

// ── DOM Refs ──────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderHeaders() {
  const container = $('#headers-editor');
  container.innerHTML = '';
  state.headers.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'kv-row';
    div.innerHTML = `
      <input class="kv-input" data-idx="${i}" data-field="key"
             placeholder="Header name" value="${escHtml(row.key)}" />
      <input class="kv-input" data-idx="${i}" data-field="value"
             placeholder="Value" value="${escHtml(row.value)}" />
      <button class="kv-delete" data-idx="${i}" title="Remove header">
        ${iconX(12)}
      </button>`;
    container.appendChild(div);
  });

  const badge = $('#tab-headers-badge');
  const count = state.headers.filter(r => r.key.trim()).length;
  badge.textContent = count || '';
  badge.style.display = count ? '' : 'none';
}

function renderBodyEditor() {
  const wrap = $('#body-wrap');
  $$('.body-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === state.bodyType);
  });

  if (state.bodyType === 'none') {
    wrap.innerHTML = `<p style="color:var(--text-muted);font-size:var(--text-sm);padding:var(--space-3) 0;">No body.</p>`;
  } else {
    wrap.innerHTML = `<textarea id="body-editor" class="body-editor"
      placeholder="${bodyPlaceholder(state.bodyType)}" spellcheck="false"></textarea>`;
  }
}

function bodyPlaceholder(type) {
  if (type === 'json')       return '{\n  "key": "value"\n}';
  if (type === 'form')       return 'key=value&other=123';
  if (type === 'raw')        return 'Raw request body…';
  return '';
}

function renderResponse() {
  const panel   = $('#response-output');
  const header  = $('#response-header');
  const r       = state.response;

  if (!r) {
    panel.innerHTML  = emptyResponseHTML();
    header.innerHTML = `<span class="response-header-label">Response</span>`;
    return;
  }

  if (r.error) {
    header.innerHTML = `<span class="response-header-label">Response</span>
      <span style="color:var(--red);font-size:var(--text-sm);font-family:var(--font-mono)">— Error</span>`;
    panel.innerHTML = `<div class="response-error">
      <div class="response-error-title">${iconAlert(14)} ${r.error.type}</div>
      <pre class="response-error-msg">${escHtml(r.error.message)}</pre>
      <div class="response-error-hint">${corsHint(r.error)}</div>
    </div>`;
    return;
  }

  const cls = statusClass(r.status);
  header.innerHTML = `
    <span class="response-header-label">Response</span>
    <span class="status-badge ${cls}">${r.status} ${escHtml(r.statusText)}</span>
    <div class="response-meta">
      <span class="meta-item"><span class="meta-label">time</span>${r.duration}ms</span>
      <span class="meta-item"><span class="meta-label">size</span>${formatBytes(r.bodySize)}</span>
      <button class="copy-btn" id="copy-response-btn">${iconCopy(11)} Copy</button>
    </div>`;

  // Tabs: body / headers
  const bodyContent = renderResponseBody(r);
  const headersContent = renderResponseHeaders(r.headers);

  panel.innerHTML = `
    <div class="panel-tabs">
      <button class="tab-btn active" data-resp-tab="body">Body</button>
      <button class="tab-btn" data-resp-tab="headers">Headers
        <span class="tab-badge">${Object.keys(r.headers).length}</span>
      </button>
    </div>
    <div class="response-body-wrap" id="resp-body-panel">${bodyContent}</div>
    <div class="response-body-wrap" id="resp-headers-panel" style="display:none">${headersContent}</div>`;
}

function renderResponseBody(r) {
  const ct = (r.headers['content-type'] || '').toLowerCase();
  if (ct.includes('json')) {
    try {
      const obj = JSON.parse(r.body);
      return `<div class="json-tree">${jsonHighlight(obj)}</div>`;
    } catch {
      // fall through
    }
  }
  return `<pre class="response-raw">${escHtml(r.body)}</pre>`;
}

function renderResponseHeaders(headers) {
  const rows = Object.entries(headers).map(([k, v]) =>
    `<div class="kv-row" style="margin-bottom:4px">
      <span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--blue)">${escHtml(k)}</span>
      <span style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--text-secondary);grid-column:2/4">${escHtml(v)}</span>
    </div>`).join('');
  return rows || `<p style="color:var(--text-muted);font-size:var(--text-sm)">No headers.</p>`;
}

function renderHistory(items) {
  const list = $('#history-list');
  if (!items.length) {
    list.innerHTML = `<div class="history-empty">No requests yet.<br>Send your first one!</div>`;
    return;
  }
  list.innerHTML = items.map(item => `
    <div class="history-item" data-id="${item.id}" title="${escHtml(item.url)}">
      <span class="method-badge ${item.method}">${item.method}</span>
      <span class="url-text">${escHtml(item.url)}</span>
      ${item.status ? `<span class="status-dot" style="background:${statusColor(item.status)}"></span>` : ''}
    </div>`).join('');
}

// ── JSON Highlighter ──────────────────────────────────────────────────────────

function jsonHighlight(val, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);

  if (val === null)              return `<span class="json-null">null</span>`;
  if (typeof val === 'boolean')  return `<span class="json-bool">${val}</span>`;
  if (typeof val === 'number')   return `<span class="json-num">${val}</span>`;
  if (typeof val === 'string')   return `<span class="json-str">"${escHtml(val)}"</span>`;

  if (Array.isArray(val)) {
    if (!val.length) return `<span class="json-punct">[]</span>`;
    const items = val.map(v => `${padIn}${jsonHighlight(v, indent + 1)}`).join(`<span class="json-punct">,</span>\n`);
    return `<span class="json-punct">[</span>\n${items}\n${pad}<span class="json-punct">]</span>`;
  }

  if (typeof val === 'object') {
    const entries = Object.entries(val);
    if (!entries.length) return `<span class="json-punct">{}</span>`;
    const items = entries.map(([k, v]) =>
      `${padIn}<span class="json-key">"${escHtml(k)}"</span><span class="json-punct">: </span>${jsonHighlight(v, indent + 1)}`
    ).join(`<span class="json-punct">,</span>\n`);
    return `<span class="json-punct">{</span>\n${items}\n${pad}<span class="json-punct">}</span>`;
  }

  return String(val);
}

// ── HTTP Request Logic ────────────────────────────────────────────────────────

async function sendRequest() {
  if (state.loading) return;

  const methodEl = $('#method-select');
  const urlEl    = $('#url-input');
  const method   = methodEl.value;
  let   url      = urlEl.value.trim();

  if (!url) { urlEl.focus(); return; }

  // Auto-prefix https://
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  urlEl.value = url;

  // Build effective URL (with proxy if enabled)
  let effectiveUrl = url;
  if (state.proxyEnabled && state.proxyUrl.trim()) {
    const proxy = state.proxyUrl.trim().replace(/\/$/, '');
    effectiveUrl = `${proxy}/${url}`;
  }

  // Build headers
  const headers = {};
  state.headers.forEach(({ key, value }) => {
    if (key.trim()) headers[key.trim()] = value;
  });

  // Build body
  let body = undefined;
  const bodyEditor = $('#body-editor');
  if (state.bodyType !== 'none' && bodyEditor) {
    const raw = bodyEditor.value.trim();
    if (raw) {
      body = raw;
      if (state.bodyType === 'json' && !headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      if (state.bodyType === 'form' && !headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }
  }

  // No body for HEAD/GET/OPTIONS
  const noBodyMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (noBodyMethods.includes(method)) body = undefined;

  setLoading(true);
  startLoadingBar();

  const startTime = performance.now();

  try {
    const response = await fetch(effectiveUrl, {
      method,
      headers,
      body,
      credentials: 'omit',
      redirect: 'follow',
    });

    const duration = Math.round(performance.now() - startTime);
    const responseBody = await response.text();
    const respHeaders = {};
    response.headers.forEach((val, key) => { respHeaders[key] = val; });

    state.response = {
      status:     response.status,
      statusText: response.statusText,
      headers:    respHeaders,
      body:       responseBody,
      bodySize:   new Blob([responseBody]).size,
      duration,
    };

    await saveHistory({ method, url, status: response.status });

  } catch (err) {
    const duration = Math.round(performance.now() - startTime);
    let type = 'NetworkError';
    let message = err.message;
    let corsLikely = false;

    // Heuristic: CORS errors manifest as opaque "Failed to fetch"
    if (message === 'Failed to fetch' || message.includes('NetworkError') || message.includes('CORS')) {
      type = 'CORS / Network Error';
      corsLikely = true;
    }

    state.response = {
      error: { type, message, corsLikely, url },
      duration,
    };

    await saveHistory({ method, url, status: null });
  }

  stopLoadingBar();
  setLoading(false);
  renderResponse();
}

function setLoading(loading) {
  state.loading = loading;
  const btn = $('#send-btn');
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
}

function startLoadingBar() {
  const fill = $('#loading-bar-fill');
  fill.style.transition = 'none';
  fill.style.width = '0%';
  requestAnimationFrame(() => {
    fill.style.transition = 'width 8s cubic-bezier(0.1, 0.4, 0.2, 1)';
    fill.style.width = '85%';
  });
}

function stopLoadingBar() {
  const fill = $('#loading-bar-fill');
  fill.style.transition = 'width 0.15s ease';
  fill.style.width = '100%';
  setTimeout(() => {
    fill.style.transition = 'opacity 0.2s';
    fill.style.opacity = '0';
    setTimeout(() => {
      fill.style.width = '0';
      fill.style.opacity = '1';
    }, 250);
  }, 150);
}

async function saveHistory(entry) {
  try {
    await dbAdd(STORE_HISTORY, { ...entry, ts: Date.now() });
    const items = await dbGetAll(STORE_HISTORY);
    renderHistory(items.slice(0, 50)); // show 50 most recent
  } catch (e) {
    console.warn('History save failed:', e);
  }
}

// ── Event Wiring ──────────────────────────────────────────────────────────────

function wireEvents() {

  // Send button
  $('#send-btn').addEventListener('click', sendRequest);

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendRequest();
    }
  });

  // Method select color update
  const methodSel = $('#method-select');
  methodSel.addEventListener('change', () => {
    methodSel.dataset.method = methodSel.value;
  });
  methodSel.dataset.method = methodSel.value;

  // Tab switching (request)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    const tab = btn.dataset.tab;
    state.activeTab = tab;
    $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
  });

  // Tab switching (response)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-resp-tab]');
    if (!btn) return;
    const tab = btn.dataset.respTab;
    $$('[data-resp-tab]').forEach(b => b.classList.toggle('active', b.dataset.respTab === tab));
    $('#resp-body-panel').style.display    = tab === 'body' ? '' : 'none';
    $('#resp-headers-panel').style.display = tab === 'headers' ? '' : 'none';
  });

  // Headers editor — delegation
  const headersEditor = $('#headers-editor');
  headersEditor.addEventListener('input', (e) => {
    const input = e.target.closest('.kv-input');
    if (!input) return;
    const idx   = parseInt(input.dataset.idx, 10);
    const field = input.dataset.field;
    state.headers[idx][field] = input.value;
    renderHeaders();
    // Restore focus
    const newInput = headersEditor.querySelector(`[data-idx="${idx}"][data-field="${field}"]`);
    if (newInput) { newInput.focus(); newInput.setSelectionRange(input.value.length, input.value.length); }
  });

  headersEditor.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.kv-delete');
    if (!delBtn) return;
    const idx = parseInt(delBtn.dataset.idx, 10);
    state.headers.splice(idx, 1);
    if (!state.headers.length) state.headers.push({ key: '', value: '' });
    renderHeaders();
  });

  // Add header row
  $('#add-header-btn').addEventListener('click', () => {
    state.headers.push({ key: '', value: '' });
    renderHeaders();
    const inputs = $$('.kv-input');
    if (inputs.length) inputs[inputs.length - 2].focus();
  });

  // Body type selector
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.body-type-btn');
    if (!btn) return;
    state.bodyType = btn.dataset.type;
    renderBodyEditor();
  });

  // Proxy toggle
  $('#proxy-toggle').addEventListener('change', (e) => {
    state.proxyEnabled = e.target.checked;
    $('#proxy-url-input').disabled = !state.proxyEnabled;
  });

  $('#proxy-url-input').addEventListener('input', (e) => {
    state.proxyUrl = e.target.value;
  });

  // Copy response
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#copy-response-btn');
    if (!btn || !state.response?.body) return;
    navigator.clipboard.writeText(state.response.body).then(() => {
      btn.classList.add('copied');
      btn.innerHTML = `${iconCheck(11)} Copied!`;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `${iconCopy(11)} Copy`;
      }, 2000);
    });
  });

  // History item click
  $('#history-list').addEventListener('click', (e) => {
    const item = e.target.closest('.history-item');
    if (!item) return;
    const id = parseInt(item.dataset.id, 10);
    loadHistoryItem(id);
  });

  // Online/offline indicator
  window.addEventListener('online',  () => document.body.classList.remove('offline'));
  window.addEventListener('offline', () => document.body.classList.add('offline'));
  if (!navigator.onLine) document.body.classList.add('offline');
}

async function loadHistoryItem(id) {
  const items = await dbGetAll(STORE_HISTORY);
  const item  = items.find(i => i.id === id);
  if (!item) return;
  $('#method-select').value = item.method;
  $('#method-select').dataset.method = item.method;
  $('#url-input').value = item.url;
}

// ── Service Worker Registration ───────────────────────────────────────────────

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newWorker);
        }
      });
    });
  });
}

function showUpdateBanner(worker) {
  const banner = $('#update-banner');
  banner.classList.add('visible');
  $('#update-reload-btn').addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  });
  $('#update-dismiss-btn').addEventListener('click', () => {
    banner.classList.remove('visible');
  });
}

// ── PWA Install Prompt ────────────────────────────────────────────────────────

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = $('#install-btn');
  btn.classList.add('visible');
  btn.addEventListener('click', async () => {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') btn.classList.remove('visible');
    deferredInstallPrompt = null;
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusClass(code) {
  if (code >= 500) return 's5xx';
  if (code >= 400) return 's4xx';
  if (code >= 300) return 's3xx';
  if (code >= 200) return 's2xx';
  return 's1xx';
}

function statusColor(code) {
  if (code >= 500) return 'var(--status-5xx)';
  if (code >= 400) return 'var(--status-4xx)';
  if (code >= 300) return 'var(--status-3xx)';
  if (code >= 200) return 'var(--status-2xx)';
  return 'var(--status-1xx)';
}

function formatBytes(bytes) {
  if (bytes < 1024)          return bytes + ' B';
  if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function corsHint(error) {
  if (!error.corsLikely) return '';
  return `<strong>Possible CORS issue.</strong> The server at <code>${escHtml(error.url)}</code>
    may not allow requests from this origin.<br><br>
    Options: enable the proxy in the <strong>Proxy</strong> tab, run
    <code>node proxy.js</code> locally, or configure the target server's CORS headers.`;
}

function emptyResponseHTML() {
  return `<div class="response-empty">
    <div class="response-empty-icon">⬡</div>
    <p>Send a request to see the response here.</p>
    <p><span class="shortcut">Ctrl</span> + <span class="shortcut">Enter</span> to send</p>
  </div>`;
}

// ── Inline Icons (SVG) ────────────────────────────────────────────────────────

const svgIcon = (d, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const iconX     = (s) => svgIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', s);
const iconCopy  = (s) => svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>', s);
const iconCheck = (s) => svgIcon('<polyline points="20 6 9 17 4 12"/>', s);
const iconAlert = (s) => svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', s);

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    db = await openDB();
    const history = await dbGetAll(STORE_HISTORY);
    renderHistory(history.slice(0, 50));
  } catch (e) {
    console.warn('IndexedDB not available:', e);
  }

  renderHeaders();
  renderBodyEditor();
  renderResponse();
  wireEvents();
  registerSW();
}

document.addEventListener('DOMContentLoaded', init);
