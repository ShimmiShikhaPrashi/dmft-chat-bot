from app.ingest.chunker import chunk_pages, split_sentences
from app.ingest.extract import Page
from app.lang import (
    answer_language,
    detect_language,
    is_document_request,
    is_greeting,
    keyword_hit,
    normalize,
    redact_pii,
    tokenize,
)


def test_detect_language():
    assert detect_language("DMFT क्या है?") == "hi"
    assert detect_language("What is DMFT?") == "en"
    assert detect_language("kanker me kitne tehsil hai") == "hinglish"
    assert detect_language("dmft kya hai") == "hinglish"
    assert detect_language("Is housing covered under PMKKKY?") == "en"
    # Code-mixed: mostly Latin acronyms but clearly Hindi sentence.
    assert detect_language("PMKKKY guideline की PDF भेजें") == "hi"
    assert detect_language("Kanker (कांकेर) district population") == "en"


def test_answer_language():
    assert answer_language("hinglish") == "hi"
    assert answer_language("en") == "en"
    assert answer_language("hi", "en") == "en"


def test_tokenizer_keeps_devanagari_words_whole():
    # The old TF-IDF regex split these on vowel signs (matras).
    tokens = tokenize("प्रधानमंत्री खनिज क्षेत्र कल्याण योजना")
    assert "योजना" in tokens
    assert "प्रधानमंत्री" in tokens
    assert "खनिज" in tokens


def test_tokenizer_drops_stopwords_and_normalises():
    assert tokenize("What is the DMFT?") == ["dmft"]
    assert "है" not in tokenize("DMFT क्या है")
    assert "kya" not in tokenize("dmft kya hai")
    assert tokenize("फ़ाइल") == tokenize("फाइल")  # nukta-insensitive
    assert "2024" in tokenize("२०२४")  # Devanagari digits


def test_normalize_nfc_and_whitespace():
    decomposed = "क़"  # क + nukta
    assert normalize(f"  {decomposed}   test  ") == "क़ test"


def test_greeting_and_document_request():
    assert is_greeting("नमस्ते")
    assert is_greeting("Hello!")
    assert not is_greeting("Hello, what is DMFT?")
    assert is_document_request("PMKKKY दिशानिर्देश की PDF भेजें")
    assert is_document_request("share the guidelines pdf")
    assert not is_document_request("What is DMFT?")


def test_keyword_hit_phrases_and_tokens():
    assert keyword_hit("mujhe shikayat karni hai", ["shikayat karni"])
    assert keyword_hit("मुझे शिकायत दर्ज करनी है", ["शिकायत दर्ज"])
    assert keyword_hit("I have a complaint", ["complaint"])
    assert not keyword_hit("What is the grievance redressal mechanism?", ["complaint", "register grievance"])


def test_pii_redaction():
    text = "My number is 9876543210, +91 98765 43210, aadhaar 1234 5678 9012, mail a.b@x.in"
    redacted = redact_pii(text)
    assert "9876543210" not in redacted
    assert "98765 43210" not in redacted
    assert "1234 5678 9012" not in redacted
    assert "a.b@x.in" not in redacted


def test_sentence_split_on_danda():
    parts = split_sentences("यह पहला वाक्य है। यह दूसरा वाक्य है॥ And English.")
    assert parts == ["यह पहला वाक्य है।", "यह दूसरा वाक्य है॥", "And English."]


def test_chunker_respects_size_and_pages():
    sentence = "डीएमएफ की राशि का उपयोग पेयजल और स्वास्थ्य के लिए होता है। "
    pages = [Page(1, sentence * 60), Page(2, "Short page two with enough text to keep as a chunk.")]
    chunks = chunk_pages(pages, max_chars=500, overlap=100)
    assert len(chunks) > 3
    assert all(len(c.text) <= 600 for c in chunks)
    assert chunks[0].lang == "hi"
    assert chunks[-1].page == 2
