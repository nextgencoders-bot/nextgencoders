"""Create the first SupportNova administrator in Firebase Authentication/Firestore."""
from __future__ import annotations

import base64
import getpass
import os

from firebase_admin import auth
from firebase_store import initialize


def main() -> None:
    db, _bucket = initialize()
    email = input("Administrator email: ").strip().lower()
    name = input("Administrator display name: ").strip()
    existing_admin = next(
        (doc for doc in db.collection("users").stream()
         if (doc.to_dict() or {}).get("role") == "admin"
         and (doc.to_dict() or {}).get("active", 1)),
        None,
    )
    if existing_admin:
        raise SystemExit("A SupportNova administrator is already configured. Use that account or contact its owner.")
    try:
        user = auth.get_user_by_email(email)
        if user.disabled:
            raise SystemExit("This Firebase account is disabled. Enable it in Firebase Authentication before bootstrapping.")
        password = getpass.getpass("Set a new password for this account (12+ characters; press Enter to keep its current password): ")
        if password and len(password) < 12:
            raise SystemExit("Password must contain at least 12 characters.")
        if name:
            user = auth.update_user(user.uid, display_name=name, **({"password": password} if password else {}))
        elif password:
            user = auth.update_user(user.uid, password=password)
        print("Found the existing Firebase account; completing its SupportNova administrator setup.")
    except auth.UserNotFoundError:
        password = getpass.getpass("New password (12+ characters): ")
        if len(password) < 12:
            raise SystemExit("Password must contain at least 12 characters.")
        user = auth.create_user(email=email, password=password, display_name=name)
    auth.set_custom_user_claims(user.uid, {"role": "admin"})
    doc_id = base64.urlsafe_b64encode(user.uid.encode()).decode().rstrip("=") or "_"
    db.collection("users").document(doc_id).set({
        "id": user.uid, "email": email, "name": name, "role": "admin", "active": 1,
    })
    print(f"Created Firebase administrator {email} (UID {user.uid}).")


if __name__ == "__main__":
    main()
