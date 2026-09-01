import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from app.core.dependencies import get_current_user
from app.models.patient import PatientProfile, ParentPatientLink

from app.core.database import get_db
from app.core.config import settings
from pydantic import BaseModel
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    token_predates_password_change,
)
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest
from app.services.email_service import send_password_reset_email


class SetPasswordRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


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
    # A refresh token lasts a week. Without this, changing a password left a stolen one working
    # for the rest of that week.
    if token_predates_password_change(payload, user.password_changed_at):
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
    elif any(r.role == "parent" for r in roles):
        role = "parent"
    elif roles:
        role = roles[0].role

    # Parents link to their child(ren) via parent_patient_links, not user_id.
    # MVP is single-child, but the model returns all links.
    children: list[dict] = []
    if role == "parent":
        link_result = await db.execute(
            select(ParentPatientLink, PatientProfile)
            .join(PatientProfile, ParentPatientLink.patient_id == PatientProfile.id)
            .where(ParentPatientLink.parent_user_id == current_user.id)
        )
        for _link, child in link_result.all():
            children.append({
                "patient_id": str(child.id),
                "patient_name": child.name,
                "closed_at": child.closed_at,
            })

    # Convenience: first child surfaces as patient_id/patient_name for the
    # single-child MVP, mirroring how the teen client reads its own profile.
    primary_child = children[0] if children else None

    return {
        "user_id": str(current_user.id),
        "email": current_user.email,
        "role": role,
        "patient_id": (str(patient.id) if patient else
                       primary_child["patient_id"] if primary_child else None),
        "patient_name": (patient.name if patient else
                         primary_child["patient_name"] if primary_child else None),
        "is_patient": patient is not None,
        "is_parent": role == "parent",
        "children": children,
        "must_change_password": current_user.must_change_password,
        # Treatment has been closed by a clinician. The child and parent apps still let them sign
        # in and read; this is what tells them to show "All done for now" rather than tasks.
        "treatment_closed": bool(
            (patient and patient.closed_at is not None)
            or (primary_child and primary_child.get("closed_at") is not None)
        ),
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
    # Same rule as change-password below: a password that changes ends every session older than
    # it. Here that is the temporary password Float emailed out — if someone else used it first,
    # setting a real password has to be what stops them.
    changed_at = datetime.now(timezone.utc)
    current_user.password_hash = hash_password(request.password)
    current_user.must_change_password = False
    current_user.password_changed_at = changed_at
    await db.commit()

    # And the caller keeps a working session, stamped past the change. The teen and parent apps
    # store these; if one did not, the person is simply asked to sign in with the password they
    # have just chosen.
    fresh = changed_at + timedelta(seconds=1)
    return TokenResponse(
        access_token=create_access_token(subject=str(current_user.id), issued_at=fresh),
        refresh_token=create_refresh_token(subject=str(current_user.id), issued_at=fresh),
    )


@router.put("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change my password while signed in, which needs the one I have now.

    Separate from `set-password` above, which deliberately does not ask: that one runs when someone
    signs in with a temporary password and is made to replace it. This one runs from the settings
    page, where a live session is the only thing an attacker would need otherwise — a borrowed
    unlocked laptop could lock the real clinician out of their own account.
    """
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That is not your current password.",
        )
    if len(request.new_password or "") < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your new password must be at least 8 characters.",
        )
    if request.new_password == request.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your new password has to be different from your current one.",
        )

    current_user.password_hash = hash_password(request.new_password)
    current_user.must_change_password = False
    changed_at = datetime.now(timezone.utc)
    current_user.password_changed_at = changed_at
    await db.commit()

    # Every token from that second or earlier is now refused, including the one this request
    # arrived with. Hand this browser a new pair, stamped a second later so they are on the right
    # side of that line: the person who just changed their own password stays signed in, while
    # anyone else holding their session does not.
    fresh = changed_at + timedelta(seconds=1)
    return TokenResponse(
        access_token=create_access_token(subject=str(current_user.id), issued_at=fresh),
        refresh_token=create_refresh_token(subject=str(current_user.id), issued_at=fresh),
    )


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

        if any(r.role == "patient" for r in roles):
            reset_path = f"/teen/reset-password?token={token}"
        elif any(r.role == "parent" for r in roles):
            reset_path = f"/parent/reset-password?token={token}"
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
    # Resetting by email is the "I have lost control of my account" path, so it has the most
    # reason of all to end sessions elsewhere.
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True}
# Wed Apr 15 21:18:07 EDT 2026
