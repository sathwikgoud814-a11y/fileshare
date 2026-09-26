# QuickShare — PRD

## Original Problem Statement
Build "QuickShare", a CopyPaste.me-style local text & file sharing web app for a college
Computer Networks laboratory mini-project. Device A shares text/file → server returns a
6-digit code → Device B enters the code to view text or download the file. Must be
understandable, well-commented, easy to demo, with a detailed README covering CN concepts.

## Stack (as specified by the user)
- Backend: Python 3 + Flask (WSGI)
- Frontend: HTML5 + CSS3 + vanilla JavaScript (no React/Node frameworks)
- DB: SQLite (`database.db`)
- Storage: local `uploads/` directory
- Networking: HTTP over TCP/IP

## Architecture
- Deliverable Flask app lives in `/app/QuickShare/` and runs standalone locally via
  `python app.py` on `0.0.0.0:5000` (this is what the student runs/submits).
- Preview wiring inside Emergent (read-only supervisor): `/app/backend/server.py` wraps the
  Flask WSGI app with `a2wsgi.WSGIMiddleware` so `uvicorn server:app` serves it on 8001;
  `/app/frontend/proxy_server.js` (Node http-proxy, replaces `craco start`) forwards all
  non-`/api` traffic on 3000 → Flask on 8001 so pages/static/download are served by Flask.

## User Choices
- Expiry: 10 minutes; Max file size: 50 MB; Codes reusable until expiry.
- Live preview in-environment + exact Flask stack for the report.

## Core Requirements (static)
- Home page with Share / Retrieve options.
- Text share → 6-digit code + copy button + countdown.
- File share → drag & drop / browse, upload progress, 6-digit code.
- Retrieve by code → show text OR file meta + download.
- Auto-expiry (10 min), background cleanup, SQLite `shares` table.
- Security: 6-digit validation, filename sanitisation, path-traversal protection, size limit,
  no arbitrary file access, cryptographically random codes.
- LAN access on 0.0.0.0:5000 with README instructions.
- Detailed README: architecture, install/run, LAN access, CN concepts, viva Q&A, errors, screenshots.

## Implemented (2026-06)
- Full Flask app (`app.py`) with all routes, SQLite, secure code gen, expiry, background cleanup — well-commented for CN viva.
- Three responsive templates (index/share/retrieve), dark-navy + blue/purple theme, drag-drop, toasts, progress bar, countdown, copy-to-clipboard.
- Detailed README.md with viva questions & answers, CN concept mapping, common errors, screenshot suggestions.
- Preview bridge (a2wsgi + node proxy). Verified end-to-end via curl (text/file share, retrieve, download, error cases) and testing agent (frontend 100% pass, 14/14).

## Backlog / Future (P1/P2)
- QR code for the 6-digit code.
- Optional password-protected / single-use shares.
- Chunked/resumable uploads; production WSGI (gunicorn/waitress).
- Per-share configurable expiry.

## Notes
- No authentication (by design). `test_credentials.md` not applicable.
- The test database currently holds a few short-lived demo records that auto-expire.
