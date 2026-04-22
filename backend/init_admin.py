"""
Bootstrap script — run once to create the first admin user.
Usage (from the backend/ directory):
    python init_admin.py marshall.singh@bci.ca "Marshall Singh"
"""
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from database import engine, Base, SessionLocal, User

Base.metadata.create_all(bind=engine)

def main():
    if len(sys.argv) < 2:
        print("Usage: python init_admin.py <email> [display_name]")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    name  = sys.argv[2].strip() if len(sys.argv) > 2 else email.split("@")[0]

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            existing.is_admin   = True
            existing.is_active  = True
            existing.display_name = name
            db.commit()
            print(f"[OK] Updated {email} -- is_admin=True, is_active=True")
        else:
            user = User(email=email, display_name=name, is_admin=True, is_active=True,
                        allowed_gl_codes=[], allowed_branches=[])
            db.add(user)
            db.commit()
            print(f"[OK] Created admin user: {email}")
        print("     Sign in via the dashboard to complete setup.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
