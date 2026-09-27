"""Persistent vector store (ChromaDB) for document chunks."""

import threading
from dataclasses import dataclass

import numpy as np

from app.config import settings

COLLECTION = "dmft_chunks"


@dataclass
class VectorHit:
    chunk_id: str
    score: float  # cosine similarity
    metadata: dict


class VectorStore:
    def __init__(self, path: str):
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        self.client = chromadb.PersistentClient(path=path, settings=ChromaSettings(anonymized_telemetry=False))
        self.collection = self.client.get_or_create_collection(COLLECTION, metadata={"hnsw:space": "cosine"})

    def upsert(self, ids: list[str], embeddings: np.ndarray, metadatas: list[dict], documents: list[str]) -> None:
        for start in range(0, len(ids), 500):
            end = start + 500
            self.collection.upsert(
                ids=ids[start:end],
                embeddings=embeddings[start:end].tolist(),
                metadatas=metadatas[start:end],
                documents=documents[start:end],
            )

    def delete_document(self, document_id: int) -> None:
        self.collection.delete(where={"document_id": document_id})

    def update_document_metadata(self, document_id: int, changes: dict) -> None:
        existing = self.collection.get(where={"document_id": document_id}, include=["metadatas"])
        if not existing["ids"]:
            return
        metadatas = [{**meta, **changes} for meta in existing["metadatas"]]
        self.collection.update(ids=existing["ids"], metadatas=metadatas)

    def query(self, embedding: np.ndarray, k: int, visibilities: list[str], skill_ids: list[int]) -> list[VectorHit]:
        if not skill_ids or self.collection.count() == 0:
            return []
        where = {"$and": [{"visibility": {"$in": visibilities}}, {"skill_id": {"$in": skill_ids}}]}
        result = self.collection.query(
            query_embeddings=[embedding.tolist()], n_results=k, where=where, include=["metadatas", "distances"]
        )
        return [
            VectorHit(chunk_id=cid, score=1.0 - float(dist), metadata=meta)
            for cid, dist, meta in zip(result["ids"][0], result["distances"][0], result["metadatas"][0])
        ]

    def embeddings_for(self, ids: list[str]) -> dict[str, np.ndarray]:
        if not ids:
            return {}
        result = self.collection.get(ids=ids, include=["embeddings"])
        return {cid: np.asarray(vec, dtype=np.float32) for cid, vec in zip(result["ids"], result["embeddings"])}

    def count(self) -> int:
        return self.collection.count()

    def reset(self) -> None:
        self.client.delete_collection(COLLECTION)
        self.collection = self.client.get_or_create_collection(COLLECTION, metadata={"hnsw:space": "cosine"})


_store: VectorStore | None = None
_lock = threading.Lock()


def get_store() -> VectorStore:
    global _store
    if _store is None:
        with _lock:
            if _store is None:
                _store = VectorStore(str(settings.chroma_dir))
    return _store
