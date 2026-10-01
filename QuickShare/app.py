"""
QuickShare - Local Text & File Sharing Web Application
=======================================================
A Computer Networks laboratory mini-project.

WHAT THIS DEMONSTRATES (Computer Networks concepts)
---------------------------------------------------
* Client-Server architecture : This Flask program is the SERVER. Browsers
  (laptop, phone) are the CLIENTS.
* IP address + Port number    : The server binds to 0.0.0.0:5000 so every
  device on the LAN can reach it at http://<server-ip>:5000
* TCP / IP                    : Flask's built-in WSGI server listens on a TCP
  socket. HTTP travels reliably on top of TCP.
* HTTP request/response model : Each browser action = one HTTP request; the
  server replies with an HTTP response (HTML or JSON).
* Data transmission           : Text is sent as JSON; files are sent as
  multipart/form-data over the same TCP connection.
* File transfer               : Upload (client -> server) and Download
  (server -> client).
* LAN communication / many clients : Multiple devices on the same Wi-Fi can
  connect to this one server simultaneously.

NOTE: This is meant for TRUSTED local networks (a classroom / home Wi-Fi).
It is NOT production-grade cloud storage.
"""

import os
import io
import time
import socket
import sqlite3
import secrets
import mimetypes
import threading
from datetime import datetime, timezone, timedelta

from flask import (
    Flask, request, jsonify, render_template,
    send_file, abort, g, redirect, url_for,
)
from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------------
# Configuration (all values can be overridden through environment variables)
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))          # folder of app.py
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")                  # where files live
DB_PATH = os.path.join(BASE_DIR, "database.db")                 # SQLite database file

HOST = os.environ.get("HOST", "0.0.0.0")                        # 0.0.0.0 = all interfaces (LAN)
PORT = int(os.environ.get("PORT", "5000"))                      # TCP port the server listens on
EXPIRY_MINUTES = int(os.environ.get("EXPIRY_MINUTES", "10"))    # shares expire after N minutes
MAX_FILE_MB = int(os.environ.get("MAX_FILE_MB", "50"))          # maximum upload size
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_local_ip():
    """Discover the local LAN IPv4 address so phones on the same Wi-Fi can connect."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


PUBLIC_TUNNEL_URL = None
TUNNEL_LOCK = threading.Lock()


def start_public_tunnel(port):
    """Starts Cloudflare Tunnel for seamless cross-network file sharing."""
    global PUBLIC_TUNNEL_URL
    try:
        from pycloudflared import try_cloudflare
        tunnel = try_cloudflare(port=port)
        with TUNNEL_LOCK:
            PUBLIC_TUNNEL_URL = tunnel.tunnel.rstrip("/")
        print("\n========================================================")
        print(" [CROSS-NETWORK PUBLIC URL] (Share Anywhere / 4G / 5G / Internet):")
        print(f"    {PUBLIC_TUNNEL_URL}")
        print("========================================================\n")
    except Exception as e:
        print(f" * Cross-network tunnel notice: {e}")


# ---------------------------------------------------------------------------
# Flask application object
# ---------------------------------------------------------------------------
app = Flask(__name__, template_folder="templates", static_folder="static")
# Reject any request body larger than the limit -> Flask raises 413 for us.
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_BYTES


@app.after_request
def add_cors_headers(response):
    """Enable CORS so uploads and downloads work smoothly across all origins/tunnels."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Requested-With, Authorization"
    return response


def get_request_base_url():
    """Determine the best public / accessible base URL for links and QR codes."""
    try:
        host = request.host.split(":")[0]
        if host not in ("localhost", "127.0.0.1", "0.0.0.0"):
            # Deployed on a real domain (e.g. *.onrender.com) or accessed via direct LAN IP
            proto = request.headers.get("X-Forwarded-Proto", request.scheme)
            return f"{proto}://{request.host}".rstrip("/")
    except Exception:
        pass
    if PUBLIC_TUNNEL_URL:
        return PUBLIC_TUNNEL_URL
    return f"http://{get_local_ip()}:{PORT}"


@app.context_processor
def inject_server_info():
    ip = get_local_ip()
    port = PORT
    public_url = None
    try:
        host = request.host.split(":")[0]
        if host not in ("localhost", "127.0.0.1", "0.0.0.0"):
            proto = request.headers.get("X-Forwarded-Proto", request.scheme)
            public_url = f"{proto}://{request.host}".rstrip("/")
    except Exception:
        pass
    if not public_url:
        public_url = PUBLIC_TUNNEL_URL or f"http://{ip}:{port}"

    return {
        "lan_ip": ip,
        "lan_url": f"http://{ip}:{port}",
        "public_url": public_url,
        "has_public_url": bool(public_url),
        "server_port": port,
    }


