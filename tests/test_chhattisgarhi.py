"""Chhattisgarhi (छत्तीसगढ़ी) as a third answer language: detection, prompt rules, API round trip."""

import pytest

from app.lang import answer_language, detect_language, t, tokenize
from app.rag import generator

CHHATTISGARHI = [
    "DMFT का हे?",
    "कांकेर जिला म कतका तहसील हवय?",
    "का DMF के पइसा ले सड़क अउ पुल बन सकथे?",
    "मोला शिकायत दर्ज करना हे",
    "ग्राम सभा के मंजूरी जरूरी हे का?",
    "DMF के ऑडिट कोन करथे?",
]
HINDI = [
    "DMFT क्या है?",
    "कांकेर ज़िले में कितनी तहसीलें हैं?",
    "क्या DMF की राशि से सड़क और पुल बन सकते हैं?",
    "मुझे शिकायत दर्ज करनी है",
    "अनुसूचित क्षेत्रों में ग्राम सभा की स्वीकृति आवश्यक है क्या?",
    "मैं जानना चाहता हूँ कि DMFT का पैसा कहाँ खर्च होता है",
    "DMF शासी परिषद का अध्यक्ष कौन होता है?",
]


@pytest.mark.parametrize("question", CHHATTISGARHI)
def test_detects_chhattisgarhi(question):
    assert detect_language(question) == "cg"


@pytest.mark.parametrize("question", HINDI)
def test_hindi_stays_hindi(question):
    assert detect_language(question) == "hi"


def test_answer_language_and_messages():
    assert answer_language("cg") == "cg"
    assert answer_language("hi", "cg") == "cg"
    assert answer_language("cg", "en") == "en"
    assert "हे" in t("not_found", "cg") or "नइ" in t("not_found", "cg")
    assert "{ticket}" not in t("grievance_created", "cg", ticket="DMFT-1")


def test_chhattisgarhi_function_words_ignored_by_search():
    assert tokenize("कांकेर जिला म कतका तहसील हवय?") == ["कांकेर", "जिला", "तहसील"]


def test_prompt_uses_chhattisgarhi_rules():
    prompt = generator.build_prompt("DMFT का हे?", "cg", [{"title": "G", "page": 1, "text": "x"}], [], [])
    assert "Chhattisgarhi (छत्तीसगढ़ी)" in prompt
    assert "word-for-word" in prompt
    assert "PMKKKY" in prompt and "PMU" in prompt
    assert "हव/नइ" in prompt


def test_chat_api_accepts_chhattisgarhi(client):
    response = client.post("/api/chat", json={"message": "जय जोहार", "session_id": "s-cg-0001", "lang": "cg"})
    assert response.status_code == 200
    data = response.json()
    assert data["route"] == "greeting" and data["lang"] == "cg"
    assert "मँय" in data["answer"]


def test_auto_language_replies_in_chhattisgarhi(client):
    data = client.post("/api/chat", json={"message": "आज क्रिकेट मैच म कोन जीतिस हे?", "session_id": "s-cg-0002"}).json()
    assert data["detected_lang"] == "cg"
    assert data["lang"] == "cg"
    assert data["route"] == "refusal"
    assert data["answer"] == t("not_found", "cg")
