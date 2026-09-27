"""Sentence-aware chunking that understands the Hindi danda (। ॥)."""

import re
from dataclasses import dataclass

from app.ingest.extract import Page
from app.lang import detect_language

SENTENCE_END = re.compile(r"(?<=[.?!।॥])\s+|\n{2,}")

MAX_CHARS = 1200
OVERLAP_CHARS = 200
MIN_CHARS = 40


@dataclass
class TextChunk:
    ordinal: int
    page: int | None
    text: str
    lang: str


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in SENTENCE_END.split(text) if s and s.strip()]


def _split_long(sentence: str, limit: int) -> list[str]:
    words, parts, current = sentence.split(), [], ""
    for word in words:
        if current and len(current) + len(word) + 1 > limit:
            parts.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    if current:
        parts.append(current)
    return parts


def chunk_pages(pages: list[Page], max_chars: int = MAX_CHARS, overlap: int = OVERLAP_CHARS) -> list[TextChunk]:
    chunks: list[TextChunk] = []
    for page in pages:
        sentences: list[str] = []
        for sentence in split_sentences(page.text):
            sentences.extend(_split_long(sentence, max_chars) if len(sentence) > max_chars else [sentence])

        current: list[str] = []
        size = 0
        for sentence in sentences:
            if current and size + len(sentence) + 1 > max_chars:
                chunks.append(_make(len(chunks), page.number, current))
                # carry trailing sentences as overlap
                carry, carry_size = [], 0
                for prev in reversed(current):
                    if carry_size + len(prev) > overlap:
                        break
                    carry.insert(0, prev)
                    carry_size += len(prev) + 1
                current, size = carry, carry_size
            current.append(sentence)
            size += len(sentence) + 1
        if current:
            chunks.append(_make(len(chunks), page.number, current))
    return [c for c in chunks if len(c.text) >= MIN_CHARS]


def _make(ordinal: int, page: int | None, sentences: list[str]) -> TextChunk:
    text = " ".join(sentences).strip()
    return TextChunk(ordinal=ordinal, page=page, text=text, lang=detect_language(text))
