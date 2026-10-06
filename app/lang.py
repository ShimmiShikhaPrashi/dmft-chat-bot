"""Multilingual (English / Hindi / Chhattisgarhi / Hinglish) text handling."""

import re
import unicodedata

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")
ZERO_WIDTH = re.compile(r"[​‌‍⁠﻿]")
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

# Romanised Hindi words that are rare in English. Used to spot Hinglish.
HINGLISH_WORDS = {
    "hai", "hain", "kya", "kyu", "kyun", "kaise", "kaisa", "kitna", "kitne", "kitni", "kab", "kahan",
    "kaun", "kon", "mera", "meri", "mere", "hum", "humko", "mujhe", "aap", "aapka", "apna", "ke", "ki",
    "ka", "ko", "se", "me", "mein", "par", "aur", "ya", "nahi", "nahin", "hota", "hoti", "hote", "karna",
    "karo", "kare", "kariye", "batao", "bataiye", "bataye", "chahiye", "milega", "milegi", "yojana",
    "yojna", "shikayat", "jankari", "jaankari", "paisa", "rashi", "gaon", "gram", "zila", "jila",
    "sarkar", "kaam", "liye", "wala", "wali", "raha", "rahi", "gaya", "gayi", "tha", "thi", "sakta",
    "sakte", "sakti", "dijiye", "bhejo", "bhejiye", "dikhao", "namaste", "namaskar", "dhanyavad",
}

EN_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "to", "in", "on", "for", "and",
    "or", "by", "with", "as", "at", "from", "this", "that", "these", "those", "it", "its", "what",
    "which", "who", "whom", "how", "when", "where", "why", "do", "does", "did", "can", "could", "shall",
    "should", "will", "would", "may", "might", "i", "me", "my", "we", "our", "you", "your", "please",
    "tell", "about", "any", "there", "their", "they", "them", "he", "she", "his", "her", "has", "have",
    "had", "not", "no", "so", "if", "than", "then", "also", "into", "such", "under",
}
HI_STOPWORDS = {
    "का", "के", "की", "को", "है", "हैं", "था", "थी", "थे", "में", "से", "पर", "और", "या", "यह", "वह",
    "ये", "वे", "इस", "उस", "इन", "उन", "क्या", "कैसे", "कौन", "कब", "कहाँ", "कहां", "कितना", "कितने",
    "कितनी", "भी", "तो", "ही", "हो", "होता", "होती", "होते", "जो", "एक", "लिए", "मुझे", "मेरा", "मेरी",
    "आप", "आपका", "कृपया", "बताएं", "बताइए", "बताओ", "जानकारी", "गया", "गई", "कर", "करें", "करना",
    "रहा", "रही", "रहे", "द्वारा", "तक", "साथ", "अपने", "अपना", "किस", "किसी", "सकते", "सकता",
}

# Chhattisgarhi (छत्तीसगढ़ी) words that standard Hindi does not use, or spells differently (हे vs है,
# नइ vs नहीं, कोन vs कौन). Used to tell a Chhattisgarhi question from a Hindi one.
CG_MARKERS = {
    "हवय", "हावय", "हावे", "हवे", "हे", "हें", "हावंय", "रिहिस", "रहिस", "रहिन", "अउ", "घलो", "घलव",
    "हमर", "हमन", "तुमन", "तुंहर", "तुम्हर", "मोला", "तोला", "ओला", "एला", "उंकर", "ओकर", "एकर", "तोर",
    "काबर", "कइसे", "कतका", "कतेक", "कोन", "काय", "कते", "कती", "बताव", "बतावव", "बताहू", "नइ", "नइहे",
    "नइए", "खातिर", "बर", "जम्मो", "सबो", "बिकट", "गेहे", "मिलही", "होही", "करही", "जाही", "सकथे", "सकथंव",
    "मँय", "हंव", "हँव", "अंव", "पइसा", "खरचा", "करई", "देवव", "भेजव", "करव", "बतावौ", "रहिही", "मिलथे",
}
# Present-tense verbs: करथे, होथे, मिलथे, जाथें (Hindi uses करता है / होते हैं).
CG_VERB_RE = re.compile(r"^[\u0900-\u097F]{2,}थें?$")
# Postpositions shared with other dialects: they support a Chhattisgarhi reading but never decide it.
CG_SUPPORT = {"म", "ला", "मन", "मोर", "ले"}

