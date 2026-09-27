"""Export the public knowledge base as a static snapshot for the GitHub Pages demo.

Only content a citizen could already see is exported: enabled skills with public visibility,
their indexed public documents and passages, and their curated Q&A. Internal skills and
documents are never written. Vectors are added afterwards by demo/build-vectors.mjs, using the
same in-browser model that answers questions on the demo site.
"""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import lang
from app.api.chat import KANKER_BLOCKS
from app.config import BASE_DIR, settings
from app.ingest.pipeline import document_path
from app.models import PUBLIC, Chunk, Document, QAPair, Skill
from app.rag.knowledge import get_kb_version

DEMO_DIR = BASE_DIR / "demo"
KB_DIR = DEMO_DIR / "kb"
BUILD_DIR = DEMO_DIR / ".build"
# Web-page snapshots open their live source URL in the app, so their HTML copy is not published.
NOT_PUBLISHED_MIMES = {"text/html"}
EXTENSIONS = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/csv": ".csv",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}


def _lang_rules() -> dict:
    """Language data shared with the browser engine, so both sides tokenise and detect alike."""
    return {
        "en_stopwords": sorted(lang.EN_STOPWORDS),
        "hi_stopwords": sorted(lang.HI_STOPWORDS),
        "roman_hi_stopwords": sorted(lang.ROMAN_HI_STOPWORDS),
        "hinglish_words": sorted(lang.HINGLISH_WORDS),
        "greeting_re": lang.GREETING_RE.pattern,
        "document_request_re": lang.DOCUMENT_REQUEST_RE.pattern,
        "messages": lang.MESSAGES,
        "suggestions": lang.SUGGESTIONS,
    }


def export_content(db: Session) -> dict:
    """Write demo/.build/content.json (text only) and copy public files to demo/kb/files/."""
    skills = db.scalars(
        select(Skill).where(Skill.enabled.is_(True), Skill.visibility == PUBLIC).order_by(Skill.id)
    ).all()
    skill_ids = {s.id for s in skills}
    docs = [
        d for d in db.scalars(
            select(Document).where(Document.status == "indexed", Document.visibility == PUBLIC).order_by(Document.id)
        )
        if d.skill_id in skill_ids
    ]
    doc_ids = {d.id for d in docs}

    files_dir = KB_DIR / "files"
    if files_dir.exists():
        shutil.rmtree(files_dir)
    files_dir.mkdir(parents=True)

    doc_rows = []
    for d in docs:
        file_name = None
        source = document_path(d)
        if d.mime not in NOT_PUBLISHED_MIMES and source.exists():
            file_name = f"{d.id}{EXTENSIONS.get(d.mime, Path(d.filename).suffix.lower() or '.bin')}"
            shutil.copyfile(source, files_dir / file_name)
        doc_rows.append({
            "id": d.id, "skill_id": d.skill_id, "title": d.title, "description": d.description or "",
            "mime": d.mime, "pages": d.pages, "source_url": d.source_url, "file": file_name,
            "updated_at": (d.updated_at or d.created_at).isoformat(),
        })

    chunks = db.execute(
        select(Chunk.id, Chunk.document_id, Chunk.skill_id, Chunk.ordinal, Chunk.page, Chunk.text)
        .where(Chunk.visibility == PUBLIC).order_by(Chunk.document_id, Chunk.ordinal)
    ).all()
    chunk_rows = [
        {"id": c.id, "d": c.document_id, "s": c.skill_id, "o": c.ordinal, "p": c.page, "t": c.text}
        for c in chunks if c.document_id in doc_ids
    ]

    qa_rows = [
        {
            "id": q.id, "skill_id": q.skill_id, "question_en": q.question_en or "", "question_hi": q.question_hi or "",
            "answer_en": q.answer_en or "", "answer_hi": q.answer_hi or "",
            "document_id": q.document_id if q.document_id in doc_ids else None,
        }
        for q in db.scalars(select(QAPair).where(QAPair.enabled.is_(True)).order_by(QAPair.id))
        if q.skill_id in skill_ids
    ]

    content = {
        "kb_version": get_kb_version(db),
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "gemini_model": settings.gemini_model,
        "max_message_chars": settings.max_message_chars,
        "blocks": KANKER_BLOCKS,
        "lang": _lang_rules(),
        "skills": [
            {
                "id": s.id, "slug": s.slug, "name_en": s.name_en, "name_hi": s.name_hi or "",
                "description": s.description or "", "keywords": list(s.keywords or []),
                "instructions": s.instructions or "", "action": s.action,
            }
            for s in skills
        ],
        "docs": doc_rows,
        "chunks": chunk_rows,
        "qa": qa_rows,
    }
    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    (BUILD_DIR / "content.json").write_text(json.dumps(content, ensure_ascii=False), encoding="utf-8")

    eval_cases = yaml.safe_load((BASE_DIR / "seed" / "eval.yaml").read_text(encoding="utf-8"))
    (BUILD_DIR / "eval.json").write_text(json.dumps(eval_cases, ensure_ascii=False), encoding="utf-8")
    return content
