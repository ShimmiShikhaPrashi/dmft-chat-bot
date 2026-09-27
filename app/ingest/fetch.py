"""Ingest public web pages / PDFs by URL, and refresh them when they change."""

import ipaddress
import logging
import re
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.parse import unquote, urlparse

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.ingest.extract import SUPPORTED_EXTENSIONS, html_to_text
from app.ingest.pipeline import DuplicateDocument, create_document, delete_document, index_document, sha256_bytes
from app.models import Document, Source

log = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; DMFT-Sahayak/1.0; +https://kanker.gov.in)"


class FetchError(Exception):
    pass


@dataclass
class Fetched:
    data: bytes
    filename: str
    title: str


def _check_public_host(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise FetchError("Only http(s) URLs are allowed")
    try:
        infos = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror as exc:
        raise FetchError(f"Cannot resolve host {parsed.hostname}") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            raise FetchError("URLs pointing to internal/private network addresses are not allowed")


def _slug(text: str) -> str:
    return re.sub(r"[^\wऀ-ॿ-]+", "_", text).strip("_")[:80] or "page"


def fetch_url(url: str) -> Fetched:
    _check_public_host(url)
    limit = settings.max_upload_mb * 1024 * 1024
    with httpx.Client(follow_redirects=True, timeout=45, headers={"User-Agent": USER_AGENT}) as client:
        response = client.get(url)
    _check_public_host(str(response.url))
    if response.status_code >= 400:
        raise FetchError(f"HTTP {response.status_code} for {url}")
    data = response.content
    if len(data) > limit:
        raise FetchError(f"Resource is larger than {settings.max_upload_mb} MB")

    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    path_name = unquote(PurePosixPath(urlparse(str(response.url)).path).name)
    ext = PurePosixPath(path_name).suffix.lower()

    if content_type == "application/pdf" or data[:5] == b"%PDF-":
        return Fetched(data, path_name if ext == ".pdf" else f"{_slug(path_name)}.pdf", PurePosixPath(path_name).stem)
    if "html" in content_type or ext in (".html", ".htm", ""):
        text, title = html_to_text(response.text)
        if len(text.strip()) < 50:
            raise FetchError("The page has no readable text (it may need JavaScript). Upload the document instead.")
        body = f"{title}\n\nSource: {response.url}\n\n{text}"
        return Fetched(body.encode("utf-8"), f"{_slug(title or path_name)}.txt", title)
    if ext in SUPPORTED_EXTENSIONS:
        return Fetched(data, path_name, PurePosixPath(path_name).stem)
    raise FetchError(f"Unsupported content type '{content_type}'")


def refresh_source(db: Session, source: Source, force: bool = False) -> Document | None:
    """Fetch the source; re-index only if its content changed. Returns the current document."""
    source.last_fetched = datetime.now(timezone.utc)
    try:
        fetched = fetch_url(source.url)
    except Exception as exc:
        source.last_error = str(exc)[:1000]
        db.commit()
        log.warning("Source %s failed: %s", source.url, exc)
        return None

    digest = sha256_bytes(fetched.data)
    current = db.get(Document, source.document_id) if source.document_id else None
    if current and digest == source.last_hash and not force:
        source.last_error = None
        db.commit()
        return current

    try:
        document = create_document(
            db,
            source.skill,
            fetched.data,
            fetched.filename,
            title=source.title or fetched.title,
            description=f"Official source: {source.url}",
            visibility=source.visibility,
            source_url=source.url,
        )
        document = index_document(db, document.id)
    except DuplicateDocument as duplicate:  # same file already uploaded manually
        document = duplicate.document
        if force:
            document = index_document(db, document.id)
    if current and current.id != document.id:
        delete_document(db, current)
    source.document_id = document.id
    source.last_hash = digest
    source.last_error = document.error
    if not source.title:
        source.title = document.title
    db.commit()
    return document