# ---------------------------------------------------------------------------
# Database helpers (SQLite)
# ---------------------------------------------------------------------------
def get_db():
    """Return a per-request SQLite connection (reused within one request)."""
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row          # rows behave like dicts
        conn.execute("PRAGMA journal_mode=WAL") # allow concurrent read/write (many clients)
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create the `shares` table if it does not exist yet."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS shares (
            id                TEXT PRIMARY KEY,   -- random id used in /download/<id>
            code              TEXT UNIQUE,        -- the 6-digit code the user types
            type              TEXT NOT NULL,      -- 'text' or 'file'
            content           TEXT,               -- shared text (NULL for files)
            filename          TEXT,               -- stored filename on disk (NULL for text)
            original_filename TEXT,               -- name shown to the user
            filepath          TEXT,               -- absolute path on disk
            filesize          INTEGER,            -- size in bytes
            created_at        TEXT NOT NULL,      -- ISO timestamp (UTC)
            expires_at        TEXT NOT NULL       -- ISO timestamp (UTC)
        )
        """
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------
def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.isoformat()


def human_size(num_bytes):
    """Turn a byte count into a friendly string like '2.4 MB'."""
    num = float(num_bytes or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if num < 1024 or unit == "GB":
            return f"{num:.0f} {unit}" if unit == "B" else f"{num:.1f} {unit}"
        num /= 1024


def is_expired(expires_at_iso):
    try:
        return now_utc() > datetime.fromisoformat(expires_at_iso)
    except ValueError:
        return True


def generate_unique_code(db):
    """
    Generate a cryptographically-random 6-digit code that is NOT currently
    used by any active (non-expired) share -> prevents duplicate active codes.
    `secrets` is used (not `random`) because it is cryptographically secure.
    """
    for _ in range(50):
        code = f"{secrets.randbelow(1_000_000):06d}"     # 000000 - 999999
        row = db.execute(
            "SELECT expires_at FROM shares WHERE code = ?", (code,)
        ).fetchone()
        if row is None or is_expired(row["expires_at"]):
            return code
    # Extremely unlikely; only if the table is almost completely full.
    raise RuntimeError("Could not allocate a free share code, please retry.")


def cleanup_expired(db=None):
    """
    Delete expired records AND their files from disk.
    Called periodically by a background thread and before every retrieve.
    """
    own = False
    if db is None:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        own = True
    try:
        rows = db.execute("SELECT id, filepath, expires_at FROM shares").fetchall()
        removed = 0
        for r in rows:
            if is_expired(r["expires_at"]):
                # Remove the physical file first (best effort), then the DB row.
                fp = r["filepath"]
                if fp and os.path.isfile(fp):
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
                db.execute("DELETE FROM shares WHERE id = ?", (r["id"],))
                removed += 1
        db.commit()
        return removed
    finally:
        if own:
            db.close()


def valid_code(code):
    """A valid code is exactly 6 numeric digits."""
    return isinstance(code, str) and len(code) == 6 and code.isdigit()


# ---------------------------------------------------------------------------
# PAGE ROUTES  (return HTML rendered from templates/)
# Each of these is served in response to an HTTP GET request from a browser.
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/share")
def share_page():
    return render_template("share.html", max_mb=MAX_FILE_MB, expiry=EXPIRY_MINUTES)


@app.route("/retrieve")
def retrieve_page():
    code = request.args.get("code", "").strip()
    return render_template("retrieve.html", prefill_code=code)


@app.route("/r/<code>")
@app.route("/q/<code>")
def quick_retrieve(code):
    """Direct short link for QR code scanning -> redirects to retrieve page with code."""
    return redirect(url_for("retrieve_page", code=code))


# ---------------------------------------------------------------------------
# API ROUTES  (return JSON) -- this is where CLIENT <-> SERVER data exchange
# happens over HTTP/TCP.
# ---------------------------------------------------------------------------
@app.route("/api/health")
def health():
    return jsonify(status="ok", service="QuickShare")


@app.route("/api/info")
@app.route("/api/network")
def server_info():
    """Return connection info for local Wi-Fi and global cross-network sharing."""
    ip = get_local_ip()
    return jsonify(
        ip=ip,
        port=PORT,
        lan_url=f"http://{ip}:{PORT}",
        public_url=PUBLIC_TUNNEL_URL,
        has_public_url=bool(PUBLIC_TUNNEL_URL),
        best_url=PUBLIC_TUNNEL_URL or f"http://{ip}:{PORT}",
        max_file_mb=MAX_FILE_MB,
        expiry_minutes=EXPIRY_MINUTES,
    )


@app.route("/api/share/text", methods=["POST", "OPTIONS"])
def api_share_text():
    """CLIENT sends text (JSON) -> SERVER stores it and returns a 6-digit code."""
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify(error="Please enter some text to share."), 400
    if len(text) > 100_000:  # ~100 KB of text is plenty for a demo
        return jsonify(error="Text is too long (max 100,000 characters)."), 400

    db = get_db()
    cleanup_expired(db)
    code = generate_unique_code(db)
    share_id = secrets.token_urlsafe(9)
    created = now_utc()
    expires = created + timedelta(minutes=EXPIRY_MINUTES)

    db.execute(
        """INSERT INTO shares
           (id, code, type, content, created_at, expires_at)
           VALUES (?, ?, 'text', ?, ?, ?)""",
        (share_id, code, text, iso(created), iso(expires)),
    )
    db.commit()

    ip = get_local_ip()
    best_base = get_request_base_url()
    return jsonify(
        code=code,
        type="text",
        expires_at=iso(expires),
        expires_in_minutes=EXPIRY_MINUTES,
        lan_url=f"http://{ip}:{PORT}",
        public_url=best_base,
        retrieve_url=f"/retrieve?code={code}",
        direct_url=f"{best_base}/retrieve?code={code}",
        direct_lan_url=f"http://{ip}:{PORT}/retrieve?code={code}",
        direct_public_url=f"{best_base}/retrieve?code={code}",
    ), 201


@app.route("/api/share/file", methods=["POST", "OPTIONS"])
def api_share_file():
    """CLIENT uploads a file (multipart/form-data) -> SERVER saves it + returns a code."""
    if request.method == "OPTIONS":
        return "", 204

    if "file" not in request.files:
        return jsonify(error="No file part in the request."), 400

    upload = request.files["file"]
    if not upload or not upload.filename:
        return jsonify(error="No file selected."), 400

    # --- Security: sanitize the filename to stop path-traversal (../../etc) ---
    original_name = os.path.basename(upload.filename).strip() or "upload.bin"
    safe_name = secure_filename(original_name)
    if not safe_name:
        ext = os.path.splitext(original_name)[1]
        safe_name = f"upload_{secrets.token_hex(4)}{ext if ext else '.bin'}"

    # Store with a random prefix so two users uploading "photo.jpg" never clash.
    share_id = secrets.token_urlsafe(9)
    stored_name = f"{share_id}__{safe_name}"
    stored_path = os.path.join(UPLOAD_DIR, stored_name)

    # Extra guard: make sure the resolved path is really inside UPLOAD_DIR.
    if os.path.commonpath([os.path.abspath(stored_path), UPLOAD_DIR]) != UPLOAD_DIR:
        return jsonify(error="Invalid file path."), 400

    upload.save(stored_path)
    filesize = os.path.getsize(stored_path)

    if filesize == 0:
        if os.path.exists(stored_path):
            os.remove(stored_path)
        return jsonify(error="Uploaded file is empty."), 400

    db = get_db()
    cleanup_expired(db)
    code = generate_unique_code(db)
    created = now_utc()
    expires = created + timedelta(minutes=EXPIRY_MINUTES)

    db.execute(
        """INSERT INTO shares
           (id, code, type, filename, original_filename, filepath, filesize, created_at, expires_at)
           VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?)""",
        (share_id, code, stored_name, original_name, stored_path,
         filesize, iso(created), iso(expires)),
    )
    db.commit()

    ip = get_local_ip()
    best_base = get_request_base_url()
    return jsonify(
        code=code,
        type="file",
        filename=original_name,
        filesize=filesize,
        filesize_human=human_size(filesize),
        expires_at=iso(expires),
        expires_in_minutes=EXPIRY_MINUTES,
        lan_url=f"http://{ip}:{PORT}",
        public_url=best_base,
        retrieve_url=f"/retrieve?code={code}",
        direct_url=f"{best_base}/retrieve?code={code}",
        direct_lan_url=f"http://{ip}:{PORT}/retrieve?code={code}",
        direct_public_url=f"{best_base}/retrieve?code={code}",
    ), 201


@app.route("/api/retrieve", methods=["POST", "OPTIONS"])
def api_retrieve():
    """CLIENT sends a 6-digit code -> SERVER returns the matching content/metadata."""
    if request.method == "OPTIONS":
        return "", 204

    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()

    if not valid_code(code):
        return jsonify(error="Please enter a valid 6-digit code."), 400

    db = get_db()
    cleanup_expired(db)  # remove stale shares first
    row = db.execute("SELECT * FROM shares WHERE code = ?", (code,)).fetchone()

    if row is None:
        return jsonify(error="No share found for this code. It may have expired."), 404
    if is_expired(row["expires_at"]):
        return jsonify(error="This share has expired."), 410  # 410 Gone

    if row["type"] == "text":
        return jsonify(
            type="text",
            content=row["content"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
        )

    # File share -> return metadata + a download URL (we never expose the disk path)
    return jsonify(
        type="file",
        filename=row["original_filename"],
        filesize=row["filesize"],
        filesize_human=human_size(row["filesize"]),
        download_url=f"/download/{row['id']}",
        created_at=row["created_at"],
        expires_at=row["expires_at"],
    )


@app.route("/download/<share_id>")
def download(share_id):
    """
    SERVER -> CLIENT file transfer.
    Only serves files that (a) exist in the DB, (b) are of type 'file',
    (c) are NOT expired. Arbitrary server files can NEVER be requested because
    we look the id up in the database and only stream the recorded path.
    """
    db = get_db()
    row = db.execute("SELECT * FROM shares WHERE id = ?", (share_id,)).fetchone()

    if row is None or row["type"] != "file":
        abort(404)
    if is_expired(row["expires_at"]):
        abort(410)

    filepath = row["filepath"]
    # Defence in depth: confirm the file is still inside the uploads folder.
    if not filepath or os.path.commonpath(
        [os.path.abspath(filepath), UPLOAD_DIR]
    ) != UPLOAD_DIR or not os.path.isfile(filepath):
        abort(404)

    mimetype = mimetypes.guess_type(row["original_filename"])[0] or "application/octet-stream"
    return send_file(
        filepath,
        as_attachment=True,                       # force a download
        download_name=row["original_filename"],   # restore the friendly name
        mimetype=mimetype,
    )


# ---------------------------------------------------------------------------
# Error handlers -> always return JSON for API-style clients
# ---------------------------------------------------------------------------
@app.errorhandler(413)
def too_large(_e):
    return jsonify(error=f"File is too large (max {MAX_FILE_MB} MB)."), 413


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api") or request.path.startswith("/download"):
        return jsonify(error="Not found."), 404
    return render_template("index.html"), 404


@app.errorhandler(500)
def server_error(_e):
    return jsonify(error="Internal server error."), 500


# ---------------------------------------------------------------------------
# Background cleanup thread -> periodically purge expired shares & files.
# ---------------------------------------------------------------------------
def start_cleanup_thread():
    def loop():
        while True:
            time.sleep(60)  # run once a minute
            try:
                cleanup_expired()
            except Exception:
                pass
    t = threading.Thread(target=loop, daemon=True)
    t.start()


# Initialise the database and start cleanup as soon as the module is imported
# (this works both for `python app.py` and when a WSGI server imports `app`).
init_db()
start_cleanup_thread()

# Start the cross-network tunnel in background so it is available for internet sharing
_tunnel_thread = threading.Thread(target=start_public_tunnel, args=(PORT,), daemon=True)
_tunnel_thread.start()


if __name__ == "__main__":
    # ------------------------------------------------------------------
    # Bind to 0.0.0.0 so the server is reachable from OTHER devices on the
    # same Wi-Fi / LAN, not just this machine (127.0.0.1 would be local-only).
    # Find your IP:  Windows -> `ipconfig`   |   macOS/Linux -> `ifconfig` / `ip a`
    # Then open  http://<that-ip>:5000  on your phone (same Wi-Fi).
    # ------------------------------------------------------------------
    print(f" * QuickShare running on http://{HOST}:{PORT}  (shares expire in {EXPIRY_MINUTES} min)")
    app.run(host=HOST, port=PORT, debug=True, threaded=True)