# Chhattisgarhi function words: ignored by BM25 like the Hindi stopwords.
CG_STOPWORDS = {
    "हे", "हें", "हवय", "हावय", "हावे", "अउ", "म", "ला", "ले", "बर", "मन", "का", "काय", "कोन", "कतका", "कतेक",
    "कइसे", "काबर", "मोला", "मोर", "हमर", "हमन", "तुमन", "बताव", "बतावव", "नइ", "घलो", "ए", "ओ", "एकर", "ओकर",
    "रिहिस", "रहिस", "होथे", "करथे", "सकथे", "खातिर", "जम्मो", "सबो", "मँय", "हंव", "हँव", "अंव", "कते", "भेजव",
    "करव", "देवव",
}

# Romanised Hindi function words: ignored by BM25 like English/Hindi stopwords.
ROMAN_HI_STOPWORDS = {
    "hai", "hain", "kya", "kyu", "kyun", "kaise", "kaisa", "kitna", "kitne", "kitni", "kab", "kahan", "kaun",
    "ka", "ki", "ke", "ko", "se", "me", "mein", "par", "aur", "ya", "nahi", "nahin", "hota", "hoti", "hote",
    "mera", "meri", "mere", "mujhe", "aap", "hum", "tha", "thi", "liye", "wala", "wali", "batao", "bataiye",
}

TOKEN_RE = re.compile(r"[0-9a-z]+|[ऀ-ॣ०-ॿ]+")

GREETING_RE = re.compile(
    r"^\s*(hi+|hello+|hey+|namaste|namaskar|namaskaram|good\s+(morning|afternoon|evening)|"
    r"नमस्ते|नमस्कार|प्रणाम|राम\s*राम|जय\s*जोहार|johar)\s*[!.,।🙏]*\s*(ji|जी)?\s*[!.,।🙏]*\s*$",
    re.IGNORECASE,
)

DOCUMENT_REQUEST_RE = re.compile(
    r"\b(pdf|document|documents|doc|download|copy|form|forms|circular|notification|order|guideline|"
    r"guidelines|file|attachment|link|send|share)\b|"
    r"दस्तावेज|दस्तावेज़|प्रति|डाउनलोड|फॉर्म|फार्म|प्रपत्र|परिपत्र|अधिसूचना|आदेश|दिशानिर्देश|दिशा-निर्देश|"
    r"गाइडलाइन|फाइल|फ़ाइल|भेजें|भेजिए|भेजो|लिंक|पीडीएफ",
    re.IGNORECASE,
)

PII_PATTERNS = [
    (re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)"), "[mobile]"),
    (re.compile(r"(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)"), "[aadhaar]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[email]"),
]


def normalize(text: str) -> str:
    """Canonical form used everywhere: NFC, no control chars, trimmed whitespace."""
    text = unicodedata.normalize("NFC", text or "")
    text = CONTROL.sub(" ", text)
    text = text.replace("�", "-")
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def search_key(text: str) -> str:
    """Aggressive normalisation for matching only (never shown to users)."""
    text = ZERO_WIDTH.sub("", normalize(text)).translate(DEVANAGARI_DIGITS)
    text = text.replace("़", "")  # nukta: फ़ाइल == फाइल
    return text.lower()


def tokenize(text: str) -> list[str]:
    """Script-aware tokenizer. Keeps Devanagari matras attached (unlike the default \\w regex)."""
    return [
        tok
        for tok in TOKEN_RE.findall(search_key(text))
        if tok not in EN_STOPWORDS and tok not in HI_STOPWORDS and tok not in ROMAN_HI_STOPWORDS
        and tok not in CG_STOPWORDS
        and (len(tok) > 1 or tok.isdigit())
    ]


def is_chhattisgarhi(text: str) -> bool:
    """Devanagari text written in Chhattisgarhi rather than standard Hindi: two Chhattisgarhi words,
    or one together with a shared postposition (म, ला, मन) or in a short message."""
    words = re.findall(r"[\u0900-\u097F]+", unicodedata.normalize("NFC", text))
    strong = sum(1 for w in words if w in CG_MARKERS or CG_VERB_RE.match(w))
    support = sum(1 for w in words if w in CG_SUPPORT)
    return strong >= 2 or (strong == 1 and (support >= 1 or len(words) <= 8))


