"""Background job: re-fetch URL sources periodically and re-index those that changed."""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.ingest.fetch import refresh_source
from app.models import Source

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def refresh_due_sources() -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.source_refresh_days)
    refreshed = 0
    with SessionLocal() as db:
        for source in db.scalars(select(Source).where(Source.refresh.is_(True))):
            last = source.last_fetched
            if last is not None and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if last is None or last < cutoff:
                refresh_source(db, source)
                refreshed += 1
    if refreshed:
        log.info("Refreshed %d URL sources", refreshed)
    return refreshed


def start() -> None:
    global _scheduler
    if _scheduler or not settings.enable_scheduler:
        return
    _scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    _scheduler.add_job(refresh_due_sources, "cron", hour=2, minute=30, id="refresh_sources", coalesce=True)
    _scheduler.start()
    log.info("Scheduler started (URL sources refresh every %d days, checked nightly)", settings.source_refresh_days)


def stop() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
