from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    display_name: Optional[str] = None
    is_admin: bool = False
    can_edit_user_listing: bool = False
    can_view_quality: bool = False
    allowed_gl_codes: List[str] = []
    allowed_branches: List[str] = []
    allowed_departments: List[str] = []


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None
    can_edit_user_listing: Optional[bool] = None
    can_view_quality: Optional[bool] = None
    allowed_gl_codes: Optional[List[str]] = None
    allowed_branches: Optional[List[str]] = None
    allowed_departments: Optional[List[str]] = None


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    is_admin: bool
    is_active: bool
    can_edit_user_listing: bool
    can_view_quality: bool = False
    allowed_gl_codes: List[str] = []
    allowed_branches: List[str] = []
    allowed_departments: List[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LogEntry(BaseModel):
    id: int
    user_email: str
    action: str
    resource: str
    ip_address: str
    timestamp: datetime
    details: Any

    model_config = {"from_attributes": True}