def detect_language(text: str) -> str:
    """Return 'hi' (Devanagari Hindi), 'cg' (Chhattisgarhi), 'hinglish' (romanised Hindi) or 'en'."""
    deva = len(DEVANAGARI.findall(text))
    latin = len(LATIN.findall(text))
    if deva == 0 and latin == 0:
        return "en"
    deva_words = len(re.findall(r"[\u0900-\u097F]+", text))
    if deva / (deva + latin) > 0.3 or deva_words >= 2:
        return "cg" if is_chhattisgarhi(text) else "hi"
    words = re.findall(r"[a-z]+", text.lower())
    if words:
        hits = sum(1 for w in words if w in HINGLISH_WORDS)
        if hits >= 2 or (hits >= 1 and len(words) <= 3 and hits / len(words) >= 0.34):
            return "hinglish"
    return "en"


ANSWER_LANGUAGES = ("en", "hi", "cg")


def answer_language(detected: str, preference: str = "auto") -> str:
    """Language the bot replies in. Hinglish questions get simple Hindi replies."""
    if preference in ANSWER_LANGUAGES:
        return preference
    if detected == "cg":
        return "cg"
    return "hi" if detected in ("hi", "hinglish") else "en"


def is_greeting(text: str) -> bool:
    return bool(GREETING_RE.match(text))


def is_document_request(text: str) -> bool:
    return bool(DOCUMENT_REQUEST_RE.search(search_key(text)))


def redact_pii(text: str) -> str:
    for pattern, replacement in PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def keyword_hit(text: str, keywords: list[str]) -> bool:
    key = search_key(text)
    tokens = set(TOKEN_RE.findall(key))
    for kw in keywords or []:
        kw_key = search_key(kw)
        if not kw_key:
            continue
        if " " in kw_key or DEVANAGARI.search(kw_key):
            if kw_key in key:
                return True
        elif kw_key in tokens:
            return True
    return False


