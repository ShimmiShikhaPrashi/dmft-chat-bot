"""Semantic answer cache. Entries are tied to a KB version, so any ingest/edit invalidates them."""

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AnswerCache

MAX_ENTRIES = 5000


def lookup(db: Session, kb_version: int, audience: str, lang: str, query_vec: np.ndarray) -> dict | None:
    rows = db.scalars(
        select(AnswerCache).where(
            AnswerCache.kb_version == kb_version, AnswerCache.audience == audience, AnswerCache.lang == lang
        )
    ).all()
    if not rows:
        return None
    matrix = np.asarray([row.embedding for row in rows], dtype=np.float32)
    scores = matrix @ query_vec
    best = int(np.argmax(scores))
    if scores[best] < settings.cache_threshold:
        return None
    row = rows[best]
    row.hits += 1
    db.commit()
    return dict(row.response)


def store(db: Session, kb_version: int, audience: str, lang: str, query: str, query_vec: np.ndarray, response: dict):
    db.add(
        AnswerCache(
            kb_version=kb_version, audience=audience, lang=lang, query=query,
            embedding=[round(float(x), 6) for x in query_vec], response=response,
        )
    )
    db.commit()
    count = db.query(AnswerCache).count()
    if count > MAX_ENTRIES:
        oldest = db.scalars(select(AnswerCache.id).order_by(AnswerCache.id).limit(count - MAX_ENTRIES)).all()
        db.execute(delete(AnswerCache).where(AnswerCache.id.in_(oldest)))
        db.commit()
