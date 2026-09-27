"""Orchestrates one chat turn:

greeting -> follow-up condensing -> skill actions -> answer cache -> curated Q&A
-> hybrid retrieval -> relevance gate -> grounded generation -> citations & document cards.
"""

import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.lang import (
    SUGGESTIONS,
    answer_language,
    detect_language,
    is_document_request,
    is_greeting,
    keyword_hit,
    normalize,
    redact_pii,
    t,
)
from app.models import ChatLog
from app.rag import cache
from app.rag import generator
from app.rag.embedder import embed_one
from app.rag.knowledge import DocInfo, QAInfo, Snapshot, knowledge
from app.rag.retriever import Hit, is_relevant, retrieve

log = logging.getLogger(__name__)

CACHEABLE_ROUTES = {"rag", "qa", "documents"}
# Turns used as conversation context (refusals too, so "I meant ..." rephrasings are understood).
HISTORY_ROUTES = {"rag", "qa", "cache", "documents", "refusal", "fallback"}
SNIPPET_CHARS = 280
# Skill actions the chat UI knows how to render, with their intro message.
ACTION_MESSAGES = {"grievance_form": "grievance_intro"}
# Document cards for "send me the PDF" requests: keep only documents close to the best title match.
DOC_MATCH_MARGIN = 0.06
# Context given to the LLM: each retrieved passage is widened with its neighbouring passages
# so answers are not cut off at chunk boundaries.
EXPAND_TOP_HITS = 4
MAX_SOURCE_CHARS = 3200
MAX_CONTEXT_CHARS = 16000


def _merge_overlap(first: str, second: str) -> str:
    """Join consecutive chunks, dropping the sentences they share (chunks overlap by design)."""
    for size in range(min(len(first), len(second), 400), 20, -1):
        if first.endswith(second[:size]):
            return first + second[size:]
    return f"{first} {second}"


def _build_sources(snap: Snapshot, hits: list[Hit]) -> tuple[list[Hit], list[dict]]:
    """One LLM source per retrieved hit; top hits include their neighbours from the same document."""
    used: set[str] = set()
    source_hits, sources, total = [], [], 0
    for rank, hit in enumerate(hits):
        if hit.chunk_id in used:
            continue
        doc_id, ordinal = hit.chunk_id.rsplit("-", 1)
        text = hit.text
        used.add(hit.chunk_id)
        if rank < EXPAND_TOP_HITS and ordinal.isdigit():
            before = snap.chunk_map.get(f"{doc_id}-{int(ordinal) - 1}")
            after = snap.chunk_map.get(f"{doc_id}-{int(ordinal) + 1}")
            if before and before.id not in used and len(before.text) + len(text) <= MAX_SOURCE_CHARS:
                text = _merge_overlap(before.text, text)
                used.add(before.id)
            if after and after.id not in used and len(after.text) + len(text) <= MAX_SOURCE_CHARS:
                text = _merge_overlap(text, after.text)
                used.add(after.id)
        if total + len(text) > MAX_CONTEXT_CHARS and sources:
            break
        total += len(text)
        source_hits.append(hit)
        sources.append({"title": snap.docs[hit.document_id].title, "page": hit.page, "text": text})
    return source_hits, sources


def _related_questions(qa_matches: list, answered: QAInfo, lang: str) -> list[str]:
    """Other curated questions close to this one, offered as follow-up chips."""
    related = []
    for qa, score in qa_matches[1:6]:
        question = (qa.question_hi if lang == "hi" else qa.question_en) or qa.question_en or qa.question_hi
        if qa.id != answered.id and score >= 0.55 and question:
            related.append(question)
    return related[:3]


def _doc_url(doc: DocInfo, page: int | None = None) -> str:
    url = f"/api/documents/{doc.id}/download"
    if page and doc.mime == "application/pdf":
        url += f"#page={page}"
    return url


def _doc_card(snap: Snapshot, doc: DocInfo) -> dict:
    skill = snap.skills.get(doc.skill_id)
    return {
        "id": doc.id,
        "title": doc.title,
        "description": doc.description,
        "mime": doc.mime,
        "url": _doc_url(doc),
        "source_url": doc.source_url,
        "skill": skill.name_en if skill else "",
    }


