#!/usr/bin/env python
"""One-off CLI to bootstrap a user (typically the first admin) since the
database is intentionally seeded empty. Not part of the API.

Usage:
    python scripts/create_user.py --username admin@prostaai.vn --password secret \
        --full-name "Admin Hệ thống" --role admin
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", default=None)
    parser.add_argument("--role", choices=["user", "admin"], default="user")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == args.username).first():
            print(f"User '{args.username}' already exists.")
            return

        user = User(
            username=args.username,
            password_hash=hash_password(args.password),
            full_name=args.full_name,
            role=args.role,
            is_active=1,
        )
        db.add(user)
        db.commit()
        print(f"Created {args.role} user '{args.username}' (id={user.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
