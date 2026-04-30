import os, secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from authlib.integrations.httpx_client import AsyncOAuth2Client
from sqlalchemy.orm import Session
from database import get_db, User

router = APIRouter()

# ── Config (all from .env) ───────────────────────────────────────────────────
JWT_SECRET  = os.getenv("JWT_SECRET_KEY", "CHANGE_THIS_IN_PRODUCTION")
JWT_ALG     = os.getenv("JWT_ALGORITHM",  "HS256")
JWT_EXPIRE  = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))  # 8 hours

TENANT_ID     = os.getenv("AZURE_TENANT_ID",     "common")
CLIENT_ID     = os.getenv("AZURE_CLIENT_ID",     "")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")
REDIRECT_URI  = os.getenv("AZURE_REDIRECT_URI",  "http://localhost:8000/auth/callback")
FRONTEND_URL  = os.getenv("FRONTEND_URL",         "http://localhost:5173")

TRUST_ZSCALER = os.getenv("TRUST_ZSCALER_HEADERS", "false").lower() == "true"

# Known ZPA identity headers in priority order — used when ZSCALER_USER_HEADER=auto
_ZPA_HEADERS = [
    "X-Zscaler-Auth-User",
    "X-Forwarded-User",
    "X-User-Email",
    "X-Auth-Request-Email",
    "X-Remote-User",
]

def _get_zscaler_email(request: Request) -> str:
    """Return the ZPA identity email from the first matching header, or ''."""
    explicit = os.getenv("ZSCALER_USER_HEADER", "auto").strip()
    headers_to_try = [explicit] if explicit.lower() != "auto" else _ZPA_HEADERS
    for h in headers_to_try:
        val = request.headers.get(h, "").strip().lower()
        if "@" in val:
            return val
    return ""

AUTHORITY     = f"https://login.microsoftonline.com/{TENANT_ID}"
AUTHORIZE_URL = f"{AUTHORITY}/oauth2/v2.0/authorize"
TOKEN_URL     = f"{AUTHORITY}/oauth2/v2.0/token"
SCOPES        = ["openid", "profile", "email", "User.Read"]


# ── JWT helpers ───────────────────────────────────────────────────────────────
def create_jwt(user: User) -> str:
    payload = {
        "sub":              user.email,
        "email":            user.email,
        "name":             user.display_name,
        "is_admin":         user.is_admin,
        "allowed_gl_codes":    user.allowed_gl_codes    or [],
        "allowed_branches":    user.allowed_branches    or [],
        "allowed_departments": user.allowed_departments or [],
        "exp":              datetime.utcnow() + timedelta(minutes=JWT_EXPIRE),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def _extract_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    token = request.cookies.get("access_token")
    if token:
        return token
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated",
                        headers={"WWW-Authenticate": "Bearer"})


# ── Dependencies ──────────────────────────────────────────────────────────────
async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _extract_token(request)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        email: str = payload.get("sub", "")
        if not email:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    user = db.query(User).filter(User.email == email.lower()).first()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or deactivated")
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return current_user