def _citation(snap: Snapshot, n: int, hit: Hit) -> dict:
    doc = snap.docs[hit.document_id]
    snippet = hit.text if len(hit.text) <= SNIPPET_CHARS else hit.text[:SNIPPET_CHARS].rsplit(" ", 1)[0] + " …"
    return {
        "n": n,
        "document_id": doc.id,
        "title": doc.title,
        "page": hit.page,
        "snippet": snippet,
        "url": _doc_url(doc, hit.page),
    }


def _qa_answer(qa: QAInfo, lang: str) -> str:
    preferred, other = (qa.answer_hi, qa.answer_en) if lang == "hi" else (qa.answer_en, qa.answer_hi)
    if preferred.strip():
        return preferred
    try:
        return generator.translate(other, lang)
    except generator.LLMUnavailable:
        return other


def _history(db: Session, session_id: str) -> list[tuple[str, str]]:
    rows = db.scalars(
        select(ChatLog)
        .where(ChatLog.session_id == session_id, ChatLog.route.in_(HISTORY_ROUTES))
        .order_by(ChatLog.id.desc())
        .limit(settings.history_turns)
    ).all()
    return [(row.standalone_question or row.question, row.answer) for row in reversed(rows)]


def answer(db: Session, message: str, session_id: str, audience: str, lang_pref: str = "auto") -> dict:
    started = time.perf_counter()
    text = normalize(message)
    detected = detect_language(text)
    lang = answer_language(detected, lang_pref)
    result = {
        "answer": "", "lang": lang, "detected_lang": detected, "route": "error",
        "citations": [], "documents": [], "action": None, "suggestions": [],
    }
    state = {"standalone": text, "top_score": 0.0, "skills": []}

    def finish(**changes) -> dict:
        result.update(changes)
        entry = ChatLog(
            session_id=session_id,
            lang=detected,
            question=redact_pii(text),
            standalone_question=redact_pii(state["standalone"]) if state["standalone"] != text else "",
            answer=result["answer"],
            route=result["route"],
            top_score=round(state["top_score"], 4),
            skills=state["skills"],
            citations=[{"document_id": c["document_id"], "page": c["page"]} for c in result["citations"]],
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        db.add(entry)
        db.commit()
        result["log_id"] = entry.id
        return result

    if len(text) > settings.max_message_chars:
        result.update(answer=t("too_long", lang, limit=settings.max_message_chars), route="error")
        return result

    if is_greeting(text):
        return finish(answer=t("greeting", lang), route="greeting", suggestions=SUGGESTIONS[lang])

    try:
        return _answer_with_knowledge(db, text, session_id, audience, lang, state, finish)
    except Exception:
        log.exception("Chat turn failed")
        db.rollback()
        return finish(answer=t("error", lang), route="error")


def _rewrite(history: list[tuple[str, str]], text: str, detected: str) -> tuple[str, str | None]:
    """Standalone question (resolving follow-ups) + English search query for Hindi/Hinglish input."""
    needs_english = detected in ("hi", "hinglish")
    if not history and not needs_english:
        return text, None
    try:
        standalone, english = generator.rewrite_query(history, text)
    except generator.LLMUnavailable:
        return text, None
    if not history:
        standalone = text
    if not needs_english or not english or english.strip().lower() == standalone.strip().lower():
        english = None
    return standalone, english


def _match_qa(snap: Snapshot, vectors: list, audience: str) -> list[tuple[QAInfo, float]]:
    best: dict[int, tuple[QAInfo, float]] = {}
    for vec in vectors:
        for qa, score in knowledge.match_qa(snap, vec, audience):
            if qa.id not in best or score > best[qa.id][1]:
                best[qa.id] = (qa, score)
    return sorted(best.values(), key=lambda item: item[1], reverse=True)


def _answer_with_knowledge(db, text, session_id, audience, lang, state, finish) -> dict:
    snap = knowledge.snapshot(db)

    history = _history(db, session_id)
    standalone, english = _rewrite(history, text, detect_language(text))
    state["standalone"] = standalone
    query_vec = embed_one(standalone)
    queries = [(standalone, query_vec)]
    if english:
        queries.append((english, embed_one(english)))

    # 1. Skills that trigger a UI action (e.g. grievance form) on keyword match.
    routed = knowledge.route(snap, standalone, query_vec, audience)
    state["skills"] = [s.slug for s, _ in routed[:3]]
    for skill, _score in routed[:3]:
        if skill.action in ACTION_MESSAGES and keyword_hit(standalone, skill.keywords):
            return finish(answer=t(ACTION_MESSAGES[skill.action], lang), route="action", action=skill.action)

    # 2. Semantic answer cache (only for questions that do not depend on conversation history).
    cacheable = not history
    if cacheable:
        cached = cache.lookup(db, snap.version, audience, lang, query_vec)
        if cached:
            state["top_score"] = cached.pop("_top_score", 0.0)
            return finish(**cached, route="cache")

    def done(**changes) -> dict:
        response = finish(**changes)
        if cacheable and response["route"] in CACHEABLE_ROUTES:
            payload = {k: response[k] for k in ("answer", "citations", "documents", "suggestions")}
            payload["_top_score"] = state["top_score"]
            cache.store(db, snap.version, audience, lang, standalone, query_vec, payload)
        return response

    # 3. Curated Q&A written by DMFT staff: returned directly only for a near-identical question;
    #    close matches go to the LLM as notes (with their question, so it can judge relevance).
    qa_matches = _match_qa(snap, [vec for _, vec in queries], audience)
    if qa_matches and qa_matches[0][1] >= settings.qa_match_threshold:
        qa, score = qa_matches[0]
        state["top_score"] = score
        documents = [_doc_card(snap, snap.docs[qa.document_id])] if qa.document_id in snap.docs else []
        return done(answer=_qa_answer(qa, lang), route="qa", documents=documents,
                    suggestions=_related_questions(qa_matches, qa, lang))
    note_qas = [qa for qa, score in qa_matches[:3] if score >= settings.qa_context_threshold]
    notes = [f"Q: {qa.question_en or qa.question_hi}\nA: {qa.answer_en or qa.answer_hi}" for qa in note_qas]

    # 4. Hybrid retrieval over indexed documents (original + English phrasing).
    top_skills = [s for s, score in routed[:2] if routed and score >= routed[0][1] - 0.05]
    hits = retrieve(snap, queries, audience, {s.id for s in top_skills})
    state["top_score"] = max((h.dense for h in hits), default=0.0)

    doc_request = is_document_request(standalone)
    requested_docs = []
    if doc_request:
        matches = knowledge.match_documents(snap, queries[-1][1], audience)
        best = matches[0][1] if matches else 0.0
        requested_docs = [
            doc for doc, score in matches
            if score >= settings.min_hit_relevance and score >= best - DOC_MATCH_MARGIN
        ]

    def documents_for(citations: list[dict]) -> list[dict]:
        ordered, seen = [], set()
        candidates = requested_docs + [snap.docs[c["document_id"]] for c in citations]
        if doc_request and not requested_docs:
            candidates += [snap.docs[h.document_id] for h in hits[:3] if is_relevant(h)]
        for doc in candidates:
            if doc.id not in seen:
                seen.add(doc.id)
                ordered.append(_doc_card(snap, doc))
        return ordered[:5]

    def refuse() -> dict:
        if requested_docs:
            return done(answer=t("documents_found", lang), route="documents", documents=documents_for([]))
        return finish(answer=t("not_found", lang), route="refusal", suggestions=SUGGESTIONS[lang][:3])

    hits = [h for h in hits if is_relevant(h)]
    if not hits and not notes:
        return refuse()

    hits, sources = _build_sources(snap, hits)
    instructions = [s.instructions for s in top_skills if s.instructions]
    try:
        raw = generator.generate_answer(standalone, lang, sources, instructions, notes, history)
    except generator.LLMUnavailable:
        if not hits:
            return finish(answer=_qa_answer(note_qas[0], lang), route="fallback")
        citations = [_citation(snap, i, h) for i, h in enumerate(hits[:3], start=1)]
        body = "\n\n".join(f"[{c['n']}] {c['snippet']}" for c in citations)
        return finish(answer=f"{t('llm_unavailable', lang)}\n\n{body}", route="fallback",
                      citations=citations, documents=documents_for(citations))

    if generator.is_not_found(raw):
        return refuse()

    raw, follow_ups = generator.split_follow_ups(raw)
    used = [n for n in generator.cited_ids(raw) if 1 <= n <= len(hits)]
    if not used and hits:
        used = [1] if len(hits) == 1 else [1, 2]
    citations = [_citation(snap, n, hits[n - 1]) for n in used]
    route = "documents" if doc_request and requested_docs else "rag"
    return done(answer=raw, route=route, citations=citations, documents=documents_for(citations),
                suggestions=follow_ups)
