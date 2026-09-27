from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Visibility = Literal["public", "internal"]
LangPref = Literal["auto", "en", "hi"]
SkillAction = Literal["grievance_form"]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    lang: LangPref = "auto"


class Citation(BaseModel):
    n: int
    document_id: int
    title: str
    page: int | None = None
    snippet: str
    url: str


class DocumentCard(BaseModel):
    id: int
    title: str
    description: str = ""
    mime: str
    url: str
    source_url: str | None = None
    skill: str = ""


class ChatResponse(BaseModel):
    log_id: int | None = None
    answer: str
    lang: str
    detected_lang: str
    route: str
    citations: list[Citation] = []
    documents: list[DocumentCard] = []
    action: str | None = None
    suggestions: list[str] = []


class FeedbackRequest(BaseModel):
    log_id: int
    session_id: str = Field(pattern=r"^[A-Za-z0-9_-]{8,64}$")
    value: Literal[-1, 1]
    comment: str = Field(default="", max_length=1000)


class ExportTable(BaseModel):
    title: str = Field(default="", max_length=200)
    headers: list[str] = Field(max_length=40)
    rows: list[list[str | float | int | None]] = Field(max_length=5000)


class ExportRequest(BaseModel):
    title: str = Field(default="DMFT Sahayak report", max_length=300)
    question: str = Field(default="", max_length=4000)
    answer: str = Field(default="", max_length=30000)
    tables: list[ExportTable] = Field(default=[], max_length=10)
    sources: list[str] = Field(default=[], max_length=30)


class GrievanceRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    mobile: str
    block: str = Field(default="", max_length=100)
    village: str = Field(default="", max_length=200)
    description: str = Field(min_length=10, max_length=4000)
    lang: LangPref = "auto"

    @field_validator("mobile")
    @classmethod
    def valid_mobile(cls, value: str) -> str:
        digits = "".join(ch for ch in value if ch.isdigit())
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        if len(digits) != 10 or digits[0] not in "6789":
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return digits


# ------------------------------------------------------------------ admin

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class SkillIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,62}$")
    name_en: str = Field(min_length=1, max_length=200)
    name_hi: str = Field(default="", max_length=200)
    description: str = ""
    keywords: list[str] = []
    instructions: str = ""
    action: SkillAction | None = None
    enabled: bool = True
    visibility: Visibility = "public"


class SkillUpdate(BaseModel):
    name_en: str | None = None
    name_hi: str | None = None
    description: str | None = None
    keywords: list[str] | None = None
    instructions: str | None = None
    action: SkillAction | None = None
    enabled: bool | None = None
    visibility: Visibility | None = None


class SkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name_en: str
    name_hi: str
    description: str
    keywords: list[str]
    instructions: str
    action: str | None
    enabled: bool
    visibility: str
    updated_at: datetime
    document_count: int = 0
    qa_count: int = 0
    source_count: int = 0


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    skill_id: int
    title: str
    description: str
    filename: str
    mime: str
    visibility: str
    source_url: str | None
    pages: int
    chunk_count: int
    ocr_pages: int
    status: str
    error: str | None
    created_at: datetime
    updated_at: datetime


class DocumentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    visibility: Visibility | None = None
    skill_id: int | None = None


class QAIn(BaseModel):
    skill_id: int
    question_en: str = ""
    question_hi: str = ""
    answer_en: str = ""
    answer_hi: str = ""
    document_id: int | None = None
    enabled: bool = True


class QAOut(QAIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by: str
    updated_at: datetime


class SourceIn(BaseModel):
    skill_id: int
    url: str = Field(pattern=r"^https?://", max_length=1000)
    title: str = ""
    visibility: Visibility = "public"
    refresh: bool = True


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    skill_id: int
    url: str
    title: str
    visibility: str
    refresh: bool
    last_fetched: datetime | None
    last_error: str | None
    document_id: int | None


class ReviewResolve(BaseModel):
    skill_id: int
    question_en: str = ""
    question_hi: str = ""
    answer_en: str = ""
    answer_hi: str = ""
    document_id: int | None = None


class GrievanceUpdate(BaseModel):
    status: Literal["open", "in_progress", "resolved", "rejected"]
    remarks: str = ""


class UserIn(BaseModel):
    username: str = Field(pattern=r"^[A-Za-z0-9_.-]{3,100}$")
    password: str = Field(min_length=10, max_length=200)
    role: Literal["admin", "editor"] = "editor"
