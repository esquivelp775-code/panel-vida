from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .config import get_settings
from .ledger import LedgerError
from .routers import accounts, auth, imports, life, planning, reports, transactions

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


for mod in (auth, accounts, transactions, planning, reports, imports, life):
    api.include_router(mod.router)
app.include_router(api)
