from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import (
    audit,
    authenticate,
    clear_cookie,
    create_session,
    current_admin,
    hash_password,
    issue_cookie,
    optional_admin,
    require_admin_role,
    revoke_session,
    revoke_user_sessions,
)
from app.config import settings
from app.db import get_db
from app.ingest.extract import SUPPORTED_EXTENSIONS
from app.ingest.fetch import refresh_source
from app.ingest.pipeline import (
    DuplicateDocument,
    UnsupportedFile,
    create_document,
    delete_document,
    delete_skill,
    index_document,
    index_document_background,
    reindex_all,
    update_document,
)
from app.limiter import limiter
from app.models import AdminUser, AuditLog, ChatLog, Chunk, Document, Grievance, QAPair, Skill, Source
from app.rag.knowledge import bump_kb_version, get_kb_version
from app.schemas import (
    DocumentOut,
    DocumentUpdate,
    GrievanceUpdate,
    LoginRequest,
    QAIn,
    QAOut,
    ReviewResolve,
    SkillIn,
    SkillOut,
    SkillUpdate,
    SourceIn,
    SourceOut,
    UserIn,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get(db: Session, model, obj_id: int):
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {obj_id} not found")
    return obj


# ------------------------------------------------------------------ session

@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = authenticate(db, body.username, body.password)
    if user is None:
        raise HTTPException(401, "Invalid username or password")
    # A fresh session on every sign-in; any session this browser already had is closed first.
    revoke_session(db, request)
    issue_cookie(response, create_session(db, user, request))
    audit(db, user, "login")
    return {"username": user.username, "role": user.role}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db),
           user: AdminUser | None = Depends(optional_admin)):
    revoke_session(db, request)
    clear_cookie(response)
    if user:
        audit(db, user, "logout")
    return {"ok": True}


@router.get("/me")
def me(user: AdminUser = Depends(current_admin)):
    return {"username": user.username, "role": user.role}


@router.get("/stats")
def stats(db: Session = Depends(get_db), _: AdminUser = Depends(current_admin)):
    since = datetime.now(timezone.utc) - timedelta(days=1)
    routes = dict(
        db.execute(select(ChatLog.route, func.count()).where(ChatLog.created_at >= since).group_by(ChatLog.route)).all()
    )
    return {
        "kb_version": get_kb_version(db),
        "skills": db.scalar(select(func.count(Skill.id))),
        "documents": db.scalar(select(func.count(Document.id))),
        "documents_failed": db.scalar(select(func.count(Document.id)).where(Document.status == "failed")),
        "chunks": db.scalar(select(func.count(Chunk.id))),
        "qa_pairs": db.scalar(select(func.count(QAPair.id))),
        "chats_24h": sum(routes.values()),
        "routes_24h": routes,
        "review_pending": db.scalar(select(func.count(ChatLog.id)).where(_review_filter())),
        "grievances_open": db.scalar(select(func.count(Grievance.id)).where(Grievance.status == "open")),
        "negative_feedback": db.scalar(select(func.count(ChatLog.id)).where(ChatLog.feedback < 0)),
    }


# ------------------------------------------------------------------ skills

def _skill_out(db: Session, skill: Skill) -> SkillOut:
    out = SkillOut.model_validate(skill)
    out.document_count = db.scalar(select(func.count(Document.id)).where(Document.skill_id == skill.id))
    out.qa_count = db.scalar(select(func.count(QAPair.id)).where(QAPair.skill_id == skill.id))
    out.source_count = db.scalar(select(func.count(Source.id)).where(Source.skill_id == skill.id))
    return out


@router.get("/skills", response_model=list[SkillOut])
def list_skills(db: Session = Depends(get_db), _: AdminUser = Depends(current_admin)):
    return [_skill_out(db, s) for s in db.scalars(select(Skill).order_by(Skill.id))]


