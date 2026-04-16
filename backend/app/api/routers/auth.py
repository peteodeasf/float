import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from app.core.dependencies import get_current_user
from app.models.patient import PatientProfile

from app.core.database import get_db
from app.core.config import settings
from pydantic import BaseModel
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
)
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest
from app.services.email_service import send_password_reset_email


class SetPasswordRequest(BaseModel):
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: RefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token"
    )
    try:
        payload = decode_token(request.refresh_token)
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "refresh":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise credentials_exception

    access_token = create_access_token(subject=str(user.id))
    refresh_token = create_refresh_token(subject=str(user.id))

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
    )

    from app.core.dependencies import get_current_user
from app.models.patient import PatientProfile

@router.get("/me")
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == current_user.id)
    )
    patient = result.scalar_one_or_none()

    role_result = await db.execute(
        select(UserRole).where(UserRole.user_id == current_user.id)
    )
    roles = role_result.scalars().all()
    role = None
    if any(r.role == "admin" for r in roles):
        role = "admin"
    elif any(r.role == "practitioner" for r in roles):
        role = "practitioner"
    elif any(r.role == "patient" for r in roles):
        role = "patient"
    elif roles:
        role = roles[0].role

    return {
        "user_id": str(current_user.id),
        "email": current_user.email,
        "role": role,
        "patient_id": str(patient.id) if patient else None,
        "patient_name": patient.name if patient else None,
        "is_patient": patient is not None,
        "must_change_password": current_user.must_change_password,
    }


@router.put("/set-password")
async def set_password(
    request: SetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not request.password or len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters",
        )
    current_user.password_hash = hash_password(request.password)
    current_user.must_change_password = False
    await db.commit()
    return {"success": True}


@router.post("/forgot-password")
async def forgot_password(
    request: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    # Always return success — never reveal whether the email is registered.
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if user:
        token = secrets.token_hex(32)
        user.password_reset_token = token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()

        # Determine which reset path to use based on role.
        role_result = await db.execute(
            select(UserRole).where(UserRole.user_id == user.id)
        )
        roles = role_result.scalars().all()
        is_patient = any(r.role == "patient" for r in roles)

        if is_patient:
            reset_path = f"/teen/reset-password?token={token}"
        else:
            reset_path = f"/reset-password?token={token}"

        reset_link = f"{settings.BASE_URL}{reset_path}"
        await send_password_reset_email(user.email, reset_link)

    return {"success": True}


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    if not request.password or len(request.password) < 8:
        return {"error": "Password must be at least 8 characters"}

    result = await db.execute(
        select(User).where(User.password_reset_token == request.token)
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_reset_expires:
        return {"error": "Invalid or expired token"}

    expires = user.password_reset_expires
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return {"error": "Invalid or expired token"}

    user.password_hash = hash_password(request.password)
    user.password_reset_token = None
    user.password_reset_expires = None
    user.must_change_password = False
    await db.commit()
    return {"success": True}
