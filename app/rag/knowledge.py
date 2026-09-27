"""In-memory indexes derived from the database, rebuilt whenever the KB version changes.

- BM25 over all chunks (Devanagari-aware tokens) for exact-term recall
- skill profile vectors for routing
- curated Q&A question vectors
- document title/description vectors for document requests
"""

import hashlib
import logging
import threading
from dataclasses import dataclass, field

import numpy as np
from rank_bm25 import BM25Okapi
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.lang import keyword_hit, tokenize
from app.models import INTERNAL, PUBLIC, AnswerCache, Chunk, Document, Meta, QAPair, Skill
from app.rag.embedder import embed

log = logging.getLogger(__name__)

KB_VERSION_KEY = "kb_version"


def get_kb_version(db: Session) -> int:
    row = db.get(Meta, KB_VERSION_KEY)
    return int(row.value) if row else 0


def bump_kb_version(db: Session) -> int:
    """Mark the knowledge base as changed: invalidates the answer cache and in-memory indexes."""
    row = db.get(Meta, KB_VERSION_KEY)
    version = (int(row.value) if row else 0) + 1
    if row:
        row.value = str(version)
    else:
        db.add(Meta(key=KB_VERSION_KEY, value=str(version)))
    db.execute(delete(AnswerCache))
    db.commit()
    return version


def visibilities_for(audience: str) -> list[str]:
    return [PUBLIC, INTERNAL] if audience == INTERNAL else [PUBLIC]


@dataclass
class SkillInfo:
    id: int
    slug: str
    name_en: str
    name_hi: str
    instructions: str
    keywords: list[str]
    action: str | None
    visibility: str


@dataclass
class QAInfo:
    id: int
    skill_id: int
    question_en: str
    question_hi: str
    answer_en: str
    answer_hi: str
    document_id: int | None


@dataclass
class DocInfo:
    id: int
    skill_id: int
    title: str
    description: str
    mime: str
    visibility: str
    source_url: str | None
    pages: int


@dataclass
class ChunkInfo:
    id: str
    document_id: int
    skill_id: int
    page: int | None
    text: str
    visibility: str


@dataclass
class Snapshot:
    version: int = -1
    skills: dict[int, SkillInfo] = field(default_factory=dict)
    skill_ids: list[int] = field(default_factory=list)
    skill_vectors: np.ndarray | None = None
    qa: list[QAInfo] = field(default_factory=list)
    qa_owner: list[int] = field(default_factory=list)  # row -> index into qa
    qa_vectors: np.ndarray | None = None
    docs: dict[int, DocInfo] = field(default_factory=dict)
    doc_ids: list[int] = field(default_factory=list)
    doc_vectors: np.ndarray | None = None
    chunks: list[ChunkInfo] = field(default_factory=list)
    chunk_map: dict[str, ChunkInfo] = field(default_factory=dict)
    bm25: BM25Okapi | None = None