@router.post("/skills", response_model=SkillOut)
def create_skill(body: SkillIn, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    if db.scalar(select(Skill).where(Skill.slug == body.slug)):
        raise HTTPException(409, f"Skill '{body.slug}' already exists")
    skill = Skill(**body.model_dump())
    db.add(skill)
    db.commit()
    bump_kb_version(db)
    audit(db, user, "skill.create", body.slug)
    return _skill_out(db, skill)


@router.put("/skills/{skill_id}", response_model=SkillOut)
def update_skill(skill_id: int, body: SkillUpdate, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    skill = _get(db, Skill, skill_id)
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(skill, key, value)
    db.commit()
    bump_kb_version(db)
    audit(db, user, "skill.update", skill.slug, ", ".join(changes))
    return _skill_out(db, skill)


@router.delete("/skills/{skill_id}")
def remove_skill(skill_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(require_admin_role)):
    skill = _get(db, Skill, skill_id)
    slug = skill.slug
    delete_skill(db, skill)
    audit(db, user, "skill.delete", slug)
    return {"ok": True}


@router.post("/skills/{skill_id}/reindex")
def reindex_skill(skill_id: int, tasks: BackgroundTasks, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    skill = _get(db, Skill, skill_id)
    for document in skill.documents:
        document.status = "processing"
        tasks.add_task(index_document_background, document.id)
    db.commit()
    audit(db, user, "skill.reindex", skill.slug)
    return {"queued": len(skill.documents)}


# ------------------------------------------------------------------ documents

@router.get("/documents", response_model=list[DocumentOut])
def list_documents(skill_id: int | None = None, db: Session = Depends(get_db), _: AdminUser = Depends(current_admin)):
    query = select(Document).order_by(Document.id.desc())
    if skill_id:
        query = query.where(Document.skill_id == skill_id)
    return db.scalars(query).all()


@router.post("/documents", response_model=DocumentOut)
async def upload_document(
    tasks: BackgroundTasks,
    file: UploadFile = File(...),
    skill_id: int = Form(...),
    title: str = Form(""),
    description: str = Form(""),
    visibility: str = Form("public"),
    db: Session = Depends(get_db),
    user: AdminUser = Depends(current_admin),
):
    if visibility not in ("public", "internal"):
        raise HTTPException(422, "visibility must be 'public' or 'internal'")
    skill = _get(db, Skill, skill_id)
    if Path(file.filename or "").suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(415, f"Allowed file types: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB")
    try:
        document = create_document(db, skill, data, file.filename, title, description, visibility)
    except DuplicateDocument as exc:
        raise HTTPException(409, str(exc)) from exc
    except UnsupportedFile as exc:
        raise HTTPException(415, str(exc)) from exc
    tasks.add_task(index_document_background, document.id)
    audit(db, user, "document.upload", f"{skill.slug}/{document.title}", file.filename or "")
    return document


@router.put("/documents/{document_id}", response_model=DocumentOut)
def edit_document(document_id: int, body: DocumentUpdate, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    document = _get(db, Document, document_id)
    if body.skill_id is not None:
        _get(db, Skill, body.skill_id)
    update_document(db, document, **body.model_dump(exclude_unset=True))
    audit(db, user, "document.update", document.title)
    return document


@router.delete("/documents/{document_id}")
def remove_document(document_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    document = _get(db, Document, document_id)
    title = document.title
    delete_document(db, document)
    audit(db, user, "document.delete", title)
    return {"ok": True}


@router.post("/documents/{document_id}/reindex", response_model=DocumentOut)
def reindex_document(document_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    _get(db, Document, document_id)
    document = index_document(db, document_id)
    audit(db, user, "document.reindex", document.title)
    return document


@router.post("/reindex-all")
def reindex_everything(db: Session = Depends(get_db), user: AdminUser = Depends(require_admin_role)):
    count = reindex_all(db)
    audit(db, user, "kb.reindex_all", detail=f"{count} documents")
    return {"reindexed": count}


# ------------------------------------------------------------------ URL sources

@router.get("/sources", response_model=list[SourceOut])
def list_sources(db: Session = Depends(get_db), _: AdminUser = Depends(current_admin)):
    return db.scalars(select(Source).order_by(Source.id)).all()


@router.post("/sources", response_model=SourceOut)
def add_source(body: SourceIn, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    _get(db, Skill, body.skill_id)
    source = Source(**body.model_dump())
    db.add(source)
    db.commit()
    refresh_source(db, source, force=True)
    audit(db, user, "source.add", body.url)
    return source


@router.post("/sources/{source_id}/refresh", response_model=SourceOut)
def refresh(source_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    source = _get(db, Source, source_id)
    refresh_source(db, source, force=True)
    audit(db, user, "source.refresh", source.url)
    return source


@router.delete("/sources/{source_id}")
def remove_source(source_id: int, keep_document: bool = False, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    source = _get(db, Source, source_id)
    url = source.url
    document = db.get(Document, source.document_id) if source.document_id else None
    db.delete(source)
    db.commit()
    if document and not keep_document:
        delete_document(db, document)
    audit(db, user, "source.delete", url)
    return {"ok": True}


# ------------------------------------------------------------------ curated Q&A

def _validate_qa(db: Session, body: QAIn | ReviewResolve) -> None:
    _get(db, Skill, body.skill_id)
    if not (body.question_en.strip() or body.question_hi.strip()):
        raise HTTPException(422, "Provide the question in English or Hindi")
    if not (body.answer_en.strip() or body.answer_hi.strip()):
        raise HTTPException(422, "Provide the answer in English or Hindi")
    if body.document_id is not None:
        _get(db, Document, body.document_id)


@router.get("/qa", response_model=list[QAOut])
def list_qa(skill_id: int | None = None, db: Session = Depends(get_db), _: AdminUser = Depends(current_admin)):
    query = select(QAPair).order_by(QAPair.id.desc())
    if skill_id:
        query = query.where(QAPair.skill_id == skill_id)
    return db.scalars(query).all()


@router.post("/qa", response_model=QAOut)
def create_qa(body: QAIn, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    _validate_qa(db, body)
    qa = QAPair(**body.model_dump(), created_by=user.username)
    db.add(qa)
    db.commit()
    bump_kb_version(db)
    audit(db, user, "qa.create", str(qa.id), body.question_en or body.question_hi)
    return qa


@router.put("/qa/{qa_id}", response_model=QAOut)
def update_qa(qa_id: int, body: QAIn, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    qa = _get(db, QAPair, qa_id)
    _validate_qa(db, body)
    for key, value in body.model_dump().items():
        setattr(qa, key, value)
    db.commit()
    bump_kb_version(db)
    audit(db, user, "qa.update", str(qa.id))
    return qa


@router.delete("/qa/{qa_id}")
def delete_qa(qa_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    qa = _get(db, QAPair, qa_id)
    db.delete(qa)
    db.commit()
    bump_kb_version(db)
    audit(db, user, "qa.delete", str(qa_id))
    return {"ok": True}


# ------------------------------------------------------------------ review queue (training loop)

def _review_filter():
    return (ChatLog.reviewed.is_(False)) & or_(
        ChatLog.route.in_(["refusal", "fallback"]),
        ChatLog.feedback < 0,
        (ChatLog.route == "rag") & (ChatLog.top_score < settings.min_relevance + 0.05),
    )


def _log_dict(entry: ChatLog) -> dict:
    return {
        "id": entry.id, "created_at": entry.created_at, "session_id": entry.session_id, "lang": entry.lang,
        "question": entry.question, "standalone_question": entry.standalone_question, "answer": entry.answer,
        "route": entry.route, "top_score": entry.top_score, "skills": entry.skills, "citations": entry.citations,
        "feedback": entry.feedback, "feedback_comment": entry.feedback_comment, "reviewed": entry.reviewed,
        "latency_ms": entry.latency_ms,
    }


@router.get("/review")
def review_queue(limit: int = 100, db: Session = Depends(get_db), _: AdminUser = Depends(current_admin)):
    rows = db.scalars(select(ChatLog).where(_review_filter()).order_by(ChatLog.id.desc()).limit(min(limit, 500)))
    return [_log_dict(r) for r in rows]


@router.post("/review/{log_id}/resolve", response_model=QAOut)
def resolve_review(log_id: int, body: ReviewResolve, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    entry = _get(db, ChatLog, log_id)
    _validate_qa(db, body)
    qa = QAPair(**body.model_dump(), created_by=user.username)
    db.add(qa)
    entry.reviewed = True
    db.commit()
    bump_kb_version(db)
    audit(db, user, "review.resolve", str(log_id), f"qa {qa.id}")
    return qa


@router.post("/review/{log_id}/dismiss")
def dismiss_review(log_id: int, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    entry = _get(db, ChatLog, log_id)
    entry.reviewed = True
    db.commit()
    audit(db, user, "review.dismiss", str(log_id))
    return {"ok": True}


@router.get("/logs")
def chat_logs(
    limit: int = 100, offset: int = 0, route: str | None = None,
    db: Session = Depends(get_db), _: AdminUser = Depends(current_admin),
):
    query = select(ChatLog).order_by(ChatLog.id.desc()).offset(offset).limit(min(limit, 500))
    if route:
        query = query.where(ChatLog.route == route)
    return [_log_dict(r) for r in db.scalars(query)]


# ------------------------------------------------------------------ grievances

@router.get("/grievances")
def list_grievances(status: str | None = None, db: Session = Depends(get_db), _: AdminUser = Depends(current_admin)):
    query = select(Grievance).order_by(Grievance.id.desc())
    if status:
        query = query.where(Grievance.status == status)
    return [
        {
            "id": g.id, "ticket": g.ticket, "name": g.name, "mobile": g.mobile, "block": g.block,
            "village": g.village, "description": g.description, "lang": g.lang, "status": g.status,
            "remarks": g.remarks, "created_at": g.created_at, "updated_at": g.updated_at,
        }
        for g in db.scalars(query)
    ]


@router.put("/grievances/{grievance_id}")
def update_grievance(grievance_id: int, body: GrievanceUpdate, db: Session = Depends(get_db), user: AdminUser = Depends(current_admin)):
    record = _get(db, Grievance, grievance_id)
    record.status = body.status
    record.remarks = body.remarks
    db.commit()
    audit(db, user, "grievance.update", record.ticket, body.status)
    return {"ok": True}


# ------------------------------------------------------------------ users & audit

@router.get("/users")
def list_users(db: Session = Depends(get_db), _: AdminUser = Depends(require_admin_role)):
    return [
        {"id": u.id, "username": u.username, "role": u.role, "active": u.active, "created_at": u.created_at}
        for u in db.scalars(select(AdminUser).order_by(AdminUser.id))
    ]


@router.post("/users")
def create_user(body: UserIn, db: Session = Depends(get_db), user: AdminUser = Depends(require_admin_role)):
    if db.scalar(select(AdminUser).where(AdminUser.username == body.username)):
        raise HTTPException(409, "Username already exists")
    db.add(AdminUser(username=body.username, password_hash=hash_password(body.password), role=body.role))
    db.commit()
    audit(db, user, "user.create", body.username, body.role)
    return {"ok": True}


@router.put("/users/{user_id}/active")
def set_user_active(user_id: int, active: bool, db: Session = Depends(get_db), user: AdminUser = Depends(require_admin_role)):
    target = _get(db, AdminUser, user_id)
    if target.id == user.id and not active:
        raise HTTPException(400, "You cannot deactivate your own account")
    target.active = active
    db.commit()
    if not active:
        revoke_user_sessions(db, target.id)
    audit(db, user, "user.active", target.username, str(active))
    return {"ok": True}


@router.get("/audit")
def audit_log(limit: int = 200, db: Session = Depends(get_db), _: AdminUser = Depends(require_admin_role)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 1000)))
    return [
        {"id": a.id, "username": a.username, "action": a.action, "target": a.target, "detail": a.detail,
         "created_at": a.created_at}
        for a in rows
    ]
