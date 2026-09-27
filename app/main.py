import logging
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session

from app import scheduler
from app.api import admin, chat
from app.auth import clear_cookie, issue_cookie, session_user
from app.config import BASE_DIR, settings
from app.db import SessionLocal, get_db, init_db
from app.limiter import limiter
from app.rag.generator import llm_status
from app.rag.knowledge import get_kb_version, knowledge
from app.rag.store import get_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("dmft")

STATIC_DIR = BASE_DIR / "static"


def _warm_up() -> None:
    """Load the embedding model and indexes in the background so the first chat is fast."""
    try:
        with SessionLocal() as db:
            knowledge.snapshot(db)
        from app.rag.embedder import embed_one

        embed_one("warm up")
        log.info("Warm-up complete")
    except Exception:
        log.exception("Warm-up failed")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if settings.admin_jwt_secret.startswith("change-this"):
        log.warning("ADMIN_JWT_SECRET is not set - using an insecure default. Set it in .env for production.")
    if not settings.gemini_api_key:
        log.warning("GEMINI_API_KEY is not set - answers will fall back to document excerpts.")
    threading.Thread(target=_warm_up, daemon=True).start()
    scheduler.start()
    yield
    scheduler.stop()


app = FastAPI(title="DMFT Sahayak - Uttar Bastar Kanker", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )


@app.exception_handler(RateLimitExceeded)
def rate_limited(_request: Request, _exc: RateLimitExceeded):
    return JSONResponse(
        {"detail": "Too many requests. Please wait a minute. / बहुत अधिक अनुरोध। कृपया एक मिनट प्रतीक्षा करें।"},
        status_code=429,
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    if request.url.path.startswith(("/admin", "/api/admin")):
        # Staff pages and data must not be served from the browser cache (e.g. Back after sign-out).
        response.headers["Cache-Control"] = "no-store"
    # Session bookkeeping set by app.auth.session_user: slide an active session, drop a dead one.
    if getattr(request.state, "renew_cookie", None):
        issue_cookie(response, request.state.renew_cookie)
    elif getattr(request.state, "clear_cookie", False):
        clear_cookie(response)
    return response


app.include_router(chat.router)
app.include_router(admin.router)


@app.get("/")
def home():
    return FileResponse(STATIC_DIR / "index.html")


def _safe_next(target: str | None) -> str:
    # Only redirect back into the admin area (no open redirects).
    if target and target.startswith("/admin") and not target.startswith("/admin/login"):
        return target
    return "/admin"


@app.get("/admin")
def admin_page(request: Request, db: Session = Depends(get_db)):
    if session_user(request, db) is None:
        return RedirectResponse("/admin/login", status_code=303)
    return FileResponse(STATIC_DIR / "admin.html")


@app.get("/admin/login")
def admin_login_page(request: Request, next: str | None = None, db: Session = Depends(get_db)):
    if session_user(request, db) is not None:
        return RedirectResponse(_safe_next(next), status_code=303)
    return FileResponse(STATIC_DIR / "admin-login.html")


@app.get("/sw.js")
def service_worker():
    # Served from the root so it can control the whole app.
    return FileResponse(STATIC_DIR / "sw.js", media_type="application/javascript", headers={"Cache-Control": "no-cache"})


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/healthz")
def healthz():
    with SessionLocal() as db:
        version = get_kb_version(db)
    return {"status": "ok", "kb_version": version, "chunks": get_store().count(), "llm": llm_status()}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
