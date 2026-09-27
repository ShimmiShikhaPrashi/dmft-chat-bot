"""Document lifecycle: store file -> extract -> chunk -> embed -> index (Chroma + SQLite)."""

import hashlib
import logging
import uuid
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.ingest.chunker import chunk_pages
from app.ingest.extract import SUPPORTED_EXTENSIONS, extract, mime_for
from app.models import PUBLIC, Chunk, Document, Skill
from app.rag.embedder import embed
from app.rag.knowledge import bump_kb_version
from app.rag.store import get_store

log = logging.getLogger(__name__)


class DuplicateDocument(Exception):
    def __init__(self, document: Document):
        super().__init__(f"This file is already uploaded as '{document.title}' (id {document.id}).")
        self.document = document


class UnsupportedFile(Exception):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_document(
    db: Session,
    skill: Skill,
    data: bytes,
    filename: str,
    title: str = "",
    description: str = "",
    visibility: str = PUBLIC,
    source_url: str | None = None,
) -> Document:
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFile(f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
    digest = sha256_bytes(data)
    existing = db.scalar(select(Document).where(Document.sha256 == digest, Document.skill_id == skill.id))
    if existing:
        raise DuplicateDocument(existing)

    settings.files_dir.mkdir(parents=True, exist_ok=True)
    stored = settings.files_dir / f"{uuid.uuid4().hex}{ext}"
    stored.write_bytes(data)
    document = Document(
        skill_id=skill.id,
        title=title.strip() or Path(filename).stem.replace("_", " "),
        description=description.strip(),
        filename=Path(filename).name,
        stored_path=stored.name,
        mime=mime_for(filename),
        sha256=digest,
        visibility=visibility,
        source_url=source_url,
        status="processing",
    )
    db.add(document)
    db.commit()
    return document


def document_path(document: Document) -> Path:
    return settings.files_dir / document.stored_path


def index_document(db: Session, document_id: int) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise ValueError(f"Document {document_id} not found")
    store = get_store()
    try:
        extraction = extract(document_path(document))
        chunks = chunk_pages(extraction.pages)
        if not chunks:
            raise ValueError("Document contains no usable text")
        vectors = embed([f"{document.title}\n{c.text}" for c in chunks])

        store.delete_document(document.id)
        db.execute(delete(Chunk).where(Chunk.document_id == document.id))
        ids = [f"{document.id}-{c.ordinal}" for c in chunks]
        store.upsert(
            ids=ids,
            embeddings=vectors,
            metadatas=[
                {
                    "document_id": document.id,
                    "skill_id": document.skill_id,
                    "page": c.page if c.page is not None else -1,
                    "visibility": document.visibility,
                    "lang": c.lang,
                }
                for c in chunks
            ],
            documents=[c.text for c in chunks],
        )
        db.add_all(
            Chunk(
                id=cid, document_id=document.id, skill_id=document.skill_id, ordinal=c.ordinal,
                page=c.page, text=c.text, lang=c.lang, visibility=document.visibility,
            )
            for cid, c in zip(ids, chunks)
        )
        document.pages = extraction.page_count
        document.ocr_pages = extraction.ocr_pages
        document.chunk_count = len(chunks)
        document.status = "indexed"
        document.error = None
        log.info("Indexed '%s': %d pages (%d OCR), %d chunks", document.title, extraction.page_count,
                 extraction.ocr_pages, len(chunks))
    except Exception as exc:
        db.rollback()
        document = db.get(Document, document_id)
        document.status = "failed"
        document.error = str(exc)[:2000]
        log.exception("Indexing failed for document %s", document_id)
    db.commit()
    bump_kb_version(db)
    return document


def index_document_background(document_id: int) -> None:
    with SessionLocal() as db:
        index_document(db, document_id)


def delete_document(db: Session, document: Document) -> None:
    get_store().delete_document(document.id)
    path = document_path(document)
    db.delete(document)
    db.commit()
    path.unlink(missing_ok=True)
    bump_kb_version(db)


def update_document(
    db: Session,
    document: Document,
    title: str | None = None,
    description: str | None = None,
    visibility: str | None = None,
    skill_id: int | None = None,
) -> Document:
    changes = {}
    if title is not None:
        document.title = title.strip() or document.title
    if description is not None:
        document.description = description.strip()
    if visibility is not None and visibility != document.visibility:
        document.visibility = visibility
        changes["visibility"] = visibility
    if skill_id is not None and skill_id != document.skill_id:
        document.skill_id = skill_id
        changes["skill_id"] = skill_id
    if changes:
        for chunk in document.chunks:
            for key, value in changes.items():
                setattr(chunk, key, value)
        get_store().update_document_metadata(document.id, changes)
    db.commit()
    bump_kb_version(db)
    return document


def delete_skill(db: Session, skill: Skill) -> None:
    store = get_store()
    paths = []
    for document in list(skill.documents):
        store.delete_document(document.id)
        paths.append(document_path(document))
    db.delete(skill)
    db.commit()
    for path in paths:
        path.unlink(missing_ok=True)
    bump_kb_version(db)


def reindex_all(db: Session) -> int:
    ids = db.scalars(select(Document.id)).all()
    for document_id in ids:
        index_document(db, document_id)
    return len(ids)