class KnowledgeIndex:
    def __init__(self):
        self._snapshot = Snapshot()
        self._lock = threading.Lock()
        self._vector_cache: dict[str, np.ndarray] = {}

    # ------------------------------------------------------------ build

    def snapshot(self, db: Session) -> Snapshot:
        version = get_kb_version(db)
        if self._snapshot.version != version:
            with self._lock:
                if self._snapshot.version != version:
                    self._snapshot = self._build(db, version)
        return self._snapshot

    def _vectors(self, texts: list[str]) -> np.ndarray | None:
        if not texts:
            return None
        keys = [hashlib.sha1(t.encode("utf-8")).hexdigest() for t in texts]
        missing = [(k, t) for k, t in zip(keys, texts) if k not in self._vector_cache]
        if missing:
            vectors = embed([t for _, t in missing])
            for (k, _), vec in zip(missing, vectors):
                self._vector_cache[k] = vec
        return np.vstack([self._vector_cache[k] for k in keys])

    def _build(self, db: Session, version: int) -> Snapshot:
        snap = Snapshot(version=version)

        profiles = []
        for skill in db.scalars(select(Skill).where(Skill.enabled.is_(True))):
            snap.skills[skill.id] = SkillInfo(
                skill.id, skill.slug, skill.name_en, skill.name_hi, skill.instructions or "",
                list(skill.keywords or []), skill.action, skill.visibility,
            )
            profiles.append(f"{skill.name_en}. {skill.name_hi}. {skill.description}. {' '.join(skill.keywords or [])}")
        snap.skill_ids = list(snap.skills)
        snap.skill_vectors = self._vectors(profiles)

        questions = []
        for qa in db.scalars(select(QAPair).where(QAPair.enabled.is_(True))):
            if qa.skill_id not in snap.skills:
                continue
            info = QAInfo(qa.id, qa.skill_id, qa.question_en, qa.question_hi, qa.answer_en, qa.answer_hi, qa.document_id)
            snap.qa.append(info)
            for question in (qa.question_en, qa.question_hi):
                if question and question.strip():
                    questions.append(question)
                    snap.qa_owner.append(len(snap.qa) - 1)
        snap.qa_vectors = self._vectors(questions)

        doc_texts = []
        for doc in db.scalars(select(Document).where(Document.status == "indexed")):
            if doc.skill_id not in snap.skills:
                continue
            snap.docs[doc.id] = DocInfo(
                doc.id, doc.skill_id, doc.title, doc.description or "", doc.mime, doc.visibility, doc.source_url, doc.pages
            )
            snap.doc_ids.append(doc.id)
            doc_texts.append(f"{doc.title}. {doc.description or ''}")
        snap.doc_vectors = self._vectors(doc_texts)

        rows = db.execute(
            select(Chunk.id, Chunk.document_id, Chunk.skill_id, Chunk.page, Chunk.text, Chunk.visibility)
        ).all()
        snap.chunks = [ChunkInfo(*row) for row in rows if row.document_id in snap.docs]
        snap.chunk_map = {c.id: c for c in snap.chunks}
        if snap.chunks:
            snap.bm25 = BM25Okapi([tokenize(c.text) or ["_"] for c in snap.chunks])

        log.info(
            "Knowledge index v%s: %d skills, %d docs, %d chunks, %d Q&A",
            version, len(snap.skills), len(snap.docs), len(snap.chunks), len(snap.qa),
        )
        return snap

    # ------------------------------------------------------------ queries

    @staticmethod
    def allowed_skill_ids(snap: Snapshot, audience: str) -> list[int]:
        return [s.id for s in snap.skills.values() if s.visibility == PUBLIC or audience == INTERNAL]

    def route(self, snap: Snapshot, query: str, query_vec: np.ndarray, audience: str) -> list[tuple[SkillInfo, float]]:
        """Rank allowed skills for the query (vector similarity + keyword bonus)."""
        allowed = set(self.allowed_skill_ids(snap, audience))
        if snap.skill_vectors is None:
            return []
        scores = snap.skill_vectors @ query_vec
        ranked = []
        for sid, score in zip(snap.skill_ids, scores):
            if sid not in allowed:
                continue
            skill = snap.skills[sid]
            bonus = 0.15 if keyword_hit(query, skill.keywords) else 0.0
            ranked.append((skill, float(score) + bonus))
        ranked.sort(key=lambda item: item[1], reverse=True)
        return ranked

    def match_qa(self, snap: Snapshot, query_vec: np.ndarray, audience: str) -> list[tuple[QAInfo, float]]:
        if snap.qa_vectors is None:
            return []
        allowed = set(self.allowed_skill_ids(snap, audience))
        scores = snap.qa_vectors @ query_vec
        best: dict[int, float] = {}
        for row, score in enumerate(scores):
            owner = snap.qa_owner[row]
            if snap.qa[owner].skill_id in allowed:
                best[owner] = max(best.get(owner, -1.0), float(score))
        return sorted(((snap.qa[i], s) for i, s in best.items()), key=lambda x: x[1], reverse=True)

    def match_documents(self, snap: Snapshot, query_vec: np.ndarray, audience: str, limit: int = 5):
        if snap.doc_vectors is None:
            return []
        allowed_skills = set(self.allowed_skill_ids(snap, audience))
        visible = set(visibilities_for(audience))
        scores = snap.doc_vectors @ query_vec
        results = []
        for doc_id, score in zip(snap.doc_ids, scores):
            doc = snap.docs[doc_id]
            if doc.skill_id in allowed_skills and doc.visibility in visible:
                results.append((doc, float(score)))
        results.sort(key=lambda x: x[1], reverse=True)
        return results[:limit]

    def bm25_search(self, snap: Snapshot, query: str, audience: str, skill_ids: set[int], k: int):
        if snap.bm25 is None:
            return []
        tokens = tokenize(query)
        if not tokens:
            return []
        visible = set(visibilities_for(audience))
        scores = snap.bm25.get_scores(tokens)
        order = np.argsort(scores)[::-1]
        results = []
        for index in order:
            if scores[index] <= 0 or len(results) >= k:
                break
            chunk = snap.chunks[index]
            if chunk.visibility in visible and chunk.skill_id in skill_ids:
                results.append((chunk, float(scores[index])))
        return results


knowledge = KnowledgeIndex()
