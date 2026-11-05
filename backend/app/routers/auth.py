from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ledger
from .. import schemas as s
from ..db import get_db
from ..models import User
from ..security import DUMMY_HASH, create_token, get_current_user, hash_password, login_limiter, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD = 10
# Tope por correo, sin importar la IP: tras un proxy la IP del cliente se puede falsificar con X-Forwarded-For.
# Es más alto que el tope por IP para que el dueño no quede fuera por un puñado de intentos ajenos.
EMAIL_LIMIT_FACTOR = 4


def _too_many() -> HTTPException:
    return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Espera unos minutos.")


def _user_out(user: User) -> s.UserOut:
    return s.UserOut(id=user.id, email=user.email, display_name=user.display_name, currency=user.currency)


def _rotate_sessions(db: Session, user: User, action: str) -> s.TokenOut:
    """Invalida todos los tokens del usuario y devuelve uno nuevo para el dispositivo actual."""
    user.token_version += 1
    ledger.audit(db, user, "user", user.id, action)
    db.commit()
    token, expires = create_token(user.id, user.token_version)
    return s.TokenOut(access_token=token, expires_at=expires)


@router.post("/login", response_model=s.TokenOut)
def login(body: s.LoginIn, request: Request, db: Session = Depends(get_db)):
    key = f"{body.email}|{request.client.host if request.client else '-'}"
    email_key = f"email:{body.email}"
    if login_limiter.blocked(key) or login_limiter.blocked(email_key, EMAIL_LIMIT_FACTOR):
        raise _too_many()
    user = db.scalar(select(User).where(User.email == body.email))
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if user is None or not ok:
        login_limiter.fail(key)
        login_limiter.fail(email_key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos")
    login_limiter.reset(key)
    login_limiter.reset(email_key)
    token, expires = create_token(user.id, user.token_version)
    return s.TokenOut(access_token=token, expires_at=expires)


@router.get("/me", response_model=s.UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.patch("/me", response_model=s.UserOut)
def update_me(body: s.ProfileUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.display_name = body.display_name or None
    ledger.audit(db, user, "user", user.id, "update_profile", {"display_name": user.display_name})
    db.commit()
    return _user_out(user)


@router.post("/change-password", response_model=s.TokenOut)
def change_password(body: s.PasswordChange, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    key = f"password:{user.id}"
    if login_limiter.blocked(key):
        raise _too_many()
    # 422 y no 401: el cliente trata un 401 como sesión vencida y cerraría la sesión por un error de captura.
    if not verify_password(body.current_password, user.password_hash):
        login_limiter.fail(key)
        raise ledger.LedgerError("La contraseña actual no es correcta")
    login_limiter.reset(key)
    if len(body.new_password) < MIN_PASSWORD:
        raise ledger.LedgerError(f"La contraseña nueva debe tener al menos {MIN_PASSWORD} caracteres")
    if body.new_password == body.current_password:
        raise ledger.LedgerError("La contraseña nueva debe ser distinta de la actual")
    user.password_hash = hash_password(body.new_password)
    return _rotate_sessions(db, user, "change_password")


@router.post("/logout-all", response_model=s.TokenOut)
def logout_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _rotate_sessions(db, user, "logout_all")
