"""
Creates a test viewer account for local development.
Usage (from backend/ directory):
    python init_test_user.py
"""
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from database import engine, Base, SessionLocal, User

Base.metadata.create_all(bind=engine)

TEST_USERS = [
    {
        "email":            "testviewer@bci.ca",
        "display_name":     "Test Viewer",
        "is_admin":         False,
        "allowed_gl_codes": [],
        "allowed_branches": [],
    },
    {
        "email":            "testadmin@bci.ca",
        "display_name":     "Test Admin",
        "is_admin":         True,
        "allowed_gl_codes": [],
        "allowed_branches": [],
    },
]

db = SessionLocal()
try:
    for u in TEST_USERS:
        existing = db.query(User).filter(User.email == u["email"]).first()
        if existing:
            print(f"[SKIP] {u['email']} already exists")
        else:
            db.add(User(**u, is_active=True))
            db.commit()
            role = "admin" if u["is_admin"] else "viewer"
            print(f"[OK]   Created {u['email']} ({role})")
finally:
    db.close()

print()
print("Dev login switches between users via the /auth/dev-login endpoint.")
print("Use the Admin tab to change permissions once logged in.")
