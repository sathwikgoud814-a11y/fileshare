# QuickShare 🚀

**Share text & files instantly across your local network.**

QuickShare is a lightweight web app that lets two devices on the **same Wi-Fi/LAN**
exchange text snippets and files using a simple **6-digit code** — no login, no cloud,
no external services. It was built as a **Computer Networks laboratory mini-project**
and is intentionally small, readable, and heavily commented so it is easy to demonstrate
and explain during a viva.

> Device A pastes text / uploads a file → server returns a **6-digit code** →
> Device B enters the code → text is shown or the file is downloaded.

---

## ✨ Features

- **Text sharing** — paste text, get a 6-digit code, copy it with one click.
- **File sharing** — drag & drop or browse, upload up to **50 MB**, with a live progress bar.
- **Retrieve by code** — enter the code on any device to view the text or download the file.
- **Auto-expiry** — every share disappears automatically after **10 minutes**.
- **6-digit codes** — cryptographically random, unique among active shares.
- **Background cleanup** — expired records and files are purged automatically.
- **Modern responsive UI** — dark navy + blue/purple theme, mobile-friendly, drag-and-drop,
  status indicators, and success/error notifications.
- **Security basics** — filename sanitisation, path-traversal protection, size limits,
  and no arbitrary file access.

---

## 🧰 Technologies Used

| Layer      | Technology                    |
|------------|-------------------------------|
| Backend    | Python 3 + **Flask**          |
| Frontend   | HTML5, CSS3, **vanilla JavaScript** |
| Database   | **SQLite** (`database.db`)    |
| Networking | **HTTP over TCP/IP**          |
| Storage    | Local `uploads/` directory    |

No React, Node.js, or heavy frameworks are required to run the project.

---

## 🏗️ System Architecture

```
   ┌───────────────┐        HTTP request (TCP/IP)        ┌────────────────────────┐
   │  CLIENT A      │  ───────────────────────────────►  │      FLASK SERVER       │
   │ (laptop/phone) │      POST /api/share/text|file      │   0.0.0.0:5000          │
   │   browser      │  ◄───────────────────────────────  │                         │
   └───────────────┘        HTTP response (6-digit code)  │  ┌───────────────────┐  │
                                                          │  │  SQLite database  │  │
   ┌───────────────┐        POST /api/retrieve            │  │  (shares table)   │  │
   │  CLIENT B      │  ───────────────────────────────►  │  └───────────────────┘  │
   │ (laptop/phone) │      GET  /download/<id>            │  ┌───────────────────┐  │
   │   browser      │  ◄───────────────────────────────  │  │ uploads/ (files)  │  │
   └───────────────┘        text / file bytes             │  └───────────────────┘  │
                                                          └────────────────────────┘
                 All arrows travel over the local Wi-Fi / LAN using HTTP on top of TCP.
```

**Client–server model:** the Flask program is the single **server**; every browser
(laptop, phone, tablet) on the Wi-Fi is a **client**. Many clients can talk to the one
server at the same time.

---

## 📁 Folder Structure

```
QuickShare/
│
├── app.py              # Flask server: routes, SQLite, code generation, expiry, cleanup
├── requirements.txt    # Python dependencies (Flask)
├── README.md           # This file
├── database.db         # SQLite database (auto-created on first run)
│
├── templates/          # Server-rendered HTML pages
│   ├── index.html      # Home page (Share / Retrieve choices)
│   ├── share.html      # Share text or a file
│   └── retrieve.html   # Enter a code to retrieve content
│
├── static/
│   ├── css/
│   │   └── style.css   # Dark navy + purple theme, responsive
│   └── js/
│       └── app.js      # All client-side logic (fetch/XHR calls to the server)
│
└── uploads/            # Uploaded files are stored here temporarily
    └── .gitkeep
```

---

## ⚙️ Installation

You need **Python 3.8+** installed.

```bash
# 1. Go into the project folder
cd QuickShare

# 2. Create a virtual environment
python -m venv venv

# 3. Activate it
#    Windows (PowerShell):
venv\Scripts\activate
#    macOS / Linux:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt
```

---

## ▶️ How to Run the Server

```bash
python app.py
```

You should see:

```
 * QuickShare running on http://0.0.0.0:5000  (shares expire in 10 min)
```

Open **http://localhost:5000** on the same computer to try it.

### Configuration (optional environment variables)

| Variable         | Default | Meaning                          |
|------------------|---------|----------------------------------|
| `HOST`           | 0.0.0.0 | Interface to bind (LAN-wide)     |
| `PORT`           | 5000    | TCP port to listen on            |
| `EXPIRY_MINUTES` | 10      | Minutes before a share expires   |
| `MAX_FILE_MB`    | 50      | Maximum upload size in MB        |

