"""Firebase persistence adapter for the app's existing SQLite query layer.

Cloud Firestore is the durable source of record. SQLite is only a local working
cache. When Cloud Storage is unavailable (for example on Spark), binary content
is stored as bounded Firestore byte chunks, subject to Firestore quotas.
"""
from __future__ import annotations

import base64
import json
import os
import sqlite3
from pathlib import Path

firebase_admin = None
credentials = firestore = storage = None

TABLES = (
    "users", "tickets", "orders", "events", "analysis_runs", "rules", "policies",
    "policy_versions", "policy_chunks", "policy_conflicts", "attachments",
    "sla_rules", "followups", "customer_updates", "escalation_conditions",
    "prompt_versions", "policy_files", "organization_profile",
)
SKIP = {"sessions"}


def _doc_id(value: object) -> str:
    raw = str(value).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") or "_"


def initialize():
    global firebase_admin, credentials, firestore, storage
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.is_file():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip().strip("\"'")
            if key and key not in os.environ:
                os.environ[key] = value
    try:
        import firebase_admin as _firebase_admin
        from firebase_admin import credentials as _credentials, firestore as _firestore, storage as _storage
    except ImportError as exc:
        raise RuntimeError("Install firebase-admin to use Firebase storage: python -m pip install -r requirements.txt") from exc
    firebase_admin, credentials, firestore, storage = _firebase_admin, _credentials, _firestore, _storage
    if firebase_admin._apps:
        app = firebase_admin.get_app()
    else:
        credential_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        project_id = os.environ.get("FIREBASE_PROJECT_ID") or None
        bucket = os.environ.get("FIREBASE_STORAGE_BUCKET") or None
        if credential_path:
            options = {k: v for k, v in {"projectId": project_id, "storageBucket": bucket}.items() if v}
            app = firebase_admin.initialize_app(
                credentials.Certificate(credential_path),
                options,
            )
        else:
            options = {k: v for k, v in {"projectId": project_id, "storageBucket": bucket}.items() if v}
            app = firebase_admin.initialize_app(options=options or None)
    bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET")
    return firestore.client(app=app), storage.bucket(app=app) if bucket_name else None


def enabled() -> bool:
    return os.environ.get("SUPPORTNOVA_STORAGE", "firebase").strip().lower() == "firebase"


def setup_outbox(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS _firebase_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, row_key TEXT NOT NULL, operation TEXT NOT NULL)")
    for table in TABLES:
        columns = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
        pk = [row[1] for row in sorted((r for r in columns if r[5]), key=lambda r: r[5])]
        if not pk:
            continue
        old_key = "json_object(" + ",".join("'" + name + "',OLD.\"" + name + "\"" for name in pk) + ")"
        new_key = "json_object(" + ",".join("'" + name + "',NEW.\"" + name + "\"" for name in pk) + ")"
        for op, alias, key_expr in (("INSERT", "ai", new_key), ("UPDATE", "au", new_key), ("DELETE", "ad", old_key)):
            trigger = f"_fb_{table}_{alias}"
            conn.execute(f'DROP TRIGGER IF EXISTS "{trigger}"')
            conn.execute(
                f'CREATE TRIGGER "{trigger}" AFTER {op} ON "{table}" '
                f'BEGIN INSERT INTO _firebase_outbox(table_name,row_key,operation) VALUES(\'{table}\',{key_expr},\'{op}\'); END'
            )


def _key(row: dict) -> str:
    if "id" in row:
        return _doc_id(row["id"])
    if "document_id" in row and "version" in row:
        return _doc_id(row["document_id"] + "\0" + row["version"])
    return _doc_id(json.dumps(row, sort_keys=True, separators=(",", ":")))


_BLOB_CHUNK_SIZE = 500_000
_FIRESTORE_TIMEOUT = 20


