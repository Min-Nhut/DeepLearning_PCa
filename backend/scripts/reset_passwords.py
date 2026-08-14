#!/usr/bin/env python
"""Rotate every account's password to a freshly generated strong one.

The bootstrap accounts shipped with short, guessable passwords that were also
written down in a checked-in file — fine while this only ever ran on one laptop,
not fine the moment it is demonstrated on a network or handed to anyone else.

The new passwords are written to `backend/credentials.local.txt`, which is
gitignored: they have to live somewhere retrievable (losing admin access to your
own thesis system days before a defence is worse than the original problem), but
not somewhere that follows the repo.

Usage:
    python scripts/reset_passwords.py             # every account
    python scripts/reset_passwords.py --username admin@prostaai.vn
"""
import argparse
import os
import secrets
import string
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402

OUTPUT = Path(__file__).resolve().parent.parent / "credentials.local.txt"
# Deliberately no ambiguous glyphs (0/O, 1/l/I): these get read off a screen and
# typed by hand during a demo.
ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")


def generate(length: int = 16) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=None, help="only this account; default is all")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        query = db.query(User)
        if args.username:
            query = query.filter(User.username == args.username)
        users = query.order_by(User.id).all()
        if not users:
            print("No matching accounts.")
            return

        issued: list[tuple[str, str, str]] = []
        for user in users:
            password = generate()
            user.password_hash = hash_password(password)
            issued.append((user.username, user.role, password))
        db.commit()
    finally:
        db.close()

    lines = [
        "# ProstaAI — bootstrap account passwords",
        f"# Rotated {datetime.now():%Y-%m-%d %H:%M}. Gitignored on purpose; do not paste into docs.",
        "",
        *(f"{username:<32} {role:<6} {password}" for username, role, password in issued),
        "",
    ]
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")

    print(f"Rotated {len(issued)} account(s). Written to {OUTPUT}")
    for username, role, password in issued:
        print(f"  {username:<32} {role:<6} {password}")


if __name__ == "__main__":
    main()
