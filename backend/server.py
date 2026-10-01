"""
Preview bridge for the Emergent platform.

The QuickShare project is a standalone Flask (WSGI) app that lives in
/app/QuickShare and normally runs with `python app.py` on port 5000.

Inside this hosted preview, the platform starts the backend with
`uvicorn server:app` on port 8001 (an ASGI server). We therefore load the
Flask WSGI app and wrap it with a2wsgi so uvicorn can serve it unchanged.

None of this file is needed to run the project on your own laptop for the
college demo -- there you just run `python app.py`.
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QUICKSHARE_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "QuickShare"))
if QUICKSHARE_DIR not in sys.path:
    sys.path.insert(0, QUICKSHARE_DIR)

try:
    from app import app as flask_app          # the Flask (WSGI) application
    from a2wsgi import WSGIMiddleware          # adapts WSGI -> ASGI
    app = WSGIMiddleware(flask_app)            # `uvicorn server:app` serves this
except Exception:
    from fastapi import FastAPI
    app = FastAPI()