def _write_blob(db, bucket, blob_id: str, raw: bytes, content_type: str = "application/octet-stream") -> None:
    if bucket is not None:
        bucket.blob(blob_id).upload_from_string(raw, content_type=content_type)
        return
    collection = db.collection("_supportnova_blobs").document(_doc_id(blob_id)).collection("chunks")
    for old in collection.stream(timeout=_FIRESTORE_TIMEOUT):
        old.reference.delete()
    batch = db.batch()
    for index, start in enumerate(range(0, len(raw), _BLOB_CHUNK_SIZE)):
        batch.set(collection.document(f"{index:06d}"), {"index": index, "data": raw[start:start + _BLOB_CHUNK_SIZE]})
    if not raw:
        batch.set(collection.document("000000"), {"index": 0, "data": b""})
    batch.commit(timeout=_FIRESTORE_TIMEOUT)


def _read_blob(db, bucket, blob_id: str) -> bytes:
    if bucket is not None:
        return bucket.blob(blob_id).download_as_bytes()
    chunks = db.collection("_supportnova_blobs").document(_doc_id(blob_id)).collection("chunks").order_by("index").stream(timeout=_FIRESTORE_TIMEOUT)
    return b"".join((item.to_dict() or {}).get("data", b"") for item in chunks)


def store_source_file(db, bucket, blob_id: str, raw: bytes, content_type: str) -> None:
    _write_blob(db, bucket, blob_id, raw, content_type)


def _firestore_value(table: str, row: dict, bucket, db) -> dict:
    value = dict(row)
    if table == "users":
        value.pop("password_hash", None)
    if table == "attachments":
        raw = value.pop("content", None)
        object_name = value.get("storage_path") or f"supportnova/evidence/{value['id']}"
        if raw:
            _write_blob(db, bucket, object_name, bytes(raw), value.get("media_type") or "application/octet-stream")
        value["storage_path"] = object_name
    elif table in {"policies", "policy_versions", "policy_chunks"}:
        content = value.get("content")
        if isinstance(content, str) and len(content.encode("utf-8")) > 700_000:
            object_name = f"supportnova/policy-content/{table}/{_key(value)}.txt"
            _write_blob(db, bucket, object_name, content.encode("utf-8"), "text/plain; charset=utf-8")
            value["content"] = None
            value["content_storage_path"] = object_name
    return value


def _sqlite_value(table: str, value: dict, bucket, db) -> dict:
    row = dict(value)
    if table == "attachments":
        object_name = row.pop("storage_path", None)
        row["content"] = _read_blob(db, bucket, object_name) if object_name else b""
    if table == "users":
        row["password_hash"] = ""
    if table in {"policies", "policy_versions", "policy_chunks"}:
        object_name = row.pop("content_storage_path", None)
        if object_name:
            row["content"] = _read_blob(db, bucket, object_name).decode("utf-8")
    return row


def install_schema(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS _firebase_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT NOT NULL, row_key TEXT NOT NULL, operation TEXT NOT NULL)")


def remote_has_data(db) -> bool:
    for table in TABLES:
        if table == "users":
            continue
        print(f"Checking Firebase {table}...", flush=True)
        if next(db.collection(table).limit(1).stream(timeout=_FIRESTORE_TIMEOUT), None) is not None:
            return True
    return False


def migration_state(db) -> str:
    snapshot = db.collection("_supportnova_meta").document("initial_migration").get(timeout=_FIRESTORE_TIMEOUT)
    return (snapshot.to_dict() or {}).get("state", "not_started") if snapshot.exists else "not_started"


def set_migration_state(db, state: str) -> None:
    from datetime import datetime, timezone
    db.collection("_supportnova_meta").document("initial_migration").set({
        "state": state,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }, timeout=_FIRESTORE_TIMEOUT)


def archive_legacy_users(conn: sqlite3.Connection, db) -> None:
    """Preserve old profile metadata without exporting local password hashes."""
    for row in conn.execute("SELECT id,email,name,role,active FROM users").fetchall():
        profile = dict(row)
        profile["active"] = 0
        profile["migration_status"] = "Recreate account in Firebase Authentication"
        db.collection("legacy_user_profiles").document(_doc_id(profile["id"])).set(profile, timeout=_FIRESTORE_TIMEOUT)


