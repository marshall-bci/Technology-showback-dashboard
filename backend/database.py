import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Float, JSON, DateTime
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


class CostModelEntry(Base):
    __tablename__ = "cost_model"
    id                  = Column(Integer, primary_key=True)
    branch_name         = Column(String, default="")
    gl_code             = Column(String, default="")
    branch_code         = Column(String, default="")
    pid                 = Column(String, index=True, default="")
    gl_category         = Column(String, default="")
    cost_model_category = Column(String, default="")
    description         = Column(String, default="")
    required            = Column(String, default="")
    current_cost_model  = Column(String, default="")
    allocation          = Column(String, default="")
    future_cost_model   = Column(String, default="")
    showback_type       = Column(String, default="")
    user_listing_flag   = Column(String, default="")


class HeadcountEntry(Base):
    __tablename__ = "headcount"
    id         = Column(Integer, primary_key=True)
    dept_code  = Column(String, default="")
    short_code = Column(String, index=True, default="")
    dept_name  = Column(String, default="")
    fy2026     = Column(Float, default=0.0)


class UserListingEntry(Base):
    __tablename__ = "user_listing"
    id          = Column(Integer, primary_key=True)
    branch_code = Column(String, default="")
    gl_code     = Column(String, default="")
    pid         = Column(String, index=True, default="")
    description = Column(String, default="")
    # UL columns F–R (order matches VBA): CEO, Legal, CorpOps, HR, Audit, CD&O,
    # Finance, Technology, IO, IRR, PE, CM&CI, ISR
    ceo        = Column(Float, default=0.0)
    legal      = Column(Float, default=0.0)
    corp_ops   = Column(Float, default=0.0)
    hr         = Column(Float, default=0.0)
    audit      = Column(Float, default=0.0)
    cdo        = Column(Float, default=0.0)
    finance    = Column(Float, default=0.0)
    technology = Column(Float, default=0.0)
    io         = Column(Float, default=0.0)
    irr        = Column(Float, default=0.0)
    pe         = Column(Float, default=0.0)
    cmci       = Column(Float, default=0.0)
    isr        = Column(Float, default=0.0)


class OcRawRow(Base):
    __tablename__ = "oc_raw"
    id        = Column(Integer, primary_key=True)
    oc_cell   = Column(String)
    actuals   = Column(Float, default=0.0)
    forecast1 = Column(Float, default=0.0)
    forecast2 = Column(Float, default=0.0)
    budget    = Column(Float, default=0.0)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