Example: `PORT=8080 EXPIRY_MINUTES=5 python app.py`

---

## 📶 How to Access It From Another Device (same Wi-Fi)

`127.0.0.1` / `localhost` only works on the **same** machine. To reach the server from
your phone or another laptop, use the server computer's **local IP address**.

**1. Find the server's local IP:**

- **Windows:** open Command Prompt → run `ipconfig` → look for **IPv4 Address**
  (e.g. `192.168.1.5`).
- **macOS:** `ipconfig getifaddr en0` (Wi-Fi) or check System Settings → Network.
- **Linux:** `hostname -I` or `ip a` → find the `192.168.x.x` / `10.x.x.x` address.

**2. On the other device (same Wi-Fi), open:**

```
http://192.168.1.5:5000
```

(replace `192.168.1.5` with your actual IP).

**3. Tips if it does not connect:**
- Both devices must be on the **same** Wi-Fi network.
- Allow Python/Flask through the computer's **firewall** (Windows may prompt the first time).
- Some "Guest" / public Wi-Fi networks block device-to-device traffic — use a home/hotspot network.

---

## 🧪 Example Usage

1. On the **laptop**, open the app → click **Share Something**.
2. Paste some text (or switch to the **File** tab and drop a file) → click **Generate Share Code**.
3. The app shows a code, e.g. **`482731`**, with *"Share this code with the other device."*
4. On the **phone** (same Wi-Fi, `http://<laptop-ip>:5000`) → click **Retrieve with Code**.
5. Type `482731` → **Retrieve** → the text appears (or a **Download** button for files).
6. After 10 minutes the code stops working and the data is deleted.

---

## 🌐 Computer Networks Concepts Demonstrated

| Concept                         | Where it appears in QuickShare |
|---------------------------------|--------------------------------|
| **Client–server architecture**  | Flask = server; browsers = clients (see comments at top of `app.py`). |
| **IP address**                  | Access via `http://<server-ip>:5000` from other devices. |
| **Port number**                 | Server listens on TCP port `5000`. |
| **TCP**                         | Flask's WSGI server accepts reliable TCP connections. |
| **HTTP**                        | Every page load and API call is an HTTP request/response. |
| **Request/response model**      | `POST /api/share/text` → JSON response with a code. |
| **Data transmission**           | Text sent as JSON; files sent as `multipart/form-data`. |
| **File transfer**               | Upload (`/api/share/file`) and download (`/download/<id>`). |
| **LAN communication**           | Devices communicate over the local Wi-Fi network. |
| **Multiple clients, one server**| Several phones/laptops can connect simultaneously. |

Look for the `# CLIENT <-> SERVER` and networking comments in `app.py` and `static/js/app.js`.

---

## 🔒 Security & Validation (student-project level)

- Codes are validated to be exactly **6 numeric digits**.
- Uploaded filenames are sanitised with `secure_filename` (blocks `../../` path traversal).
- Stored files get a random prefix so uploads never overwrite each other.
- Downloads are only allowed for **valid, unexpired** database records — the raw disk path
  is never exposed and arbitrary server files can't be requested.
- Uploads are capped at **50 MB** (`MAX_CONTENT_LENGTH`).
- Codes are generated with Python's cryptographically secure `secrets` module.
- No accounts, no personal data are stored.

> ⚠️ **QuickShare is intended for trusted local networks only.** It is a teaching project,
> not production-grade cloud storage. Do not expose it to the public internet.

---

## 🗄️ Database Schema (`shares` table)

| Column              | Type    | Purpose                              |
|---------------------|---------|--------------------------------------|
| `id`                | TEXT PK | Random id used in `/download/<id>`   |
| `code`              | TEXT    | Unique 6-digit code the user types   |
| `type`              | TEXT    | `text` or `file`                     |
| `content`           | TEXT    | The shared text (NULL for files)     |
| `filename`          | TEXT    | Stored filename on disk              |
| `original_filename` | TEXT    | Friendly name shown to the user      |
| `filepath`          | TEXT    | Absolute path on the server          |
| `filesize`          | INTEGER | Size in bytes                        |
| `created_at`        | TEXT    | Creation timestamp (UTC, ISO)        |
| `expires_at`        | TEXT    | Expiry timestamp (UTC, ISO)          |

---

## 🔌 API Routes

| Method | Route                 | Description                              |
|--------|-----------------------|------------------------------------------|
| GET    | `/`                   | Home page                                |
| GET    | `/share`              | Share page                               |
| GET    | `/retrieve`           | Retrieve page                            |
| POST   | `/api/share/text`     | Store text, return a 6-digit code (JSON) |
| POST   | `/api/share/file`     | Upload a file, return a code (JSON)      |
| POST   | `/api/retrieve`       | Look up a code, return content/metadata  |
| GET    | `/download/<id>`      | Download a shared file                   |
| GET    | `/api/health`         | Health check                             |

