"""Multilingual dense embeddings (BAAI/bge-m3 by default), running locally."""

import logging
import threading
from typing import Protocol

import numpy as np

from app.config import settings

log = logging.getLogger(__name__)


class Embedder(Protocol):
    def encode(self, texts: list[str]) -> np.ndarray: ...


class SentenceTransformerEmbedder:
    def __init__(self, model_name: str, device: str, max_seq_length: int):
        from sentence_transformers import SentenceTransformer

        log.info("Loading embedding model %s on %s ...", model_name, device)
        self.model = SentenceTransformer(model_name, device=device)
        self.model.max_seq_length = max_seq_length
        log.info("Embedding model ready (dim=%s)", self.model.get_sentence_embedding_dimension())

    def encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 1), dtype=np.float32)
        vectors = self.model.encode(
            texts, batch_size=16, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False
        )
        return vectors.astype(np.float32)


_embedder: Embedder | None = None
_lock = threading.Lock()


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        with _lock:
            if _embedder is None:
                _embedder = SentenceTransformerEmbedder(
                    settings.embed_model, settings.embed_device, settings.embed_max_seq_length
                )
    return _embedder


def set_embedder(embedder: Embedder | None) -> None:
    """Override the embedder (used by tests)."""
    global _embedder
    _embedder = embedder


def embed(texts: list[str]) -> np.ndarray:
    return get_embedder().encode(texts)


def embed_one(text: str) -> np.ndarray:
    return embed([text])[0]