MESSAGES = {
    "greeting": {
        "en": (
            "Namaste! I am **DMFT Sahayak**, the assistant of the District Mineral Foundation Trust, "
            "Uttar Bastar Kanker.\n\nI can help you with:\n"
            "- About DMFT and the PMKKKY scheme\n"
            "- Priority sectors and fund utilisation rules\n"
            "- Kanker district information and DMFT notices\n"
            "- Official documents (I can share them for download)\n"
            "- Registering a grievance\n\n"
            "You can type or paste your question in Hindi or English."
        ),
        "hi": (
            "नमस्ते! मैं **DMFT सहायक** हूँ — ज़िला खनिज संस्थान न्यास (DMFT), उत्तर बस्तर कांकेर का सहायक।\n\n"
            "मैं इनमें आपकी मदद कर सकता हूँ:\n"
            "- DMFT और प्रधानमंत्री खनिज क्षेत्र कल्याण योजना (PMKKKY) की जानकारी\n"
            "- प्राथमिकता वाले क्षेत्र और राशि के उपयोग के नियम\n"
            "- कांकेर ज़िले की जानकारी और DMFT सूचनाएँ\n"
            "- आधिकारिक दस्तावेज़ (डाउनलोड के लिए साझा कर सकता हूँ)\n"
            "- शिकायत दर्ज करना\n\n"
            "आप अपना प्रश्न हिंदी या अंग्रेज़ी में लिख या पेस्ट कर सकते हैं।"
        ),
        "cg": (
            "जय जोहार! मँय **DMFT सहायक** अंव — जिला खनिज संस्थान न्यास (DMFT), उत्तर बस्तर कांकेर के सहायक।\n\n"
            "मँय ए बात मन म आपके मदद कर सकथंव:\n"
            "- DMFT अउ प्रधानमंत्री खनिज क्षेत्र कल्याण योजना (PMKKKY) के जानकारी\n"
            "- प्राथमिकता वाले क्षेत्र अउ पइसा खरचा करे के नियम\n"
            "- कांकेर जिला के जानकारी अउ DMFT के सूचना\n"
            "- सरकारी दस्तावेज़ (डाउनलोड करे बर दे सकथंव)\n"
            "- शिकायत दर्ज करई\n\n"
            "आप अपन सवाल छत्तीसगढ़ी, हिंदी या अंग्रेज़ी म लिख या पेस्ट कर सकथव।"
        ),
    },
    "not_found": {
        "en": (
            "This information is not available in the official documents currently uploaded to DMFT Sahayak. "
            "Your question has been recorded so that the DMFT team can add the information. "
            "For urgent queries, please contact the DMFT office, Collectorate, Kanker."
        ),
        "hi": (
            "यह जानकारी DMFT सहायक में वर्तमान में उपलब्ध आधिकारिक दस्तावेज़ों में नहीं है। "
            "आपका प्रश्न दर्ज कर लिया गया है ताकि DMFT टीम यह जानकारी जोड़ सके। "
            "तत्काल जानकारी के लिए कृपया DMFT कार्यालय, कलेक्टोरेट, कांकेर से संपर्क करें।"
        ),
        "cg": (
            "ए जानकारी DMFT सहायक म अभी के सरकारी दस्तावेज़ मन म नइ हे। "
            "आपके सवाल ल दर्ज कर ले गे हे, ताकि DMFT टीम ए जानकारी ल जोड़ सकय। "
            "जल्दी जानकारी बर DMFT कार्यालय, कलेक्टोरेट, कांकेर ले संपर्क करव।"
        ),
    },
    "llm_unavailable": {
        "en": "The AI service is temporarily unavailable. These are the most relevant passages from the official documents:",
        "hi": "AI सेवा अभी उपलब्ध नहीं है। आधिकारिक दस्तावेज़ों के सबसे प्रासंगिक अंश नीचे दिए गए हैं:",
        "cg": "AI सेवा अभी चालू नइ हे। सरकारी दस्तावेज़ मन के सबले काम के अंश तरी म दे गे हे:",
    },
    "documents_found": {
        "en": "Here are the official documents related to your request:",
        "hi": "आपके अनुरोध से संबंधित आधिकारिक दस्तावेज़ ये हैं:",
        "cg": "आपके माँग ले जुड़े सरकारी दस्तावेज़ ए मन हें:",
    },
    "grievance_intro": {
        "en": "I can register your grievance with DMFT Kanker. Please fill in the form below.",
        "hi": "मैं DMFT कांकेर में आपकी शिकायत दर्ज कर सकता हूँ। कृपया नीचे दिया गया फ़ॉर्म भरें।",
        "cg": "मँय DMFT कांकेर म आपके शिकायत दर्ज कर सकथंव। तरी दे गे फॉर्म ल भरव।",
    },
    "grievance_created": {
        "en": "Your grievance has been registered. Ticket number: **{ticket}**. Please keep it for future reference.",
        "hi": "आपकी शिकायत दर्ज हो गई है। टिकट संख्या: **{ticket}**। कृपया इसे भविष्य के लिए सुरक्षित रखें।",
        "cg": "आपके शिकायत दर्ज हो गे हे। टिकट नंबर: **{ticket}**। एला आगू बर सम्हाल के रखव।",
    },
    "error": {
        "en": "Sorry, something went wrong while answering. Please try again.",
        "hi": "क्षमा करें, उत्तर देते समय कोई त्रुटि हुई। कृपया पुनः प्रयास करें।",
        "cg": "माफी देहू, जवाब देवत बेरा कुछु गड़बड़ हो गे। फेर कोशिश करव।",
    },
    "too_long": {
        "en": "Your message is too long. Please keep it under {limit} characters.",
        "hi": "आपका संदेश बहुत लंबा है। कृपया इसे {limit} अक्षरों से कम रखें।",
        "cg": "आपके संदेश बहुत लंबा हे। एला {limit} अक्षर ले कम रखव।",
    },
}

SUGGESTIONS = {
    "en": [
        "What is DMFT?",
        "What are the high priority sectors under PMKKKY?",
        "How much of DMF funds can be used for administrative costs?",
        "Share the PMKKKY guidelines PDF",
        "Register a grievance",
    ],
    "hi": [
        "DMFT क्या है?",
        "PMKKKY में उच्च प्राथमिकता वाले क्षेत्र कौन से हैं?",
        "कांकेर ज़िले में कितनी तहसीलें हैं?",
        "PMKKKY दिशानिर्देश की PDF भेजें",
        "शिकायत दर्ज करें",
    ],
    "cg": [
        "DMFT का हे?",
        "PMKKKY म उच्च प्राथमिकता वाले क्षेत्र कोन-कोन हें?",
        "कांकेर जिला म कतका तहसील हवय?",
        "PMKKKY दिशानिर्देश के PDF भेजव",
        "शिकायत दर्ज करना हे",
    ],
}


def t(key: str, lang: str, **kwargs) -> str:
    variants = MESSAGES[key]
    text = variants.get(lang) or variants["hi" if lang == "cg" else "en"]
    return text.format(**kwargs) if kwargs else text