# ── Auth routes ───────────────────────────────────────────────────────────────
@router.get("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    # ZPA identity trust — skip OAuth if Zscaler already authenticated the user
    if TRUST_ZSCALER:
        email = _get_zscaler_email(request)
        if email:
            user = db.query(User).filter(User.email == email, User.is_active == True).first()
            if not user:
                return RedirectResponse(f"{FRONTEND_URL}?auth_error=not_authorised&email={email}")
            token_str = create_jwt(user)
            response = RedirectResponse(f"{FRONTEND_URL}?auth_success=1")
            response.set_cookie("access_token", token_str, httponly=True, samesite="lax",
                                max_age=JWT_EXPIRE * 60,
                                secure=os.getenv("APP_ENV") == "production")
            return response

    # Fall back to Microsoft OAuth
    if not CLIENT_ID:
        raise HTTPException(500, "SSO not configured — set AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET in .env")
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state
    client = AsyncOAuth2Client(client_id=CLIENT_ID, redirect_uri=REDIRECT_URI)
    url, _ = client.create_authorization_url(AUTHORIZE_URL, state=state, scope=" ".join(SCOPES))
    return RedirectResponse(url)


@router.get("/callback")
async def callback(request: Request, db: Session = Depends(get_db)):
    stored_state = request.session.pop("oauth_state", None)
    code  = request.query_params.get("code")
    state = request.query_params.get("state")
    error = request.query_params.get("error")

    if error:
        return RedirectResponse(f"{FRONTEND_URL}?auth_error={error}")
    if not code or state != stored_state:
        return RedirectResponse(f"{FRONTEND_URL}?auth_error=invalid_state")

    try:
        async with AsyncOAuth2Client(client_id=CLIENT_ID, client_secret=CLIENT_SECRET,
                                     redirect_uri=REDIRECT_URI) as client:
            await client.fetch_token(TOKEN_URL, code=code)
            resp = await client.get("https://graph.microsoft.com/v1.0/me")
            userinfo = resp.json()
    except Exception:
        return RedirectResponse(f"{FRONTEND_URL}?auth_error=token_exchange_failed")

    email = (userinfo.get("mail") or userinfo.get("userPrincipalName") or "").lower()
    if not email:
        return RedirectResponse(f"{FRONTEND_URL}?auth_error=no_email")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return RedirectResponse(f"{FRONTEND_URL}?auth_error=not_authorised&email={email}")
    if not user.is_active:
        return RedirectResponse(f"{FRONTEND_URL}?auth_error=account_inactive")

    user.display_name = userinfo.get("displayName", user.display_name or email.split("@")[0])
    db.commit()

    token_str = create_jwt(user)
    response  = RedirectResponse(f"{FRONTEND_URL}?auth_success=1")
    response.set_cookie(
        "access_token", token_str,
        httponly=True, samesite="lax",
        max_age=JWT_EXPIRE * 60,
        secure=os.getenv("APP_ENV") == "production",
    )
    return response


def _safe_redirect(next_url: str | None) -> str:
    """Return next_url if it looks like a local origin, else fall back to FRONTEND_URL."""
    if next_url:
        from urllib.parse import urlparse
        h = urlparse(next_url).hostname or ""
        if h in ("localhost", "127.0.0.1") or h.startswith("192.168.") or h.startswith("10.") or h.startswith("172."):
            return next_url
    return FRONTEND_URL


def _logout_response(next_url: str | None = None):
    response = RedirectResponse(_safe_redirect(next_url), status_code=302)
    response.delete_cookie("access_token", path="/")
    return response

@router.get("/logout")
async def logout_get(next: str | None = None):
    return _logout_response(next)

@router.post("/logout")
async def logout_post(next: str | None = None):
    return _logout_response(next)


@router.get("/dev-login")
async def dev_login(email: str = "testadmin@bci.ca", next: str | None = None, db: Session = Depends(get_db)):
    """Local dev only — bypasses SSO. Pass ?email= to switch accounts."""
    if os.getenv("APP_ENV", "development") != "development":
        raise HTTPException(403, "Dev login is disabled in production")
    user = db.query(User).filter(User.email == email.lower(), User.is_active == True).first()
    if not user:
        raise HTTPException(404, f"{email} not found or inactive. Run: python init_admin.py {email}")
    token_str = create_jwt(user)
    response = RedirectResponse(f"{_safe_redirect(next)}?auth_success=1", status_code=302)
    response.set_cookie("access_token", token_str, httponly=True, samesite="lax",
                        max_age=JWT_EXPIRE * 60)
    return response


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "email":                  current_user.email,
        "name":                   current_user.display_name,
        "is_admin":               current_user.is_admin,
        "can_edit_user_listing":  current_user.can_edit_user_listing,
        "allowed_gl_codes":       current_user.allowed_gl_codes    or [],
        "allowed_branches":       current_user.allowed_branches    or [],
        "allowed_departments":    current_user.allowed_departments or [],
        "overview_mode":          current_user.overview_mode or 'viewer',
    }
