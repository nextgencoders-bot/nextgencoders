"""Firebase Authentication REST sign-in and Admin SDK session helpers."""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

def _auth():
    try:
        from firebase_admin import auth
        return auth
    except ImportError as exc:
        raise RuntimeError("Install firebase-admin to use Firebase Authentication: python -m pip install -r requirements.txt") from exc


def sign_in(email: str, password: str) -> dict:
    api_key = os.environ.get("FIREBASE_WEB_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Set FIREBASE_WEB_API_KEY in .env to enable Firebase sign-in.")
    url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + urllib.parse.quote(api_key)
    request = urllib.request.Request(
        url,
        data=json.dumps({"email": email, "password": password, "returnSecureToken": True}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read(128_000))
    except urllib.error.HTTPError as exc:
        raise PermissionError("Email or password is incorrect.") from exc


def create_session(id_token: str) -> str:
    auth = _auth()
    claims = auth.verify_id_token(id_token)
    if time.time() - claims.get("auth_time", 0) > 5 * 60:
        raise PermissionError("Please sign in again to start a secure session.")
    cookie = auth.create_session_cookie(id_token, expires_in=12 * 60 * 60)
    return cookie.decode("utf-8") if isinstance(cookie, bytes) else cookie


def verify_session(session_cookie: str) -> dict:
    return _auth().verify_session_cookie(session_cookie, check_revoked=True)
