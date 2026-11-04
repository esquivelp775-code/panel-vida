"""Contraseñas (scrypt, stdlib) y tokens JWT HS256."""
import base64
import hashlib
import hmac
import secrets
import threading
import time
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


def create_token(user_id: int) -> tuple[str, datetime]:
    s = get_settings()
    expires = datetime.now(UTC) + timedelta(minutes=s.token_ttl_minutes)
    token = jwt.encode({"sub": str(user_id), "exp": expires, "iat": datetime.now(UTC)}, s.secret_key, "HS256")
    return token, expires


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "No autenticado o sesión expirada", headers={"WWW-Authenticate": "Bearer"}
    )
    if creds is None:
        raise unauthorized
    try:
        payload = jwt.decode(creds.credentials, get_settings().secret_key, algorithms=["HS256"],
                             options={"require": ["exp", "iat", "sub"]})
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized from None
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


# Hash ficticio para que un email inexistente cueste lo mismo que uno real (evita enumeración por tiempo).
DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


class LoginRateLimiter:
    """Límite en memoria de intentos fallidos por clave (email|IP). Suficiente para un usuario y un proceso.
    Usar email+IP evita que un tercero bloquee al dueño desde otra IP sólo conociendo su correo."""

    MAX_KEYS = 10_000

    def __init__(self) -> None:
        self._fails: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> list[float]:
        window = get_settings().login_window_seconds
        now = time.monotonic()
        return [t for t in self._fails.get(key, []) if now - t < window]

    def blocked(self, key: str) -> bool:
        with self._lock:
            recent = self._recent(key)
            self._fails[key] = recent
            return len(recent) >= get_settings().login_max_attempts

    def fail(self, key: str) -> None:
        with self._lock:
            if len(self._fails) >= self.MAX_KEYS:  # tope de memoria: descarta las claves más antiguas
                for k in list(self._fails)[: self.MAX_KEYS // 2]:
                    del self._fails[k]
            self._fails[key] = [*self._recent(key), time.monotonic()]

    def reset(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._fails.clear()
            else:
                self._fails.pop(key, None)


login_limiter = LoginRateLimiter()
