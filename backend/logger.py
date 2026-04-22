from datetime import datetime
from database import AccessLog


def log_access(db, user_email: str, action: str, resource: str, ip: str = "", details: dict = None):
    entry = AccessLog(
        user_email=user_email,
        action=action,
        resource=resource,
        ip_address=ip or "",
        timestamp=datetime.utcnow(),
        details=details or {},
    )
    db.add(entry)
    db.commit()
