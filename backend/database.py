import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Boolean, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./backend/data/app.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String, unique=True, index=True, nullable=False)
    display_name  = Column(String, default="")
    is_admin      = Column(Boolean, default=False)
    is_active     = Column(Boolean, default=True)
    # Empty list = no access. Admins bypass this check entirely.
    allowed_gl_codes  = Column(JSON, default=list)
    allowed_branches  = Column(JSON, default=list)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow)


class AccessLog(Base):
    __tablename__ = "access_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_email  = Column(String, index=True)
    action      = Column(String)       # login, view_data, upload, create_user, etc.
    resource    = Column(String)
    ip_address  = Column(String, default="")
    timestamp   = Column(DateTime, default=datetime.utcnow, index=True)
    details     = Column(JSON, default=dict)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
