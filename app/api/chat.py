from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import optional_admin
from app.config import settings
from app.db import get_db
from app.export import build_workbook
from app.ingest.pipeline import document_path
from app.lang import answer_language, detect_language, t
from app.limiter import limiter
from app.models import INTERNAL, PUBLIC, AdminUser, ChatLog, Document, Grievance, Skill
from app.rag import chat_service
from app.schemas import ChatRequest, ChatResponse, ExportRequest, FeedbackRequest, GrievanceRequest

router = APIRouter(prefix="/api", tags=["chat"])

KANKER_BLOCKS = ["Kanker", "Charama", "Narharpur", "Bhanupratappur", "Durgukondal", "Koyalibeda", "Antagarh"]


def audience_for(user: AdminUser | None) -> str:
    return INTERNAL if user else PUBLIC


@router.post("/chat", response_model=ChatResponse)
@limiter.limit(settings.chat_rate_limit)
def chat(
    request: Request,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: AdminUser | None = Depends(optional_admin),
):
    return chat_service.answer(db, body.message, body.session_id, audience_for(user), body.lang)


@router.post("/feedback")
@limiter.limit("30/minute")
def feedback(request: Request, body: FeedbackRequest, db: Session = Depends(get_db)):
    entry = db.get(ChatLog, body.log_id)
    if entry is None or entry.session_id != body.session_id:
        raise HTTPException(404, "Conversation turn not found")
    entry.feedback = body.value
    entry.feedback_comment = body.comment.strip()
    if body.value < 0:
        entry.reviewed = False
    db.commit()
    return {"ok": True}


@router.post("/grievance")
@limiter.limit("5/minute")
def grievance(request: Request, body: GrievanceRequest, db: Session = Depends(get_db)):
    lang = answer_language(detect_language(body.description), body.lang)
    record = Grievance(
        ticket="pending",
        name=body.name.strip(),
        mobile=body.mobile,
        block=body.block.strip(),
        village=body.village.strip(),
        description=body.description.strip(),
        lang=lang,
    )
    db.add(record)
    db.flush()
    record.ticket = f"DMFT-KNK-{datetime.now(timezone.utc):%y%m%d}-{record.id:05d}"
    db.commit()
    return {"ticket": record.ticket, "message": t("grievance_created", lang, ticket=record.ticket)}


@router.get("/meta")
def meta(db: Session = Depends(get_db), user: AdminUser | None = Depends(optional_admin)):
    skills = db.scalars(select(Skill).where(Skill.enabled.is_(True)).order_by(Skill.id)).all()
    audience = audience_for(user)
    return {
        "blocks": KANKER_BLOCKS,
        "max_message_chars": settings.max_message_chars,
        "staff": user.username if user else None,
        "skills": [
            {"slug": s.slug, "name_en": s.name_en, "name_hi": s.name_hi}
            for s in skills
            if s.visibility == PUBLIC or audience == INTERNAL
        ],
    }


@router.get("/documents")
def list_documents(db: Session = Depends(get_db), user: AdminUser | None = Depends(optional_admin)):
    """Knowledge-base catalogue for the app: public documents, plus internal ones for signed-in staff."""
    rows = db.scalars(
        select(Document).join(Skill).where(Document.status == "indexed", Skill.enabled.is_(True))
        .order_by(Document.updated_at.desc())
    ).all()
    staff = user is not None
    return [
        {
            "id": d.id,
            "title": d.title,
            "description": d.description,
            "mime": d.mime,
            "pages": d.pages,
            "visibility": d.visibility,
            "updated_at": d.updated_at,
            "url": f"/api/documents/{d.id}/download",
            "source_url": d.source_url,
            "skill": {"slug": d.skill.slug, "name_en": d.skill.name_en, "name_hi": d.skill.name_hi},
        }
        for d in rows
        if staff or (d.visibility == PUBLIC and d.skill.visibility == PUBLIC)
    ]


@router.post("/export/xlsx")
@limiter.limit("20/minute")
def export_xlsx(request: Request, body: ExportRequest):
    """Turn the tables of an answer into a formatted Excel workbook."""
    return Response(
        build_workbook(body),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="DMFT_Report_{datetime.now():%Y%m%d_%H%M}.xlsx"'},
    )


@router.get("/documents/{document_id}/download")
def download(document_id: int, db: Session = Depends(get_db), user: AdminUser | None = Depends(optional_admin)):
    document = db.get(Document, document_id)
    if document is None or document.status != "indexed":
        raise HTTPException(404, "Document not found")
    skill = document.skill
    is_public = document.visibility == PUBLIC and skill.visibility == PUBLIC and skill.enabled
    if not is_public and user is None:
        raise HTTPException(403, "This document is restricted to DMFT staff")
    path = document_path(document)
    if not path.exists():
        raise HTTPException(404, "File missing on server")
    disposition = "inline" if document.mime in ("application/pdf", "text/plain") else "attachment"
    return FileResponse(
        path, media_type=document.mime, filename=document.filename, content_disposition_type=disposition
    )
