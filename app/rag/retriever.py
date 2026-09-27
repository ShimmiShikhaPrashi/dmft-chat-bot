"""Hybrid retrieval: dense (bge-m3, cross-lingual) + BM25 (exact terms), fused with RRF."""

from dataclasses import dataclass

import numpy as np

from app.config import settings
from app.rag.knowledge import Snapshot, knowledge, visibilities_for
from app.rag.store import get_store

RRF_K = 60
SKILL_BOOST = 1.25


@dataclass
class Hit:
    chunk_id: str
    document_id: int
    skill_id: int
    page: int | None
    text: str
    dense: float
    score: float
    lexical: bool = False


def is_relevant(hit: Hit) -> bool:
    """Semantic match strong enough on its own, or moderate and backed by an exact-term (BM25) match."""
    return hit.dense >= settings.min_relevance or (hit.lexical and hit.dense >= settings.min_hit_relevance)


def retrieve(
    snap: Snapshot,
    queries: list[tuple[str, np.ndarray]],
    audience: str,
    boost_skill_ids: set[int] | None = None,
    k: int | None = None,
) -> list[Hit]:
    """Retrieve for one or more phrasings of the question (e.g. Hindi original + English rewrite).

    Every dense and BM25 ranking list is fused with reciprocal-rank fusion; a passage's semantic
    score is its best similarity to any of the phrasings.
    """
    k = k or settings.retrieval_top_k
    allowed = set(knowledge.allowed_skill_ids(snap, audience))
    if not allowed or not snap.chunks or not queries:
        return []
    candidates = settings.retrieval_candidates
    boost_skill_ids = boost_skill_ids or set()
    store = get_store()

    fused: dict[str, float] = {}
    lexical_ids: set[str] = set()
    for query, query_vec in queries:
        dense_hits = [
            h
            for h in store.query(query_vec, candidates, visibilities_for(audience), sorted(allowed))
            if h.chunk_id in snap.chunk_map
        ]
        lexical_hits = knowledge.bm25_search(snap, query, audience, allowed, candidates)
        for rank, hit in enumerate(dense_hits):
            fused[hit.chunk_id] = fused.get(hit.chunk_id, 0.0) + 1.0 / (RRF_K + rank)
        for rank, (chunk, _score) in enumerate(lexical_hits):
            fused[chunk.id] = fused.get(chunk.id, 0.0) + 1.0 / (RRF_K + rank)
            lexical_ids.add(chunk.id)

    vectors = store.embeddings_for(list(fused))
    query_matrix = np.vstack([vec for _, vec in queries])

    hits = []
    for cid, score in fused.items():
        chunk = snap.chunk_map[cid]
        semantic = float(np.max(query_matrix @ vectors[cid])) if cid in vectors else 0.0
        if semantic < settings.min_hit_relevance:
            continue
        if chunk.skill_id in boost_skill_ids:
            score *= SKILL_BOOST
        hits.append(
            Hit(cid, chunk.document_id, chunk.skill_id, chunk.page, chunk.text, semantic, score, cid in lexical_ids)
        )
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:k]
