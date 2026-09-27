"""Test setup: isolated storage, a fast deterministic embedder, and no real LLM calls."""

import hashlib
import os
import shutil
import tempfile

import numpy as np
import pytest

TEST_STORAGE = tempfile.mkdtemp(prefix="dmft-test-")
os.environ["STORAGE_DIR"] = TEST_STORAGE
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["GEMINI_API_KEY"] = ""
os.environ["ADMIN_JWT_SECRET"] = "test-secret-" + "x" * 40
os.environ["CHAT_RATE_LIMIT"] = "1000/minute"
# The fake bag-of-words embedder scores lower than bge-m3; scale the relevance gate to match.
os.environ["MIN_RELEVANCE"] = "0.25"
os.environ["MIN_HIT_RELEVANCE"] = "0.15"
os.environ["QA_CONTEXT_THRESHOLD"] = "0.6"

from app.lang import tokenize  # noqa: E402
from app.rag import embedder  # noqa: E402

DIM = 256


class FakeEmbedder:
    """Hashed bag-of-words vectors: identical wording -> similar vectors, unrelated text -> ~0."""

    def encode(self, texts):
        out = np.zeros((len(texts), DIM), dtype=np.float32)
        for row, text in enumerate(texts):
            for token in tokenize(text):
                index = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16) % DIM
                out[row, index] += 1.0
            norm = np.linalg.norm(out[row])
            if norm:
                out[row] /= norm
        return out


embedder.set_embedder(FakeEmbedder())


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db():
    from app.db import SessionLocal, init_db

    init_db()
    with SessionLocal() as session:
        yield session


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(TEST_STORAGE, ignore_errors=True)