def hydrate_if_remote(conn: sqlite3.Connection, db, bucket) -> bool:
    """On first local bootstrap, replace a stale local cache with cloud rows."""
    marker = os.environ.get("SUPPORTNOVA_FIREBASE_HYDRATED") == "1"
    if marker:
        return False
    remote = []
    for table in TABLES:
        docs = list(db.collection(table).stream(timeout=_FIRESTORE_TIMEOUT))
        if docs:
            remote.extend((table, doc) for doc in docs)
    if not remote:
        os.environ["SUPPORTNOVA_FIREBASE_HYDRATED"] = "1"
        return False
    for table in TABLES:
        conn.execute(f'DELETE FROM "{table}"')
    for table, doc in remote:
        row = _sqlite_value(table, doc.to_dict() or {}, bucket, db)
        names = list(row)
        marks = ",".join("?" for _ in names)
        conn.execute(f'INSERT OR REPLACE INTO "{table}" ({",".join(chr(34)+n+chr(34) for n in names)}) VALUES ({marks})', [row[n] for n in names])
    conn.execute("DELETE FROM _firebase_outbox")
    os.environ["SUPPORTNOVA_FIREBASE_HYDRATED"] = "1"
    return True


def hydrate_users(conn: sqlite3.Connection, db, bucket) -> None:
    for document in db.collection("users").stream(timeout=_FIRESTORE_TIMEOUT):
        row = _sqlite_value("users", document.to_dict() or {}, bucket, db)
        names = list(row)
        marks = ",".join("?" for _ in names)
        conn.execute(f'INSERT OR REPLACE INTO "users" ({",".join(chr(34)+n+chr(34) for n in names)}) VALUES ({marks})', [row[n] for n in names])


def find_user_profile(db, uid: str) -> dict | None:
    """Fetch the SupportNova role profile by Firebase Auth UID."""
    snapshot = db.collection("users").document(_doc_id(uid)).get(timeout=_FIRESTORE_TIMEOUT)
    if snapshot.exists:
        return snapshot.to_dict() or {}
    matches = db.collection("users").where("id", "==", uid).limit(1).stream(timeout=_FIRESTORE_TIMEOUT)
    document = next(matches, None)
    return (document.to_dict() or {}) if document else None


def sync_outbox(conn: sqlite3.Connection, db, bucket) -> None:
    pending = conn.execute("SELECT id,table_name,row_key,operation FROM _firebase_outbox ORDER BY id").fetchall()
    if not pending:
        return
    latest = {}
    for change in pending:
        latest[(change["table_name"], change["row_key"])] = change
    for change in latest.values():
        table = change["table_name"]
        key_data = json.loads(change["row_key"])
        where = " AND ".join(f'"{name}"=?' for name in key_data)
        if change["operation"] == "DELETE":
            db.collection(table).document(_key(key_data)).delete(timeout=_FIRESTORE_TIMEOUT)
            continue
        result = conn.execute(f'SELECT * FROM "{table}" WHERE {where}', list(key_data.values())).fetchone()
        if result is None:
            db.collection(table).document(_key(key_data)).delete(timeout=_FIRESTORE_TIMEOUT)
        else:
            row = dict(result)
            db.collection(table).document(_key(row)).set(_firestore_value(table, row, bucket, db), timeout=_FIRESTORE_TIMEOUT)
    conn.execute("DELETE FROM _firebase_outbox")


def sync_all(conn: sqlite3.Connection, db, bucket) -> None:
    for table in TABLES:
        rows = conn.execute(f'SELECT * FROM "{table}"').fetchall()
        print(f"Saving {len(rows)} {table} records to Firebase...", flush=True)
        for row in rows:
            value = dict(row)
            db.collection(table).document(_key(value)).set(_firestore_value(table, value, bucket, db), timeout=_FIRESTORE_TIMEOUT)
    conn.execute("DELETE FROM _firebase_outbox")
