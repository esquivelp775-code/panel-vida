from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas as s
from ..db import get_db
from ..models import User
from ..security import create_token, get_current_user, login_limiter, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=s.TokenOut)
def login(body: s.LoginIn, db: Session = Depends(get_db)):
    if login_limiter.blocked(body.email):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Espera unos minutos.")
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        login_limiter.fail(body.email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos")
    login_limiter.reset(body.email)
    token, expires = create_token(user.id)
    return s.TokenOut(access_token=token, expires_at=expires)


@router.get("/me", response_model=s.UserOut)
def me(user: User = Depends(get_current_user)):
    return s.UserOut(id=user.id, email=user.email, display_name=user.display_name, currency=user.currency)
