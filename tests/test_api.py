"""End-to-end API tests: ingestion, retrieval gating, visibility, Q&A training loop, grievances."""

import json
import uuid

import pytest

from app.models import AdminUser, Skill
from app.rag import generator

SESSION = "test-session-" + uuid.uuid4().hex[:8]

PUBLIC_DOC = (
    "Pradhan Mantri Khanij Kshetra Kalyan Yojana guidelines. At least 70% of PMKKKY funds shall be utilised in "
    "high priority sectors such as drinking water supply, health care and education. Up to 30% may be used for "
    "physical infrastructure such as roads and bridges. Administrative expenses shall not exceed 5% of annual receipts."
)
INTERNAL_DOC = (
    "Internal note on the confidential tender evaluation committee. The evaluation committee meets on the first "
    "Monday of every month in the Collectorate conference hall to review confidential tender bids."
)


@pytest.fixture(scope="module", autouse=True)
def seeded(client):
    from app.auth import hash_password
    from app.db import SessionLocal

    with SessionLocal() as db:
        db.add(AdminUser(username="admin", password_hash=hash_password("correct-horse-battery"), role="admin"))
        db.add(Skill(slug="pmkkky", name_en="PMKKKY guidelines", description="PMKKKY funds and sectors",
                     keywords=["pmkkky"]))
        db.add(Skill(slug="grievance", name_en="Grievance", action="grievance_form",
                     keywords=["complaint", "शिकायत दर्ज"]))
        db.commit()

    login(client)
    skill_id = next(s["id"] for s in client.get("/api/admin/skills").json() if s["slug"] == "pmkkky")
    for name, text, visibility in [("guidelines.txt", PUBLIC_DOC, "public"), ("tender.txt", INTERNAL_DOC, "internal")]:
        response = client.post(
            "/api/admin/documents",
            files={"file": (name, text.encode("utf-8"), "text/plain")},
            data={"skill_id": str(skill_id), "visibility": visibility, "title": name.split(".")[0].title()},
        )
        assert response.status_code == 200, response.text
    client.post("/api/admin/logout")
    return skill_id


def login(client):
    response = client.post("/api/admin/login", json={"username": "admin", "password": "correct-horse-battery"})
    assert response.status_code == 200


def chat(client, message, session=SESSION, lang="auto"):
    response = client.post("/api/chat", json={"message": message, "session_id": session, "lang": lang})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def fake_llm(monkeypatch):
    calls = []

    def complete(prompt):
        calls.append(prompt)
        if "LATEST MESSAGE:" in prompt:  # query rewrite
            latest = prompt.rsplit("LATEST MESSAGE:", 1)[-1].strip()
            return json.dumps({"standalone": latest, "english": latest})
        if "<sources>" not in prompt:  # translation
            return "translated"
        return "At least **70%** of funds go to high priority sectors [1]."

    monkeypatch.setattr(generator, "llm_complete", complete)
    return calls


def test_health(client):
    body = client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["chunks"] >= 2


def test_documents_indexed(client):
    login(client)
    docs = client.get("/api/admin/documents").json()
    client.post("/api/admin/logout")
    assert {d["status"] for d in docs} == {"indexed"}


def test_greeting_bilingual(client):
    assert chat(client, "नमस्ते")["route"] == "greeting"
    assert chat(client, "नमस्ते")["lang"] == "hi"
    assert chat(client, "Hello")["lang"] == "en"


def test_rag_answer_with_citations(client, fake_llm):
    data = chat(client, "What percentage of PMKKKY funds go to high priority sectors?", session="s-rag-0001")
    assert data["route"] == "rag"
    assert "70%" in data["answer"]
    assert data["citations"] and data["citations"][0]["title"] == "Guidelines"
    assert data["citations"][0]["url"].startswith("/api/documents/")
    assert "untrusted" not in data["answer"]
    assert fake_llm, "LLM should be called for document answers"


def test_off_topic_is_refused_without_llm(client, fake_llm):
    data = chat(client, "Tell me tomorrow's cricket match score", session="s-off-0001")
    assert data["route"] == "refusal"
    assert "not available" in data["answer"]
    assert fake_llm == []


def test_refusal_in_hindi(client, fake_llm):
    data = chat(client, "कल क्रिकेट मैच का स्कोर बताइए", session="s-off-0002")
    assert data["route"] == "refusal"
    assert data["lang"] == "hi"
    assert "उपलब्ध" in data["answer"]


def test_llm_not_found_becomes_refusal(client, monkeypatch):
    monkeypatch.setattr(generator, "llm_complete", lambda prompt: "NOT_FOUND")
    data = chat(client, "What is the PMKKKY funds limit for roads and bridges?", session="s-nf-0001")
    assert data["route"] == "refusal"


def test_llm_unavailable_falls_back_to_excerpts(client):
    data = chat(client, "Up to what share of PMKKKY funds may be used for roads and bridges?", session="s-fb-0001")
    assert data["route"] == "fallback"
    assert data["citations"]


