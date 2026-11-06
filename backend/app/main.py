from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .config import get_settings
from .ledger import LedgerError
from .routers import accounts, auth, imports, life, planning, reports, ryventis, setup, transactions

settings = get_settings()
app = FastAPI(
    title="Panel de Vida API",
    version="0.1.0",
    docs_url=None if settings.env == "production" else "/docs",
    redoc_url=None,
    openapi_url=None if settings.env == "production" else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)


@app.exception_handler(LedgerError)
def ledger_error(_: Request, exc: LedgerError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.exception_handler(IntegrityError)
def integrity_error(_: Request, exc: IntegrityError):
    # Nunca exponemos SQL; la BD rechazó una operación que violaba una regla de integridad.
    return JSONResponse(status_code=409, content={"detail": "La operación viola una regla de integridad de datos"})


_FIXED = {
    "missing": "es obligatorio", "extra_forbidden": "campo no permitido", "string_type": "debe ser texto",
    "string_pattern_mismatch": "formato inválido", "int_type": "debe ser un número entero",
    "int_parsing": "debe ser un número entero", "int_from_float": "debe ser un número entero (sin decimales)",
    "bool_type": "debe ser verdadero o falso", "bool_parsing": "debe ser verdadero o falso",
    "date_type": "fecha inválida (usa AAAA-MM-DD)", "date_parsing": "fecha inválida (usa AAAA-MM-DD)",
    "date_from_datetime_parsing": "fecha inválida (usa AAAA-MM-DD)", "list_type": "debe ser una lista",
    "dict_type": "debe ser un objeto", "model_type": "debe ser un objeto", "json_invalid": "JSON inválido",
    "union_tag_invalid": "tipo de operación no válido", "union_tag_not_found": "falta el tipo de operación (kind)",
}


def _es(e: dict) -> str:
    """Traduce un error de validación de Pydantic a un mensaje en español (CLAUDE.md, regla 6)."""
    t, ctx = e.get("type", ""), e.get("ctx") or {}
    if t in _FIXED:
        return _FIXED[t]
    if t == "greater_than":
        return f"debe ser mayor que {ctx.get('gt')}"
    if t == "greater_than_equal":
        return f"debe ser mayor o igual que {ctx.get('ge')}"
    if t == "less_than":
        return f"debe ser menor que {ctx.get('lt')}"
    if t == "less_than_equal":
        return f"debe ser menor o igual que {ctx.get('le')}"
    if t == "literal_error":
        return f"valor no permitido (opciones: {str(ctx.get('expected', '')).replace(' or ', ' o ')})"
    if t == "string_too_short":
        return "no puede estar vacío" if ctx.get("min_length") == 1 else f"mínimo {ctx.get('min_length')} caracteres"
    if t == "string_too_long":
        return f"máximo {ctx.get('max_length')} caracteres"
    if t == "too_long":
        return f"máximo {ctx.get('max_length')} elementos"
    if t == "too_short":
        return f"mínimo {ctx.get('min_length')} elementos"
    if t == "value_error":  # validadores propios: ya traen el texto en español
        return str(e.get("msg", "")).removeprefix("Value error, ")
    return "valor inválido"


@app.exception_handler(RequestValidationError)
def validation_error(_: Request, exc: RequestValidationError):
    parts = []
    for e in exc.errors():
        loc = [str(x) for x in e.get("loc", ()) if x not in ("body", "query", "path", "header")]
        # Las variantes de una unión (p. ej. el tipo de operación) no le dicen nada al usuario.
        loc = [x for x in loc if not x.startswith(("function-", "tagged-union"))]
        parts.append(f"{'.'.join(loc) or 'solicitud'}: {_es(e)}")
    return JSONResponse(status_code=422, content={"detail": "; ".join(dict.fromkeys(parts))})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


api = APIRouter(prefix="/api/v1")


@api.get("/health", tags=["meta"])
def health():
    return {"status": "ok"}


for mod in (auth, accounts, transactions, planning, reports, imports, life, setup, ryventis):
    api.include_router(mod.router)
app.include_router(api)
