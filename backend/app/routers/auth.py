from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..models import User
from ..security import DUMMY_HASH, create_token, get_current_user, login_limiter, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=s.TokenOut)
def login(body: s.LoginIn, request: Request, db: Session = Depends(get_db)):
    key = f"{body.email}|{request.client.host if request.client else '-'}"
    if login_limiter.blocked(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Espera unos minutos.")
    user = db.scalar(select(User).where(User.email == body.email))
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not ok:
        login_limiter.fail(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos")
    login_limiter.reset(key)
    token, expires = create_token(user.id)
    return s.TokenOut(access_token=token, expires_at=expires)


@router.get("/me", response_model=s.UserOut)
def me(user: User = Depends(get_current_user)):
    return s.UserOut(id=user.id, email=user.email, display_name=user.display_name, currency=user.currency)