def test_internal_documents_hidden_from_public(client, fake_llm):
    data = chat(client, "When does the confidential tender evaluation committee meet?", session="s-int-0001")
    assert data["route"] == "refusal"

    login(client)
    docs = client.get("/api/admin/documents").json()
    internal = next(d for d in docs if d["visibility"] == "internal")
    staff = chat(client, "When does the confidential tender evaluation committee meet?", session="s-int-0002")
    assert staff["route"] == "rag"
    assert client.get(f"/api/documents/{internal['id']}/download").status_code == 200
    client.post("/api/admin/logout")
    client.cookies.clear()
    assert client.get(f"/api/documents/{internal['id']}/download").status_code == 403


def test_document_request_returns_cards(client, fake_llm):
    data = chat(client, "Please share the PMKKKY guidelines document", session="s-doc-0001")
    assert data["documents"]
    assert data["documents"][0]["url"].endswith("/download")
    download = client.get(data["documents"][0]["url"])
    assert download.status_code == 200
    assert b"Khanij" in download.content


def test_grievance_action_and_submission(client):
    data = chat(client, "मुझे शिकायत दर्ज करनी है", session="s-grv-0001")
    assert data["route"] == "action"
    assert data["action"] == "grievance_form"
    assert data["lang"] == "hi"

    bad = client.post("/api/grievance", json={"name": "Ram", "mobile": "12345", "description": "Handpump not working"})
    assert bad.status_code == 422
    ok = client.post("/api/grievance", json={
        "name": "Ram Kumar", "mobile": "+91 98765 43210", "block": "Charama",
        "description": "हैंडपंप दो महीने से खराब है", "lang": "auto",
    })
    assert ok.status_code == 200
    assert ok.json()["ticket"].startswith("DMFT-KNK-")
    assert "टिकट" in ok.json()["message"]


def test_training_loop_review_to_curated_answer(client, fake_llm):
    question = "Who approves the annual action plan for the district foundation?"
    first = chat(client, question, session="s-train-01")
    assert first["route"] == "refusal"

    login(client)
    queue = client.get("/api/admin/review").json()
    item = next(r for r in queue if r["id"] == first["log_id"])
    skill_id = next(s["id"] for s in client.get("/api/admin/skills").json() if s["slug"] == "pmkkky")
    resolved = client.post(f"/api/admin/review/{item['id']}/resolve", json={
        "skill_id": skill_id, "question_en": question,
        "answer_en": "The Governing Council approves the annual plan.",
        "answer_hi": "वार्षिक योजना शासी परिषद द्वारा स्वीकृत की जाती है।",
    })
    assert resolved.status_code == 200
    assert all(r["id"] != item["id"] for r in client.get("/api/admin/review").json())
    client.post("/api/admin/logout")
    client.cookies.clear()

    second = chat(client, question, session="s-train-02")
    assert second["route"] == "qa"
    assert "Governing Council" in second["answer"]
    hindi = chat(client, question, session="s-train-03", lang="hi")
    assert hindi["answer"].startswith("वार्षिक योजना")


def test_answer_cache_and_invalidation(client, fake_llm):
    question = "What is the maximum share of annual receipts for administrative expenses under PMKKKY?"
    first = chat(client, question, session="s-cache-01")
    assert first["route"] == "rag"
    again = chat(client, question, session="s-cache-02")
    assert again["route"] == "cache"
    assert again["answer"] == first["answer"]

    login(client)
    skill_id = next(s["id"] for s in client.get("/api/admin/skills").json() if s["slug"] == "pmkkky")
    client.put(f"/api/admin/skills/{skill_id}", json={"instructions": "Be brief."})
    client.post("/api/admin/logout")
    client.cookies.clear()
    after = chat(client, question, session="s-cache-03")
    assert after["route"] == "rag"


def test_feedback_requires_matching_session(client, fake_llm):
    data = chat(client, "What percentage of PMKKKY funds go to high priority sectors?", session="s-fbk-0001")
    wrong = client.post("/api/feedback", json={"log_id": data["log_id"], "session_id": "someone-else", "value": -1})
    assert wrong.status_code == 404
    right = client.post("/api/feedback", json={"log_id": data["log_id"], "session_id": "s-fbk-0001", "value": -1})
    assert right.status_code == 200


def test_admin_requires_login(client):
    client.cookies.clear()
    assert client.get("/api/admin/skills").status_code == 401
    assert client.post("/api/admin/login", json={"username": "admin", "password": "wrong"}).status_code == 401


def test_pii_not_stored_in_logs(client, fake_llm):
    chat(client, "My mobile is 9876543210, what is PMKKKY?", session="s-pii-0001")
    login(client)
    logs = client.get("/api/admin/logs?limit=5").json()
    client.post("/api/admin/logout")
    assert all("9876543210" not in row["question"] for row in logs)


def test_upload_rejects_unsupported_and_duplicate(client, seeded):
    login(client)
    exe = client.post("/api/admin/documents", files={"file": ("x.exe", b"MZ", "application/octet-stream")},
                      data={"skill_id": str(seeded)})
    assert exe.status_code == 415
    dup = client.post("/api/admin/documents", files={"file": ("again.txt", PUBLIC_DOC.encode(), "text/plain")},
                      data={"skill_id": str(seeded)})
    assert dup.status_code == 409
    client.post("/api/admin/logout")
