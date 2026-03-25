# httpclient — local.httpclient.de

> A zero-dependency, fully offline HTTP client — installable as a PWA.  
> No Electron. No backend. No telemetry. Runs entirely in your browser.

---

## Features

- **Installable PWA** — add to homescreen / desktop, runs like a native app
- **100% offline** — Service Worker caches all assets; works without internet
- **Full HTTP methods** — GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- **Headers & Body editor** — JSON, form-data, raw text
- **JSON response viewer** — syntax-highlighted, collapsible tree
- **Request history** — persisted in IndexedDB, survives page reloads
- **CORS proxy support** — plug in your own proxy URL to bypass CORS restrictions
- **No accounts, no cloud, no tracking**

---

## Getting Started

### Requirements

- A web server serving files over **HTTPS** (required for Service Workers)
- A valid TLS certificate for `local.httpclient.de`
- DNS record: `local.httpclient.de → your server IP`

### Deployment (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name local.httpclient.de;

    ssl_certificate     /etc/letsencrypt/live/httpclient.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/httpclient.de/privkey.pem;

    root /var/www/httpclient-pwa;
    index index.html;

    # Cache static assets aggressively — SW handles updates
    location ~* \.(js|css|png|webp|woff2|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Never cache the SW itself or the manifest
    location ~* (sw\.js|manifest\.json)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Content-Type-Options "nosniff";
    add_header X-Frame-Options "DENY";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Content-Security-Policy "default-src 'self'; connect-src *; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'";
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name local.httpclient.de;
    return 301 https://$host$request_uri;
}
```

### Local Development (no HTTPS needed for localhost)

```bash
# Any static server works — e.g. with Node:
npx serve .

# Or Python:
python3 -m http.server 3000

# Or with the optional CORS proxy companion:
node proxy.js   # starts on :8080
```

> ⚠️ Service Workers require HTTPS in production. `localhost` is the only exception where HTTP works.

---

## File Structure

```
httpclient-pwa/
├── index.html          # App shell
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker
├── app.js              # Application logic
├── style.css           # Design system
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
├── offline.html        # Offline fallback
├── proxy.js            # (optional) Local CORS proxy
├── nginx.conf          # Sample nginx config
├── ROADMAP.md
└── README.md
```

---

## CORS

Browsers enforce CORS regardless of the Service Worker. The SW **cannot** bypass browser security policy for cross-origin requests.

**Options when you hit a CORS wall:**

| Option | How |
|---|---|
| Use the built-in CORS proxy field | Enter any CORS-anywhere compatible proxy URL in Settings |
| Run the bundled local proxy | `node proxy.js` — starts a proxy on `localhost:8080` |
| Configure the target server | Add `Access-Control-Allow-Origin: *` to the response headers |

### Local Proxy (`proxy.js`)

```bash
node proxy.js
# Listening on http://localhost:8080
```

Then in the app, set **Proxy URL** to `http://localhost:8080`.  
All requests will be tunneled: `GET http://localhost:8080/https://api.example.com/data`

---

## PWA Install

1. Open `https://local.httpclient.de` in Chrome, Edge, or Safari 16.4+
2. Click the **"Install App"** button in the toolbar (or use the browser's install prompt)
3. The app installs to your OS and opens in a standalone window

### Update Flow

When a new version is deployed, the Service Worker detects the change on next visit and shows an **"Update available"** banner. Click **Reload** to activate.

---

## Privacy

- All data stays on your device (IndexedDB)
- No analytics, no telemetry, no external requests from the app itself
- Requests you send go directly from your browser to the target server — nothing in between (unless you use the proxy)

---

## Browser Support

| Browser | Install | Offline | Service Worker |
|---|---|---|---|
| Chrome / Edge 90+ | ✅ | ✅ | ✅ |
| Firefox 90+ | ❌ install | ✅ | ✅ |
| Safari 16.4+ | ✅ (iOS/macOS) | ✅ | ✅ |

---

## License

MIT — do whatever you want with it.
