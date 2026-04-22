import os, json
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy.orm import Session

from auth import router as auth_router, get_current_user, require_admin
from database import engine, Base, get_db, User, AccessLog
from models import UserCreate, UserUpdate, UserResponse, LogEntry
from permissions import filter_for_user
from parser import parse_management_tab
from logger import log_access

# Create DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Technology Showback Dashboard API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── Middleware ────────────────────────────────────────────────────────────────
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.add_middleware(SessionMiddleware,
                   secret_key=os.getenv("SESSION_SECRET", os.urandom(32).hex()))

app.include_router(auth_router, prefix="/auth", tags=["auth"])

# ── Cost data storage ─────────────────────────────────────────────────────────
DATA_FILE = Path(__file__).parent / "data" / "cost_data.json"
DATA_FILE.parent.mkdir(exist_ok=True)


def _load_data() -> dict:
    if not DATA_FILE.exists():
        return {"rows": [], "updatedAt": None, "sheetName": None}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def _save_data(rows: list, sheet_name: str):
    payload = {"rows": rows, "sheetName": sheet_name, "updatedAt": datetime.utcnow().isoformat()}
    DATA_FILE.write_text(json.dumps(payload), encoding="utf-8")
    return payload


# ── Data endpoints ────────────────────────────────────────────────────────────
@app.get("/api/data")
async def get_data(request: Request, current_user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    log_access(db, current_user.email, "view_data", "/api/data",
               request.client.host if request.client else "")
    payload = _load_data()
    filtered = filter_for_user(payload["rows"], current_user)
    return {**payload, "rows": filtered,
            "totalRows": len(payload["rows"]), "visibleRows": len(filtered)}


@app.post("/api/upload")
async def upload_file(request: Request, file: UploadFile = File(...),
                      current_user: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    content = await file.read()
    rows, sheet_name = parse_management_tab(content)
    _save_data(rows, sheet_name)
    log_access(db, current_user.email, "upload_data", f"{sheet_name} ({len(rows)} rows)",
               request.client.host if request.client else "",
               {"rowCount": len(rows), "filename": file.filename})
    return {"ok": True, "rowCount": len(rows), "sheetName": sheet_name}


@app.post("/api/push")
async def push_data(request: Request, current_user: User = Depends(require_admin),
                    db: Session = Depends(get_db)):
    """Finance script POSTs pre-parsed rows here after running the VBA macro."""
    body = await request.json()
    rows       = body.get("rows", [])
    sheet_name = body.get("sheetName", "Unknown")
    if not isinstance(rows, list):
        raise HTTPException(400, "rows must be an array")
    _save_data(rows, sheet_name)
    log_access(db, current_user.email, "push_data", f"{sheet_name} ({len(rows)} rows)",
               request.client.host if request.client else "")
    return {"ok": True, "rowCount": len(rows)}


# ── Admin: user management ────────────────────────────────────────────────────
@app.get("/admin/users", response_model=list[UserResponse])
async def list_users(request: Request, current_user: User = Depends(require_admin),
                     db: Session = Depends(get_db)):
    log_access(db, current_user.email, "list_users", "/admin/users",
               request.client.host if request.client else "")
    return db.query(User).order_by(User.email).all()


@app.post("/admin/users", response_model=UserResponse, status_code=201)
async def create_user(request: Request, user_in: UserCreate,
                      current_user: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_in.email.lower()).first():
        raise HTTPException(409, f"{user_in.email} already exists — use PUT to update")
    user = User(
        email=user_in.email.lower(),
        display_name=user_in.display_name or user_in.email.split("@")[0],
        is_admin=user_in.is_admin,
        allowed_gl_codes=user_in.allowed_gl_codes,
        allowed_branches=user_in.allowed_branches,
    )
    db.add(user); db.commit(); db.refresh(user)
    log_access(db, current_user.email, "create_user", user.email,
               request.client.host if request.client else "")
    return user


@app.put("/admin/users/{email}", response_model=UserResponse)
async def update_user(request: Request, email: str, user_in: UserUpdate,
                      current_user: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user:
        raise HTTPException(404, "User not found")
    for field, val in user_in.model_dump(exclude_unset=True).items():
        setattr(user, field, val)
    user.updated_at = datetime.utcnow()
    db.commit(); db.refresh(user)
    log_access(db, current_user.email, "update_user", email,
               request.client.host if request.client else "")
    return user


@app.delete("/admin/users/{email}")
async def delete_user(request: Request, email: str,
                      current_user: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user); db.commit()
    log_access(db, current_user.email, "delete_user", email,
               request.client.host if request.client else "")
    return {"ok": True}


# ── Admin: usage logs ─────────────────────────────────────────────────────────
@app.get("/admin/logs", response_model=list[LogEntry])
async def get_logs(current_user: User = Depends(require_admin),
                   db: Session = Depends(get_db), limit: int = 500):
    return db.query(AccessLog).order_by(AccessLog.timestamp.desc()).limit(limit).all()


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"ok": True, "version": "1.0.0"}