---

## 🚧 Limitations

- Designed for a **LAN**, not the public internet.
- Uses Flask's development server (fine for a demo, not for heavy production load).
- SQLite is single-file; great for a lab, not for large-scale concurrency.
- Files are stored unencrypted in `uploads/` until they expire.

## 🔮 Future Enhancements

- QR code for the 6-digit code so phones can join instantly.
- Optional password protection per share.
- End-to-end encryption of file contents.
- Configurable expiry per share and one-time (single-use) codes.
- Chunked / resumable uploads for very large files.
- Deploy behind a production WSGI server (gunicorn/waitress).

---

## 🎓 Viva Questions & Answers

**Q1. What is the client–server architecture in this project?**
The Flask program (`app.py`) is the **server** — it listens on a port and responds to
requests. Each browser that opens the site is a **client**. Clients send requests; the
server processes them and returns responses.

**Q2. Which transport-layer protocol is used and why?**
**TCP.** HTTP runs on top of TCP, which provides reliable, ordered, error-checked delivery
— important so shared text and files arrive intact.

**Q3. Why do we bind to `0.0.0.0` instead of `127.0.0.1`?**
`127.0.0.1` (loopback) is reachable only from the same machine. `0.0.0.0` means "listen on
all network interfaces", so other devices on the Wi-Fi can connect using the machine's LAN IP.

**Q4. What is a port number and which one do we use?**
A port identifies a specific process/service on a host. QuickShare uses TCP port **5000**.
The full address a client connects to is `IP:port`, e.g. `192.168.1.5:5000`.

**Q5. How is text transmitted vs. how is a file transmitted?**
Text is sent as a JSON body in a `POST` request. Files are sent as
`multipart/form-data`, which packages the raw bytes plus metadata in the request body.

**Q6. Walk through the request/response cycle for sharing text.**
Browser sends `POST /api/share/text` with the text → server generates a unique 6-digit code,
stores it in SQLite, and responds with JSON containing the code → browser displays the code.

**Q7. How does the 6-digit code system work?**
On share, the server creates a random 6-digit code (using the secure `secrets` module),
ensures it isn't already used by an active share, and saves it. On retrieve, the client sends
the code; the server looks it up, checks expiry, and returns the content.

**Q8. How does expiry work?**
Each record stores `created_at` and `expires_at` (10 minutes later). Before returning any
content the server checks the current time against `expires_at`. A background thread also
deletes expired rows and their files every minute.

**Q9. What happens when multiple devices connect at once?**
Flask handles each request in the connection it arrives on (threaded mode), so several
clients can share/retrieve simultaneously against the same server and database.

**Q10. What security measures are included?**
Code validation, filename sanitisation, path-traversal prevention, a 50 MB size limit,
download only for valid/unexpired records, and cryptographically random codes.

**Q11. Why is this not suitable for the public internet?**
It uses the development server, stores files unencrypted, and has no authentication. It is
designed for a **trusted LAN**. Exposing it publicly would be insecure.

**Q12. What is HTTP and how is it used here?**
HTTP is the application-layer request/response protocol of the web. Every action in
QuickShare (loading a page, sharing, retrieving, downloading) is an HTTP request answered
by an HTTP response.

---

## 🐞 Common Errors & Fixes

| Problem | Fix |
|---------|-----|
| Other device can't open the site | Ensure both devices are on the **same Wi-Fi**; use the LAN IP (not `localhost`); allow Python through the **firewall**. |
| `Address already in use` on port 5000 | Another app is using the port. Run with a different port: `PORT=8080 python app.py`. |
| `ModuleNotFoundError: flask` | Activate the virtual environment and run `pip install -r requirements.txt`. |
| File upload fails with "too large" | The file exceeds 50 MB. Increase with `MAX_FILE_MB=100 python app.py` (for the demo). |
| Code says "expired" too soon | Shares last 10 minutes by default; increase with `EXPIRY_MINUTES=30 python app.py`. |
| macOS AirDrop uses port 5000 | Disable "AirPlay Receiver" in System Settings, or use another port. |

---

## 📸 Suggested Screenshots for the Report

1. Home page showing the two options (Share / Retrieve).
2. Text share page with a generated 6-digit code.
3. File share page mid-upload (progress bar visible).
4. Retrieve page showing retrieved text.
5. Retrieve page showing a file with the Download button.
6. The phone browser showing `http://192.168.x.x:5000` (proves LAN access).
7. Terminal showing the server running on `0.0.0.0:5000`.
8. An "expired code" error message (demonstrates expiry).

---

*Made for a Computer Networks lab. Run it, share a note between your laptop and phone, and
explain the packets flying across your Wi-Fi. Happy demoing! 🎉*
