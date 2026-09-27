"""Context-aware answering: follow-up parsing, neighbour merging, prompt contents, new endpoints."""

import io

import openpyxl

from app.rag import generator
from app.rag.chat_service import _merge_overlap


def test_split_follow_ups():
    body, follow = generator.split_follow_ups(
        "At least **70%** [1].\n\nFOLLOW_UPS: What are other priority sectors? | Who approves plans? | What is the endowment fund?"
    )
    assert body == "At least **70%** [1]."
    assert follow == ["What are other priority sectors?", "Who approves plans?", "What is the endowment fund?"]
    body, follow = generator.split_follow_ups("Answer only.")
    assert body == "Answer only." and follow == []
    body, follow = generator.split_follow_ups("उत्तर [1]\n**FOLLOW_UPS:** प्रश्न एक? | प्रश्न दो?")
    assert body == "उत्तर [1]" and follow == ["प्रश्न एक?", "प्रश्न दो?"]


def test_not_found_with_trailing_follow_ups():
    assert generator.is_not_found("NOT_FOUND\nFOLLOW_UPS: a? | b?")


def test_merge_overlap_removes_shared_sentences():
    first = "Sentence one. Sentence two about the DMF fund."
    second = "Sentence two about the DMF fund. Sentence three."
    assert _merge_overlap(first, second) == "Sentence one. Sentence two about the DMF fund. Sentence three."
    assert _merge_overlap("Alpha part of text here.", "Beta.") == "Alpha part of text here. Beta."


def test_prompt_includes_conversation_and_format_rules():
    prompt = generator.build_prompt(
        "What about its endowment fund?", "en", [{"title": "G", "page": 1, "text": "x"}], [], [],
        history=[("What is DMF?", "DMF is a trust [1].")],
    )
    assert "User: What is DMF?" in prompt
    assert "```chart" in prompt
    assert "FOLLOW_UPS:" in prompt
    assert "Yes/No" in prompt


def test_documents_catalogue_hides_internal_from_public(client):
    client.cookies.clear()
    docs = client.get("/api/documents").json()
    assert docs and all(d["visibility"] == "public" for d in docs)
    assert {"id", "title", "url", "skill"} <= set(docs[0])


def test_excel_export(client):
    response = client.post("/api/export/xlsx", json={
        "title": "Fund split", "question": "How are funds split?", "answer": "**70%** [1]",
        "tables": [{"title": "Fund split", "headers": ["Category", "Share"], "rows": [["High", "70%"], ["Other", "30%"]]}],
        "sources": ["Guidelines p.10"],
    })
    assert response.status_code == 200
    assert "spreadsheetml" in response.headers["content-type"]
    workbook = openpyxl.load_workbook(io.BytesIO(response.content))
    assert workbook.sheetnames == ["Summary", "Fund split"]
    assert workbook["Fund split"]["B2"].value == 0.7


def test_app_shell_and_pwa_routes(client):
    assert "DMFT Sahayak" in client.get("/").text
    assert client.get("/manifest.webmanifest").json()["short_name"] == "DMFT Sahayak"
    assert "serviceWorker" not in client.get("/sw.js").text and client.get("/sw.js").status_code == 200
