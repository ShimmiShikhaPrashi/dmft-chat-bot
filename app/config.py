from functools import cached_property
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM (Gemini)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    llm_timeout_seconds: float = 60.0

    # Embeddings
    embed_model: str = "BAAI/bge-m3"
    embed_device: str = "cpu"
    embed_max_seq_length: int = 512

    # Storage
    storage_dir: Path = BASE_DIR / "storage"

    # OCR
    tesseract_cmd: str = ""
    ocr_langs: str = "hin+eng"

    # Admin auth
    admin_jwt_secret: str = "change-this-secret-in-production"
    admin_session_hours: int = 12
    cookie_secure: bool = False

    # Web / limits
    cors_origins: list[str] = []
    chat_rate_limit: str = "20/minute"
    max_message_chars: int = 2000
    max_upload_mb: int = 50

    # Retrieval
    retrieval_top_k: int = 8
    retrieval_candidates: int = 20
    # A passage is relevant if semantic score >= min_relevance, or >= min_hit_relevance
    # and it also matched lexically (BM25). Tune with `python cli.py eval --verbose`.
    min_relevance: float = 0.52
    min_hit_relevance: float = 0.45
    qa_match_threshold: float = 0.95
    qa_context_threshold: float = 0.65
    cache_threshold: float = 0.96
    history_turns: int = 3

    # URL sources
    source_refresh_days: int = 7
    enable_scheduler: bool = True

    @cached_property
    def db_path(self) -> Path:
        return self.storage_dir / "app.db"

    @cached_property
    def chroma_dir(self) -> Path:
        return self.storage_dir / "chroma"

    @cached_property
    def files_dir(self) -> Path:
        return self.storage_dir / "files"

    def ensure_dirs(self) -> None:
        for path in (self.storage_dir, self.chroma_dir, self.files_dir):
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()
