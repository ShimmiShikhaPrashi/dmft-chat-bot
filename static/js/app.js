/* DMFT Sahayak - app shell: Standard (citizens) and Enterprise (signed-in DMFT staff). */
(() => {
  "use strict";

  const R = window.DMFTRender;
  const esc = R.esc;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const icon = (name, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  // ------------------------------------------------------------------ strings

  const I18N = {
    en: {
      brand: "DMFT Kanker", aiAssistant: "AI Assistant", enterprisePlatform: "Enterprise AI Platform",
      assistant: "DMFT Assistant", online: "Online", limited: "Limited mode", enterpriseMode: "Enterprise Mode",
      hello: "Hello!", iAm: "I am DMFT Assistant",
      heroText: "Ask me anything about DMFT schemes, projects, guidelines and reports - in Hindi or English.",
      placeholder: "Type your question…", inputLabel: "Your question",
      disclaimer: "Answers come only from official DMFT documents. Verify important details with the DMFT office.",
      home: "Home", chat: "Chat", history: "History", knowledge: "Knowledge", profile: "Profile", projects: "Projects",
      reports: "Reports", more: "More", dashboard: "Dashboard", newChat: "New chat", recent: "Recent", noRecent: "No conversations yet",
      cards: [
        { icon: "doc", tone: "t-green", label: "What is DMFT?", q: "What is DMFT?" },
        { icon: "chart", tone: "t-blue", label: "How DMF funds must be used", q: "How must PMKKKY funds be divided between high priority and other priority sectors? Show as a table." },
        { icon: "download", tone: "t-orange", label: "Download latest guidelines", q: "Share the PMKKKY guidelines 2024 PDF" },
        { icon: "alert", tone: "t-rose", label: "Register a grievance", q: "I want to register a complaint" },
      ],
      moreQuestions: ["How many tehsils are in Kanker district?", "Who chairs the DMF Governing Council?", "What is the endowment fund?"],
      welcome: "Welcome,", district: "Uttar Bastar Kanker District",
      roleAdmin: "Administrator · DMFT Kanker", roleEditor: "Knowledge Editor · DMFT Kanker",
      kDocs: "Documents", kPassages: "Indexed passages", kChats: "Chats (24h)", kReview: "Pending review",
      tAskAI: "Ask AI", tAskAISub: "Chat with documents and data", tKB: "Knowledge Base", tKBSub: "Guidelines, reports, circulars",
      tProjects: "Project Data", tProjectsSub: "Works, MIS & analytics", tDocs: "Documents", tDocsSub: "Upload & manage",
      quickActions: "Quick Actions", viewAll: "View All", qaUpload: "Upload Document", qaReport: "Generate Report",
      qaProjects: "Project Dashboard", qaMinutes: "Meeting Minutes", recentConv: "Recent Conversations",
      chatEmptyTitle: "How can I help you today?", chatEmptyText: "Ask about DMFT, PMKKKY, Kanker district, notices or official documents.",
      searching: "Searching official documents…", preparing: "Preparing your answer…", still: "Still working on it…",
      source: "Source", sources: "Sources", page: "p.", more_: "more",
      copy: "Copy", copied: "Copied", like: "Like", dislike: "Dislike", listen: "Listen", stop: "Stop",
      related: "Related questions", relatedActions: "Related Actions", viewReport: "View Full Report",
      excel: "Download Excel", pdf: "Download PDF", save: "Save to Reports", saved: "Saved to Reports",
      asChart: "Chart", asTable: "Table", expand: "Expand", open: "Open", download: "Download", officialPage: "Official page",
      notAvailable: "Not in the official documents", thanks: "Thank you for the feedback",
      feedbackTitle: "What was wrong with this answer?", fbReasons: ["Incorrect", "Incomplete", "Not relevant", "Wrong language", "Outdated"],
      fbPlaceholder: "Tell us more (optional)", submit: "Submit", cancel: "Cancel",
      thanksNegative: "Thank you. The DMFT team will review this answer.",
      networkError: "Could not reach the DMFT server. Please check your connection and try again.",
      rateLimited: "Too many requests. Please wait a minute and try again.",
      offline: "You are offline. Answers need an internet connection.",
      gName: "Full name", gMobile: "Mobile number", gBlock: "Block / Tehsil", gVillage: "Village / Ward",
      gDescription: "Describe your grievance", gSelect: "Select",
      gNote: "Your name and mobile number are used only by DMFT Kanker to process this grievance.", gSubmit: "Submit grievance",
      historyTitle: "Conversation history", historySub: "Saved on this device only.", searchHistory: "Search conversations",
      today: "Today", earlier: "Earlier", clearAll: "Clear all", noHistory: "No conversations yet",
      noHistoryText: "Your questions and answers will appear here.", deleteConv: "Delete",
      kbTitle: "Knowledge Base", kbSub: "Official documents the assistant answers from.", searchDocs: "Search documents",
      all: "All", askAbout: "Ask", noDocs: "No documents found", pages: "pages", internal: "Internal",
      projTitle: "Project Data", projSub: "Works and projects sanctioned under DMFT Kanker.",
      projEmptyTitle: "No project data uploaded yet",
      projEmptyText: "Upload the approved works list, annual plan or progress reports (Excel or PDF) to the \"DMFT works & projects\" skill. The assistant will then answer project questions with tables and charts.",
      uploadWorks: "Upload works list", projPrompts: ["Sector-wise summary of sanctioned works, as a table and chart", "Block-wise number of works", "Status of ongoing works"],
      reportsTitle: "Reports", reportsSub: "Answers you saved as reports (this device).", noReports: "No saved reports",
      noReportsText: "Use \"Save to Reports\" under an answer to keep it here as a printable report.",
      settings: "Settings", answerLang: "Answer language", answerLangSub: "Auto replies in the language you type",
      auto: "Auto", english: "English", hindi: "हिन्दी", theme: "Theme", system: "System", light: "Light", dark: "Dark",
      textSize: "Text size", normal: "Normal", large: "Large", clearHistory: "Clear conversation history",
      clearHistorySub: "Removes conversations saved on this device", about: "About DMFT Sahayak",
      aboutText: "Official AI assistant of the District Mineral Foundation Trust, Uttar Bastar Kanker. Answers are generated only from documents published by DMFT Kanker; always verify important details with the DMFT office.",
      staffSignIn: "DMFT staff sign in", staffSignInSub: "Citizens do not need an account.", username: "Username", password: "Password",
      signIn: "Sign in", signOut: "Sign out", adminPanel: "Admin panel", adminPanelSub: "Skills, documents, review queue, grievances",
      signedIn: "Signed in - Enterprise mode enabled", signedOut: "Signed out",
      attachTitle: "Add to your message", voiceHi: "Speak in Hindi", voiceEn: "Speak in English", voiceSub: "Voice typing",
      pasteText: "Paste text", pasteSub: "Paste a passage and ask about it", uploadDoc: "Upload document to Knowledge Base",
      uploadSub: "Staff only - indexed in about a minute", listening: "Listening… speak now",
      voiceUnsupported: "Voice input is not supported in this browser",
      uploadTitle: "Upload document", skill: "Skill", visibility: "Visibility", public_: "Public", internal_: "Internal (staff only)",
      chooseFiles: "Choose files", uploading: "Uploading…", uploaded: "uploaded - indexing in the background", upload: "Upload",
      notifications: "Notifications", noNotifications: "You're all caught up", nReview: "questions need review",
      nGrievances: "open grievances", nFailed: "documents failed to index",
      clearConversation: "Clear conversation", exportConversation: "Download conversation (PDF)",
      reportFor: "AI Assistant Report", question: "Question", answer: "Answer", generated: "Generated",
      reportNote: "Generated by DMFT Sahayak from official DMFT Uttar Bastar Kanker documents. Verify important figures with the DMFT office before official use.",
      conversation: "Conversation", back: "Back", menu: "Menu", notificationsLabel: "Notifications", language: "Language",
      send: "Send", attach: "Attach", voice: "Voice input", confirmClear: "Delete all conversations saved on this device?",
      generateReportPrompt: "Prepare a short report on ", minutesPrompt: "Summarise the key decisions in the latest DMFT meeting minutes",
    },
    hi: {
      brand: "DMFT कांकेर", aiAssistant: "AI सहायक", enterprisePlatform: "एंटरप्राइज़ AI प्लेटफ़ॉर्म",
      assistant: "DMFT सहायक", online: "ऑनलाइन", limited: "सीमित मोड", enterpriseMode: "एंटरप्राइज़ मोड",
      hello: "नमस्ते!", iAm: "मैं DMFT सहायक हूँ",
      heroText: "DMFT योजनाओं, परियोजनाओं, दिशानिर्देशों और रिपोर्टों के बारे में हिंदी या अंग्रेज़ी में कुछ भी पूछें।",
      placeholder: "अपना प्रश्न लिखें…", inputLabel: "आपका प्रश्न",
      disclaimer: "उत्तर केवल DMFT के आधिकारिक दस्तावेज़ों पर आधारित हैं। महत्वपूर्ण जानकारी की पुष्टि DMFT कार्यालय से करें।",
      home: "होम", chat: "चैट", history: "इतिहास", knowledge: "ज्ञानकोश", profile: "प्रोफ़ाइल", projects: "परियोजनाएँ",
      reports: "रिपोर्ट", more: "अधिक", dashboard: "डैशबोर्ड", newChat: "नई बातचीत", recent: "हाल की", noRecent: "अभी कोई बातचीत नहीं",
      cards: [
        { icon: "doc", tone: "t-green", label: "DMFT क्या है?", q: "DMFT क्या है?" },
        { icon: "chart", tone: "t-blue", label: "DMF राशि का उपयोग कैसे हो", q: "PMKKKY की राशि उच्च प्राथमिकता और अन्य प्राथमिकता वाले क्षेत्रों में कैसे बाँटी जाती है? तालिका में बताइए।" },
        { icon: "download", tone: "t-orange", label: "नवीनतम दिशानिर्देश डाउनलोड करें", q: "PMKKKY दिशानिर्देश 2024 की PDF भेजें" },
        { icon: "alert", tone: "t-rose", label: "शिकायत दर्ज करें", q: "मुझे शिकायत दर्ज करनी है" },
      ],
      moreQuestions: ["कांकेर ज़िले में कितनी तहसीलें हैं?", "DMF शासी परिषद का अध्यक्ष कौन होता है?", "एंडोमेंट फंड क्या है?"],
      welcome: "स्वागत है,", district: "उत्तर बस्तर कांकेर ज़िला",
      roleAdmin: "प्रशासक · DMFT कांकेर", roleEditor: "ज्ञान संपादक · DMFT कांकेर",
      kDocs: "दस्तावेज़", kPassages: "अनुक्रमित अंश", kChats: "चैट (24 घंटे)", kReview: "समीक्षा लंबित",
      tAskAI: "AI से पूछें", tAskAISub: "दस्तावेज़ों और डेटा से चैट", tKB: "ज्ञानकोश", tKBSub: "दिशानिर्देश, रिपोर्ट, परिपत्र",
      tProjects: "परियोजना डेटा", tProjectsSub: "कार्य, MIS और विश्लेषण", tDocs: "दस्तावेज़", tDocsSub: "अपलोड और प्रबंधन",
      quickActions: "त्वरित कार्य", viewAll: "सभी देखें", qaUpload: "दस्तावेज़ अपलोड", qaReport: "रिपोर्ट बनाएँ",
      qaProjects: "परियोजना डैशबोर्ड", qaMinutes: "बैठक कार्यवृत्त", recentConv: "हाल की बातचीत",
      chatEmptyTitle: "आज मैं आपकी क्या सहायता करूँ?", chatEmptyText: "DMFT, PMKKKY, कांकेर ज़िला, सूचनाओं या आधिकारिक दस्तावेज़ों के बारे में पूछें।",
      searching: "आधिकारिक दस्तावेज़ खोजे जा रहे हैं…", preparing: "उत्तर तैयार हो रहा है…", still: "कृपया प्रतीक्षा करें…",
      source: "स्रोत", sources: "स्रोत", page: "पृ.", more_: "और",
      copy: "कॉपी", copied: "कॉपी हो गया", like: "पसंद", dislike: "नापसंद", listen: "सुनें", stop: "रोकें",
      related: "संबंधित प्रश्न", relatedActions: "संबंधित कार्य", viewReport: "पूरी रिपोर्ट देखें",
      excel: "Excel डाउनलोड", pdf: "PDF डाउनलोड", save: "रिपोर्ट में सहेजें", saved: "रिपोर्ट में सहेजा गया",
      asChart: "चार्ट", asTable: "तालिका", expand: "बड़ा करें", open: "खोलें", download: "डाउनलोड", officialPage: "आधिकारिक पेज",
      notAvailable: "आधिकारिक दस्तावेज़ों में उपलब्ध नहीं", thanks: "प्रतिक्रिया के लिए धन्यवाद",
      feedbackTitle: "इस उत्तर में क्या कमी थी?", fbReasons: ["गलत", "अधूरा", "प्रासंगिक नहीं", "गलत भाषा", "पुराना"],
      fbPlaceholder: "और बताएँ (वैकल्पिक)", submit: "भेजें", cancel: "रद्द करें",
      thanksNegative: "धन्यवाद। DMFT टीम इस उत्तर की समीक्षा करेगी।",
      networkError: "DMFT सर्वर से संपर्क नहीं हो सका। कृपया इंटरनेट जाँचें और पुनः प्रयास करें।",
      rateLimited: "बहुत अधिक अनुरोध। कृपया एक मिनट बाद पुनः प्रयास करें।",
      offline: "आप ऑफ़लाइन हैं। उत्तर के लिए इंटरनेट आवश्यक है।",
      gName: "पूरा नाम", gMobile: "मोबाइल नंबर", gBlock: "विकासखंड / तहसील", gVillage: "गाँव / वार्ड",
      gDescription: "अपनी शिकायत का विवरण लिखें", gSelect: "चुनें",
      gNote: "आपका नाम और मोबाइल नंबर केवल DMFT कांकेर द्वारा इस शिकायत के निराकरण के लिए उपयोग किया जाएगा।", gSubmit: "शिकायत दर्ज करें",
      historyTitle: "बातचीत का इतिहास", historySub: "केवल इस डिवाइस पर सहेजा गया।", searchHistory: "बातचीत खोजें",
      today: "आज", earlier: "पहले", clearAll: "सब हटाएँ", noHistory: "अभी कोई बातचीत नहीं",
      noHistoryText: "आपके प्रश्न और उत्तर यहाँ दिखेंगे।", deleteConv: "हटाएँ",
      kbTitle: "ज्ञानकोश", kbSub: "आधिकारिक दस्तावेज़ जिनसे सहायक उत्तर देता है।", searchDocs: "दस्तावेज़ खोजें",
      all: "सभी", askAbout: "पूछें", noDocs: "कोई दस्तावेज़ नहीं मिला", pages: "पृष्ठ", internal: "आंतरिक",
      projTitle: "परियोजना डेटा", projSub: "DMFT कांकेर के अंतर्गत स्वीकृत कार्य और परियोजनाएँ।",
      projEmptyTitle: "अभी परियोजना डेटा अपलोड नहीं हुआ है",
      projEmptyText: "स्वीकृत कार्य सूची, वार्षिक योजना या प्रगति रिपोर्ट (Excel या PDF) \"DMFT कार्य एवं परियोजनाएँ\" स्किल में अपलोड करें। इसके बाद सहायक परियोजना संबंधी प्रश्नों के उत्तर तालिका और चार्ट में देगा।",
      uploadWorks: "कार्य सूची अपलोड करें", projPrompts: ["स्वीकृत कार्यों का क्षेत्रवार सारांश, तालिका और चार्ट में", "विकासखंडवार कार्यों की संख्या", "चालू कार्यों की स्थिति"],
      reportsTitle: "रिपोर्ट", reportsSub: "आपके द्वारा सहेजे गए उत्तर (इस डिवाइस पर)।", noReports: "कोई सहेजी गई रिपोर्ट नहीं",
      noReportsText: "किसी उत्तर के नीचे \"रिपोर्ट में सहेजें\" से उसे यहाँ प्रिंट योग्य रिपोर्ट के रूप में रखें।",
      settings: "सेटिंग्स", answerLang: "उत्तर की भाषा", answerLangSub: "ऑटो: जिस भाषा में लिखें उसी में उत्तर",
      auto: "ऑटो", english: "English", hindi: "हिन्दी", theme: "थीम", system: "सिस्टम", light: "लाइट", dark: "डार्क",
      textSize: "अक्षर का आकार", normal: "सामान्य", large: "बड़ा", clearHistory: "बातचीत का इतिहास हटाएँ",
      clearHistorySub: "इस डिवाइस पर सहेजी गई बातचीत हटाता है", about: "DMFT सहायक के बारे में",
      aboutText: "ज़िला खनिज संस्थान न्यास, उत्तर बस्तर कांकेर का आधिकारिक AI सहायक। उत्तर केवल DMFT कांकेर द्वारा प्रकाशित दस्तावेज़ों से बनाए जाते हैं; महत्वपूर्ण जानकारी की पुष्टि DMFT कार्यालय से अवश्य करें।",
      staffSignIn: "DMFT कर्मचारी लॉगिन", staffSignInSub: "नागरिकों को खाते की आवश्यकता नहीं है।", username: "यूज़रनेम", password: "पासवर्ड",
      signIn: "लॉगिन करें", signOut: "लॉगआउट", adminPanel: "एडमिन पैनल", adminPanelSub: "स्किल, दस्तावेज़, समीक्षा, शिकायतें",
      signedIn: "लॉगिन सफल - एंटरप्राइज़ मोड चालू", signedOut: "लॉगआउट हो गया",
      attachTitle: "संदेश में जोड़ें", voiceHi: "हिंदी में बोलें", voiceEn: "अंग्रेज़ी में बोलें", voiceSub: "आवाज़ से लिखें",
      pasteText: "टेक्स्ट पेस्ट करें", pasteSub: "कोई अंश पेस्ट करके उसके बारे में पूछें", uploadDoc: "ज्ञानकोश में दस्तावेज़ अपलोड करें",
      uploadSub: "केवल कर्मचारी - लगभग एक मिनट में अनुक्रमित", listening: "सुन रहा हूँ… अब बोलें",
      voiceUnsupported: "इस ब्राउज़र में आवाज़ से लिखने की सुविधा नहीं है",
      uploadTitle: "दस्तावेज़ अपलोड", skill: "स्किल", visibility: "दृश्यता", public_: "सार्वजनिक", internal_: "आंतरिक (केवल कर्मचारी)",
      chooseFiles: "फ़ाइलें चुनें", uploading: "अपलोड हो रहा है…", uploaded: "अपलोड - अनुक्रमण जारी", upload: "अपलोड",
      notifications: "सूचनाएँ", noNotifications: "कोई नई सूचना नहीं", nReview: "प्रश्न समीक्षा हेतु लंबित",
      nGrievances: "खुली शिकायतें", nFailed: "दस्तावेज़ अनुक्रमित नहीं हो सके",
      clearConversation: "बातचीत साफ़ करें", exportConversation: "बातचीत डाउनलोड करें (PDF)",
      reportFor: "AI सहायक रिपोर्ट", question: "प्रश्न", answer: "उत्तर", generated: "तैयार",
      reportNote: "DMFT सहायक द्वारा DMFT उत्तर बस्तर कांकेर के आधिकारिक दस्तावेज़ों से तैयार। आधिकारिक उपयोग से पहले महत्वपूर्ण आँकड़ों की पुष्टि DMFT कार्यालय से करें।",
      conversation: "बातचीत", back: "वापस", menu: "मेनू", notificationsLabel: "सूचनाएँ", language: "भाषा",
      send: "भेजें", attach: "जोड़ें", voice: "आवाज़ से लिखें", confirmClear: "इस डिवाइस पर सहेजी सभी बातचीत हटाएँ?",
      generateReportPrompt: "इस विषय पर संक्षिप्त रिपोर्ट तैयार करें: ", minutesPrompt: "DMFT की नवीनतम बैठक के कार्यवृत्त के मुख्य निर्णयों का सारांश दें",
    },
  };

  // ------------------------------------------------------------------ state & storage

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } },
  };

  const state = {
    mode: "standard", user: null, view: "home",
    langPref: ["auto", "en", "hi"].includes(store.get("dmft.langPref", "auto")) ? store.get("dmft.langPref", "auto") : "auto",
    theme: store.get("dmft.theme", "system"), textSize: store.get("dmft.textSize", "normal"),
    conversations: store.get("dmft.conversations", []), reports: store.get("dmft.reports", []),
    current: null, busy: false, typing: null, meta: { blocks: [], skills: [], max_message_chars: 2000 },
    docs: null, stats: null, llm: null, docFilter: "all", docQuery: "", historyQuery: "",
    speaking: null, recognition: null,
  };

  const uiLang = () => (state.langPref === "hi" ? "hi" : "en");
  const tr = (key) => I18N[uiLang()][key] ?? I18N.en[key] ?? key;
  const isStaff = () => state.mode === "enterprise";
  const hasHindi = (text) => /[ऀ-ॿ]/.test(text || "");

  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^A-Za-z0-9_-]/g, "");
  const timeOf = (ts) => new Date(ts).toLocaleTimeString(uiLang() === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", minute: "2-digit" });
  const dateOf = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const isToday = (ts) => new Date(ts).toDateString() === new Date().toDateString();

  function saveConversations() {
    state.conversations = state.conversations.sort((a, b) => b.updated - a.updated).slice(0, 40);
    for (const c of state.conversations) c.messages = c.messages.slice(-60);
    store.set("dmft.conversations", state.conversations);
  }

  // ------------------------------------------------------------------ small UI helpers

  function toast(message) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    $("#toastHost").appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }

  async function api(method, url, body, { form = false } = {}) {
    const options = { method, headers: {}, credentials: "same-origin" };
    if (body !== undefined) {
      if (form) options.body = body;
      else { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
    }
    const response = await fetch(url, options);
    const isJson = response.headers.get("content-type")?.includes("json");
    const data = isJson ? await response.json() : null;
    if (!response.ok) {
      const detail = data?.detail;
      const message = Array.isArray(detail) ? detail.map((d) => d.msg.replace(/^Value error, /, "")).join(". ") : detail;
      const error = new Error(message || (response.status === 429 ? tr("rateLimited") : tr("networkError")));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  const LANDSCAPE = `<svg class="landscape" viewBox="0 0 400 110" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path class="l1" d="M0 70 Q60 40 120 62 T240 56 T400 60 V110 H0Z"/>
    <path class="l2" d="M0 84 Q80 64 160 82 T320 78 T400 80 V110 H0Z"/>
    <path class="l3" d="M0 96 Q100 86 200 96 T400 94 V110 H0Z"/>
    <g><rect class="tk" x="322" y="60" width="4" height="30" rx="2"/><circle class="tr" cx="324" cy="54" r="15"/><circle class="tr" cx="336" cy="62" r="10"/><circle class="tr" cx="312" cy="63" r="9"/></g>
    <g><rect class="tk" x="360" y="68" width="3" height="22" rx="1.5"/><circle class="tr" cx="361.5" cy="63" r="11"/></g>
    <g><rect class="tk" x="40" y="74" width="3" height="18" rx="1.5"/><circle class="tr" cx="41.5" cy="69" r="10"/><circle class="tr" cx="50" cy="75" r="7"/></g>
    <g><rect class="tk" x="18" y="80" width="2.5" height="14" rx="1.2"/><circle class="tr" cx="19" cy="76" r="7"/></g>
    <circle class="tr" cx="270" cy="92" r="6"/><circle class="tr" cx="280" cy="94" r="5"/><circle class="tr" cx="100" cy="95" r="5"/>
  </svg>`;

  // ------------------------------------------------------------------ menu & sheet

  function openMenu(anchor, items) {
    const menu = $("#menu");
    menu.innerHTML = items.map((item, i) => item === "-" ? "<hr>" :
      `<button role="menuitem" data-i="${i}">${item.icon ? icon(item.icon, "ic-sm") : ""}<span>${esc(item.label)}</span>${item.checked ? icon("check", "ic-sm check") : ""}</button>`).join("");
    menu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(menu.offsetWidth, 200);
    menu.style.left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) + "px";
    menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + "px";
    menu.onclick = (event) => {
      const button = event.target.closest("button[data-i]");
      if (!button) return;
      closeMenu();
      items[Number(button.dataset.i)].onClick();
    };
    menu.querySelector("button")?.focus();
    setTimeout(() => document.addEventListener("click", closeMenuOutside, { once: true }), 0);
  }
  function closeMenu() { $("#menu").hidden = true; }
  function closeMenuOutside(event) { if (!$("#menu").contains(event.target)) closeMenu(); }

  let sheetOnClose = null;
  function openSheet(title, body, { wide = false, onClose = null } = {}) {
    $("#sheetTitle").textContent = title;
    const host = $("#sheetBody");
    host.innerHTML = "";
    if (typeof body === "string") host.innerHTML = body; else host.appendChild(body);
    $(".sheet").classList.toggle("wide", wide);
    $("#sheet").hidden = false;
    sheetOnClose = onClose;
    setTimeout(() => (host.querySelector("input, textarea, select, button") || $("#sheetClose")).focus(), 30);
    return host;
  }
  function closeSheet() {
    $("#sheet").hidden = true;
    if (sheetOnClose) { const fn = sheetOnClose; sheetOnClose = null; fn(); }
  }
  $("#sheetClose").addEventListener("click", closeSheet);
  $("#sheet").addEventListener("click", (event) => { if (event.target.id === "sheet") closeSheet(); });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#menu").hidden) closeMenu();
    else if (!$("#sheet").hidden) closeSheet();
    else if (!$("#report").hidden) closeReport();
  });

  // ------------------------------------------------------------------ preferences

  function applyPreferences() {
    const root = document.documentElement;
    if (state.theme === "system") root.removeAttribute("data-theme"); else root.dataset.theme = state.theme;
    root.dataset.text = state.textSize;
    root.lang = uiLang();
  }

  function setLangPref(value) {
    state.langPref = value;
    store.set("dmft.langPref", value);
    applyPreferences();
    renderAll();
  }

  function languageMenu(anchor) {
    openMenu(anchor, [
      { label: `${tr("auto")} (हिं / En)`, icon: "globe", checked: state.langPref === "auto", onClick: () => setLangPref("auto") },
      { label: "English", checked: state.langPref === "en", onClick: () => setLangPref("en") },
      { label: "हिन्दी", checked: state.langPref === "hi", onClick: () => setLangPref("hi") },
    ]);
  }

  // ------------------------------------------------------------------ navigation

  const TABS = {
    standard: [["home", "home"], ["history", "history"], ["knowledge", "book"], ["profile", "user"]],
    enterprise: [["home", "home"], ["chat", "chat"], ["projects", "briefcase"], ["reports", "report"], ["profile", "dots-h"]],
  };
  const SIDE = {
    standard: [["home", "home"], ["chat", "chat"], ["history", "history"], ["knowledge", "book"], ["profile", "user"]],
    enterprise: [["home", "grid"], ["chat", "chat"], ["knowledge", "book"], ["projects", "briefcase"], ["reports", "report"], ["history", "history"], ["profile", "settings"]],
  };
  const viewLabel = (view) => {
    if (view === "home" && isStaff()) return tr("dashboard");
    if (view === "profile") return isStaff() ? tr("more") : tr("profile");
    return tr(view);
  };

  // Navigation is synchronous (pushState + render); hashchange only handles browser back/forward.
  function go(view) {
    if (location.hash !== `#/${view}`) history.pushState(null, "", `#/${view}`);
    show(view);
  }
  function show(view) {
    const allowed = new Set([...SIDE[state.mode].map(([v]) => v), "chat"]);
    state.view = allowed.has(view) ? view : "home";
    $("#app").dataset.view = state.view;
    renderAll();
    if (state.view === "chat") { scrollThread(false); if (window.matchMedia("(min-width: 960px)").matches) $("#messageInput").focus(); }
  }
  window.addEventListener("hashchange", () => show(location.hash.replace(/^#\//, "") || "home"));

  function renderNav() {
    $("#tabbar").innerHTML = TABS[state.mode].map(([view, ic]) =>
      `<button class="tab" data-nav="${view}" ${state.view === view ? 'aria-current="page"' : ""}>${icon(ic)}<span>${esc(viewLabel(view))}</span></button>`).join("");
    $("#sideNav").innerHTML = SIDE[state.mode].map(([view, ic]) => {
      const count = view === "home" && isStaff() && state.stats ? (state.stats.review_pending || 0) : 0;
      return `<button class="side-link" data-nav="${view}" ${state.view === view ? 'aria-current="page"' : ""}>${icon(ic)}<span>${esc(viewLabel(view))}</span>${count ? `<span class="count">${count}</span>` : ""}</button>`;
    }).join("");
    $("#sideNewChat").innerHTML = `${icon("plus")}<span>${esc(tr("newChat"))}</span>`;
    $("#sideTagline").textContent = isStaff() ? tr("enterprisePlatform") : tr("aiAssistant");
    $(".side-brand strong").textContent = tr("brand");
    $("#sideRecentTitle").textContent = tr("recent");
    const recent = state.conversations.slice(0, 12);
    $("#sideRecent").innerHTML = recent.length
      ? recent.map((c) => `<button data-conv="${c.id}" class="${state.current?.id === c.id ? "active" : ""}" title="${esc(c.title)}">${esc(c.title)}</button>`).join("")
      : `<div class="empty-note">${esc(tr("noRecent"))}</div>`;
    const account = $("#sideAccount");
    if (isStaff()) {
      account.innerHTML = `<div class="avatar-initials">${esc(initials(state.user.username))}</div><div class="who"><strong>${esc(displayName())}</strong><span>${esc(state.user.role === "admin" ? "Admin" : "Editor")}</span></div>
        <button class="icon-btn" data-action="logout" title="${esc(tr("signOut"))}" aria-label="${esc(tr("signOut"))}">${icon("logout")}</button>`;
    } else {
      account.innerHTML = `<div class="avatar-initials">${icon("user", "ic-sm")}</div><div class="who"><strong>${esc(tr("staffSignIn"))}</strong><span>${esc(tr("staffSignInSub"))}</span></div>
        <button class="icon-btn" data-nav="profile" aria-label="${esc(tr("signIn"))}">${icon("chevron-right")}</button>`;
    }
  }

  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) { event.preventDefault(); go(nav.dataset.nav); return; }
    const conv = event.target.closest("[data-conv]");
    if (conv && !event.target.closest("[data-delete-conv]")) { openConversation(conv.dataset.conv); return; }
    const ask = event.target.closest("[data-ask]");
    if (ask) { event.preventDefault(); send(ask.dataset.ask); return; }
    const action = event.target.closest("[data-action]");
    if (action && ACTIONS[action.dataset.action]) { event.preventDefault(); ACTIONS[action.dataset.action](action); }
  });

  const initials = (name) => String(name || "?").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";
  const displayName = () => String(state.user?.username || "").split(/[._-]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

  // ------------------------------------------------------------------ app bar

  function renderAppbar() {
    const bar = $("#appbar");
    const lang = { auto: "Auto", en: "En", hi: "हिं" }[state.langPref];
    const langBtn = `<button class="lang-pill" data-action="language" aria-label="${esc(tr("language"))}" aria-haspopup="menu">${esc(lang)}${icon("chevron-down", "ic-sm")}</button>`;
    const reviewCount = isStaff() && state.stats ? (state.stats.review_pending || 0) + (state.stats.grievances_open || 0) + (state.stats.documents_failed || 0) : 0;
    const bell = isStaff() ? `<button class="icon-btn" data-action="notifications" aria-label="${esc(tr("notificationsLabel"))}">${icon("bell")}${reviewCount ? `<span class="dot">${reviewCount > 99 ? "99+" : reviewCount}</span>` : ""}</button>` : "";
    const limited = state.llm && (!state.llm.configured || state.llm.cooling_down_seconds > 0);

    if (state.view === "chat") {
      const status = isStaff() ? tr("enterpriseMode") : limited ? tr("limited") : tr("online");
      bar.innerHTML = `
        <button class="icon-btn m-only" data-action="back" aria-label="${esc(tr("back"))}">${icon("back")}</button>
        <div class="appbar-title"><img src="/static/img/logo.svg" alt="" class="logo">
          <div class="appbar-text"><strong>${esc(tr("assistant"))}</strong><span><i class="status-dot ${limited ? "limited" : ""}"></i>${esc(status)}</span></div></div>
        <div class="appbar-actions"><span class="d-only">${langBtn}</span><button class="icon-btn" data-action="chatMenu" aria-label="${esc(tr("menu"))}" aria-haspopup="menu">${icon("dots")}</button></div>`;
    } else if (state.view === "home") {
      bar.innerHTML = `
        <div class="appbar-title"><img src="/static/img/logo.svg" alt="" class="logo">
          <div class="appbar-text"><strong>${esc(tr("brand"))}</strong><span class="${isStaff() ? "" : "tagline"}">${esc(isStaff() ? tr("enterprisePlatform") : tr("aiAssistant"))}</span></div></div>
        <div class="appbar-actions">${langBtn}${bell}</div>`;
    } else {
      bar.innerHTML = `
        <div class="appbar-title"><img src="/static/img/logo.svg" alt="" class="logo m-only">
          <div class="appbar-text"><strong>${esc(viewLabel(state.view))}</strong><span>${esc(tr("brand"))}</span></div></div>
        <div class="appbar-actions">${langBtn}${bell}</div>`;
    }
  }

  // ------------------------------------------------------------------ home (standard) & dashboard (enterprise)

  function renderHome() {
    const view = $("#view-home");
    if (isStaff()) return renderDashboard(view);
    view.innerHTML = `
      <div class="home">
        <div class="home-hero">
          <h1 id="homeTitle">${esc(tr("hello"))}<span>${esc(tr("iAm"))}</span></h1>
          <p>${esc(tr("heroText"))}</p>
        </div>
        <div class="prompt-cards">
          ${I18N[uiLang()].cards.map((c) => `<button class="prompt-card" data-ask="${esc(c.q)}"><span class="icon-tile ${c.tone}">${icon(c.icon)}</span><span class="label">${esc(c.label)}</span>${icon("chevron-right", "chev")}</button>`).join("")}
        </div>
        <div class="home-chips">${I18N[uiLang()].moreQuestions.map((q) => `<button class="chip" data-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>
        <div class="home-foot">${LANDSCAPE}</div>
      </div>`;
  }

  function renderDashboard(view) {
    const s = state.stats || {};
    const kpi = (value, label, attention = false) => `<div class="kpi ${attention && value ? "attention" : ""}"><div class="v">${value ?? "–"}</div><div class="l">${esc(label)}</div></div>`;
    const recent = state.conversations.slice(0, 4);
    view.innerHTML = `
      <div>
      <div class="dash">
        <section class="welcome">
          <p class="eyebrow">${esc(tr("welcome"))}</p>
          <h1 id="homeTitle">${esc(displayName())}</h1>
          <p>${esc(state.user.role === "admin" ? tr("roleAdmin") : tr("roleEditor"))}<br>${esc(tr("district"))}</p>
          ${LANDSCAPE}
        </section>
        <div class="kpis">${kpi(s.documents, tr("kDocs"))}${kpi(s.chunks, tr("kPassages"))}${kpi(s.chats_24h, tr("kChats"))}${kpi(s.review_pending, tr("kReview"), true)}</div>
        <div class="tiles">
          <button class="tile blue" data-action="newChat"><span class="tile-icon">${icon("sparkle")}</span><strong>${esc(tr("tAskAI"))}</strong><span>${esc(tr("tAskAISub"))}</span></button>
          <button class="tile green" data-nav="knowledge"><span class="tile-icon">${icon("book")}</span><strong>${esc(tr("tKB"))}</strong><span>${esc(tr("tKBSub"))}</span></button>
          <button class="tile orange" data-nav="projects"><span class="tile-icon">${icon("chart")}</span><strong>${esc(tr("tProjects"))}</strong><span>${esc(tr("tProjectsSub"))}</span></button>
          <button class="tile purple" data-action="adminDocs"><span class="tile-icon">${icon("doc")}</span><strong>${esc(tr("tDocs"))}</strong><span>${esc(tr("tDocsSub"))}</span></button>
        </div>
        <div class="dash-grid">
          <section>
            <div class="section-head"><h2>${esc(tr("quickActions"))}</h2><button class="link-btn" data-action="adminHome">${esc(tr("viewAll"))}</button></div>
            <div class="card quick">
              <button data-action="upload"><span class="icon-tile t-blue">${icon("upload")}</span>${esc(tr("qaUpload"))}</button>
              <button data-action="generateReport"><span class="icon-tile t-green">${icon("report")}</span>${esc(tr("qaReport"))}</button>
              <button data-nav="projects"><span class="icon-tile t-rose">${icon("chart")}</span>${esc(tr("qaProjects"))}</button>
              <button data-action="minutes"><span class="icon-tile t-orange">${icon("users")}</span>${esc(tr("qaMinutes"))}</button>
            </div>
          </section>
          <section>
            <div class="section-head"><h2>${icon("history", "ic-sm")} ${esc(tr("recentConv"))}</h2><button class="link-btn" data-nav="history">${esc(tr("viewAll"))}</button></div>
            <div class="card recent-list">
              ${recent.length ? recent.map((c) => `<button class="recent-item" data-conv="${c.id}">${icon("chat", "ic-sm")}<span class="t">${esc(c.title)}</span><time>${dateOf(c.updated)}</time></button>`).join("")
                : `<div class="empty-note" style="color:var(--text-3);padding:6px 4px">${esc(tr("noRecent"))}</div>`}
            </div>
          </section>
        </div>
      </div></div>`;
  }

  // ------------------------------------------------------------------ chat

  const thread = $("#thread");
  const input = $("#messageInput");

  function scrollThread(smooth = true) {
    const view = $("#view-chat");
    requestAnimationFrame(() => view.scrollTo({ top: view.scrollHeight, behavior: smooth ? "smooth" : "auto" }));
  }

  function renderChat() {
    thread.innerHTML = "";
    const conv = state.current;
    if (!conv || !conv.messages.length) {
      const prompts = isStaff() ? [...I18N[uiLang()].projPrompts.slice(0, 1), ...I18N[uiLang()].moreQuestions.slice(0, 2)] : I18N[uiLang()].moreQuestions;
      thread.innerHTML = `<div class="chat-empty"><div class="bot-avatar">${icon("bot")}</div><h2>${esc(tr("chatEmptyTitle"))}</h2><p>${esc(tr("chatEmptyText"))}</p>
        <div class="chips-center">${[...I18N[uiLang()].cards.map((c) => c.q).slice(0, 2), ...prompts].map((q) => `<button class="chip" data-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>`;
      return;
    }
    let lastDay = "";
    for (const message of conv.messages) {
      const day = new Date(message.ts).toDateString();
      if (day !== lastDay) {
        thread.insertAdjacentHTML("beforeend", `<div class="day-sep">${isToday(message.ts) ? esc(tr("today")) : dateOf(message.ts)}</div>`);
        lastDay = day;
      }
      thread.appendChild(message.role === "user" ? userNode(message) : botNode(message));
    }
    if (state.typing && state.typing.conv === conv) thread.appendChild(state.typing.node);
  }

  function userNode(message) {
    const node = document.createElement("div");
    node.className = "msg msg-user";
    node.innerHTML = `<div class="bubble" ${hasHindi(message.text) ? 'lang="hi"' : ""}>${esc(message.text)}</div><time class="msg-time">${timeOf(message.ts)}</time>`;
    return node;
  }

  function docType(mime, sourceUrl) {
    if (mime === "application/pdf") return "PDF";
    if (mime.includes("word")) return "DOC";
    if (mime.includes("sheet") || mime === "text/csv") return "XLS";
    if (mime.startsWith("image/")) return "IMG";
    return sourceUrl ? "WEB" : "TXT";
  }

  function docCardHTML(d) {
    const type = docType(d.mime, d.source_url);
    const snapshot = d.source_url && (type === "WEB" || type === "TXT");
    const openUrl = snapshot ? d.source_url : d.url;
    return `<div class="doc-card"><span class="type-badge type-${type}">${type}</span>
      <div class="info"><strong>${esc(d.title)}</strong><span>${esc(d.skill || "")}</span></div>
      <div class="actions">
        <a class="icon-btn" href="${esc(openUrl)}" target="_blank" rel="noopener noreferrer" title="${esc(snapshot ? tr("officialPage") : tr("open"))}">${icon("external")}</a>
        ${snapshot ? "" : `<a class="icon-btn" href="${esc(d.url)}" download title="${esc(tr("download"))}">${icon("download")}</a>`}
      </div></div>`;
  }

  function botNode(message) {
    const data = message.data;
    const node = document.createElement("div");
    node.className = "msg msg-bot";
    const rendered = R.renderMarkdown(data.answer);
    const refusal = data.route === "refusal";
    const error = data.route === "error";
    const citations = data.citations || [];
    const firstSrc = citations[0];
    const srcLine = firstSrc ? `${tr("source")}: ${firstSrc.title}${firstSrc.page ? ` (${tr("page")} ${firstSrc.page})` : ""}${citations.length > 1 ? ` · +${citations.length - 1} ${tr("more_")}` : ""}` : "";
    const hasData = rendered.tables.length || rendered.charts.length;

    node.innerHTML = `
      <div class="bot-avatar">${icon("bot")}</div>
      <div class="bot-body">
        <article class="answer-card ${refusal ? "refusal" : ""} ${error ? "error" : ""}">
          ${refusal ? `<div class="refusal-head">${icon("info", "ic-sm")}${esc(tr("notAvailable"))}</div>` : ""}
          <div class="md" ${data.lang === "hi" ? 'lang="hi"' : ""}>${rendered.html}</div>
          <div class="slot-form"></div>
          ${data.documents?.length ? `<div class="doc-cards">${data.documents.map(docCardHTML).join("")}</div>` : ""}
          ${citations.length ? `<details class="sources"><summary>${icon("chevron-right")}${esc(tr("sources"))} (${citations.length})</summary>
            ${citations.map((c) => `<a class="source-item" data-n="${c.n}" href="${esc(c.url)}" target="_blank" rel="noopener"><span class="cite">${c.n}</span><span><span class="st">${esc(c.title)}${c.page ? ` · ${tr("page")} ${c.page}` : ""}</span><span class="ss">${esc(c.snippet)}</span></span></a>`).join("")}</details>` : ""}
          <div class="answer-foot">${srcLine ? `<button class="src" data-role="toggleSources">${esc(srcLine)}</button>` : "<span></span>"}<time>${timeOf(message.ts)}</time></div>
        </article>
        ${hasData && !refusal ? `<div class="related">
          <button class="wide-btn" data-role="report">${icon("download")}${esc(tr("viewReport"))}</button>
          <div class="related-title">${esc(tr("relatedActions"))}</div>
          <div class="action-grid">
            ${rendered.tables.length ? `<button class="action-btn" data-role="excel">${icon("excel", "xl")}${esc(tr("excel"))}</button>` : ""}
            <button class="action-btn" data-role="pdf">${icon("pdf", "pdf")}${esc(tr("pdf"))}</button>
            <button class="action-btn" data-role="save">${icon("bookmark", "sv")}${esc(tr("save"))}</button>
          </div></div>` : ""}
        ${error ? "" : `<div class="msg-actions">
          <button class="pill-btn" data-role="copy">${icon("copy")}${esc(tr("copy"))}</button>
          ${data.log_id ? `<button class="pill-btn ${message.feedback === 1 ? "active" : ""}" data-role="like">${icon("like")}${esc(tr("like"))}</button>
          <button class="pill-btn ${message.feedback === -1 ? "active" : ""}" data-role="dislike">${icon("dislike")}${esc(tr("dislike"))}</button>` : ""}
          ${"speechSynthesis" in window ? `<button class="pill-btn compact" data-role="listen" aria-label="${esc(tr("listen"))}">${icon("volume")}<span>${esc(tr("listen"))}</span></button>` : ""}
          ${!hasData && !refusal ? `<button class="pill-btn compact" data-role="pdf" aria-label="PDF">${icon("pdf")}<span>PDF</span></button>` : ""}
        </div>`}
        ${data.suggestions?.length ? `<div class="followups"><span class="label">${esc(tr("related"))}</span>${data.suggestions.map((q) => `<button class="chip" data-ask="${esc(q)}" ${hasHindi(q) ? 'lang="hi"' : ""}>${icon("sparkle")}${esc(q)}</button>`).join("")}</div>` : ""}
      </div>`;

    // charts and table tools
    const md = $(".md", node);
    $$(".md-chart", md).forEach((slot) => slot.replaceWith(chartCard(rendered.charts[Number(slot.dataset.chart)])));
    $$(".md-table", md).forEach((wrap) => {
      const table = rendered.tables[Number(wrap.dataset.table)];
      const spec = R.tableToChart(table);
      const tools = document.createElement("div");
      tools.className = "table-tools";
      tools.innerHTML = `${spec ? `<button class="mini-btn" data-t="chart">${icon("chart")}${esc(tr("asChart"))}</button>` : ""}<button class="mini-btn" data-t="xl">${icon("excel")}Excel</button>`;
      wrap.appendChild(tools);
      tools.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        if (button.dataset.t === "xl") return exportExcel(message, [table]);
        const existing = wrap.nextElementSibling?.classList.contains("chart-card") ? wrap.nextElementSibling : null;
        if (existing) { existing.remove(); button.innerHTML = `${icon("chart")}${esc(tr("asChart"))}`; }
        else { wrap.after(chartCard(spec)); button.innerHTML = `${icon("grid")}${esc(tr("asTable"))}`; }
      });
    });

    if (data.action === "grievance_form") $(".slot-form", node).appendChild(grievanceForm(data.lang, message));

    node.addEventListener("click", (event) => {
      const cite = event.target.closest(".cite");
      if (cite && cite.closest(".md")) {
        event.preventDefault();
        const details = $(".sources", node);
        if (details) {
          details.open = true;
          const target = $(`.source-item[data-n="${cite.dataset.n}"]`, details);
          target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          target?.classList.add("flash");
          setTimeout(() => target?.classList.remove("flash"), 1400);
        }
        return;
      }
      const role = event.target.closest("[data-role]")?.dataset.role;
      if (!role) return;
      const handlers = {
        toggleSources: () => { const d = $(".sources", node); if (d) d.open = !d.open; },
        copy: () => copyText(R.toPlainText(data.answer)),
        like: () => sendFeedback(message, 1, "", node),
        dislike: () => askDislikeReason(message, node),
        listen: () => speak(data.answer, data.lang, event.target.closest("[data-role]")),
        report: () => openReport([message]),
        pdf: () => openReport([message], true),
        excel: () => exportExcel(message, rendered.tables),
        save: () => saveReport(message),
      };
      handlers[role]?.();
    });
    return node;
  }

  function chartCard(spec) {
    const card = document.createElement("figure");
    card.className = "chart-card";
    card.style.margin = "10px 0 12px";
    card.innerHTML = `<div class="chart-head"><strong>${esc(spec.title || "")}</strong><button class="icon-btn" aria-label="${esc(tr("expand"))}">${icon("expand")}</button></div>${R.chartSVG(spec)}`;
    $("button", card).addEventListener("click", () => openSheet(spec.title || tr("asChart"), `<div class="chart-card" style="border:0;padding:0">${R.chartSVG(spec)}</div>`, { wide: true }));
    return card;
  }

  function addTyping() {
    const node = document.createElement("div");
    node.className = "msg msg-bot";
    node.innerHTML = `<div class="bot-avatar">${icon("bot")}</div><div class="bot-body"><div class="typing-card"><span class="dots"><span></span><span></span><span></span></span><span class="typing-text">${esc(tr("searching"))}</span></div></div>`;
    thread.appendChild(node);
    scrollThread();
    const label = $(".typing-text", node);
    const timers = [setTimeout(() => (label.textContent = tr("preparing")), 2500), setTimeout(() => (label.textContent = tr("still")), 12000)];
    return { node, done: () => timers.forEach(clearTimeout) };
  }

  function ensureConversation(firstQuestion) {
    if (state.current) return state.current;
    const conv = { id: newId(), title: firstQuestion.slice(0, 80), created: Date.now(), updated: Date.now(), messages: [] };
    state.conversations.unshift(conv);
    state.current = conv;
    return conv;
  }

  async function send(text) {
    const message = String(text || "").trim();
    if (!message || state.busy) return;
    if (message.length > (state.meta.max_message_chars || 2000)) { toast(`${message.length} / ${state.meta.max_message_chars}`); return; }
    const conv = ensureConversation(message);
    const userMsg = { role: "user", text: message, ts: Date.now() };
    conv.messages.push(userMsg);
    if (state.view !== "chat") go("chat");
    else {
      if (!thread.querySelector(".msg")) thread.innerHTML = "";
      thread.appendChild(userNode(userMsg));
    }
    input.value = "";
    autosize(); updateComposer();
    state.busy = true; updateComposer();
    const typing = addTyping();
    state.typing = { node: typing.node, conv };
    let data;
    try {
      data = await api("POST", "/api/chat", { message, session_id: conv.id, lang: state.langPref });
    } catch (err) {
      data = { answer: navigator.onLine ? err.message : tr("offline"), route: "error", lang: uiLang(), citations: [], documents: [], suggestions: [] };
    }
    typing.done();
    state.typing = null;
    const botMsg = { role: "bot", data, ts: Date.now() };
    if (data.route !== "error") {
      conv.messages.push(botMsg);
      conv.updated = Date.now();
      saveConversations();
    }
    // The user may have switched conversation or view while waiting.
    if (typing.node.isConnected) typing.node.replaceWith(botNode(botMsg));
    else if (state.view === "chat" && state.current === conv) renderChat();
    state.busy = false;
    updateComposer();
    renderNav();
    scrollThread();
  }

  function newChat() {
    state.current = null;
    stopSpeaking();
    go("chat");
    renderChat();
    input.focus();
  }

  function openConversation(id) {
    const conv = state.conversations.find((c) => c.id === id);
    if (!conv) return;
    state.current = conv;
    go("chat");
    renderChat();
    scrollThread(false);
  }

  // ------------------------------------------------------------------ answer actions

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast(tr("copied")); }
    catch {
      const area = document.createElement("textarea");
      area.value = text; document.body.appendChild(area); area.select();
      try { document.execCommand("copy"); toast(tr("copied")); } finally { area.remove(); }
    }
  }

  async function sendFeedback(message, value, comment, node) {
    message.feedback = value;
    saveConversations();
    $$("[data-role=like],[data-role=dislike]", node).forEach((b) => b.classList.toggle("active", (b.dataset.role === "like" ? 1 : -1) === value));
    try {
      await api("POST", "/api/feedback", { log_id: message.data.log_id, session_id: state.current.id, value, comment });
      toast(value === 1 ? tr("thanks") : tr("thanksNegative"));
    } catch (err) { toast(err.message); }
  }

  function askDislikeReason(message, node) {
    const box = document.createElement("div");
    let reason = "";
    box.innerHTML = `<div class="chip-row" style="flex-wrap:wrap">${I18N[uiLang()].fbReasons.map((r) => `<button class="chip" type="button">${esc(r)}</button>`).join("")}</div>
      <textarea class="input" rows="3" maxlength="900" placeholder="${esc(tr("fbPlaceholder"))}"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" type="button" data-x="cancel">${esc(tr("cancel"))}</button><button class="btn btn-primary" type="button" data-x="ok">${esc(tr("submit"))}</button></div>`;
    box.addEventListener("click", (event) => {
      const chip = event.target.closest(".chip");
      if (chip) { $$(".chip", box).forEach((c) => c.classList.toggle("active", c === chip)); reason = chip.textContent; return; }
      const x = event.target.closest("[data-x]")?.dataset.x;
      if (x === "cancel") closeSheet();
      if (x === "ok") {
        const comment = [reason, $("textarea", box).value.trim()].filter(Boolean).join(": ");
        closeSheet();
        sendFeedback(message, -1, comment, node);
      }
    });
    openSheet(tr("feedbackTitle"), box);
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (state.speaking) { state.speaking.innerHTML = `${icon("volume")}<span>${esc(tr("listen"))}</span>`; state.speaking = null; }
  }

  function speak(markdown, lang, button) {
    if (state.speaking === button) return stopSpeaking();
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(R.toPlainText(markdown).replace(/[•|]/g, " "));
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
    const voice = speechSynthesis.getVoices().find((v) => v.lang === utterance.lang) || speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang === "hi" ? "hi" : "en"));
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.onend = stopSpeaking;
    state.speaking = button;
    button.innerHTML = `${icon("stop")}<span>${esc(tr("stop"))}</span>`;
    speechSynthesis.speak(utterance);
  }

  function questionFor(message) {
    const conv = state.current || state.conversations.find((c) => c.messages.includes(message));
    if (!conv) return "";
    const index = conv.messages.indexOf(message);
    for (let i = index - 1; i >= 0; i--) if (conv.messages[i].role === "user") return conv.messages[i].text;
    return "";
  }

  async function exportExcel(message, tables) {
    if (!tables?.length) return;
    const question = message.question || questionFor(message);
    try {
      const response = await fetch("/api/export/xlsx", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: tables[0].title || question.slice(0, 200) || "DMFT Sahayak report",
          question, answer: message.data.answer.slice(0, 30000),
          tables: tables.map((t) => ({ title: t.title || "", headers: t.headers, rows: t.rows })),
          sources: (message.data.citations || []).map((c) => `${c.title}${c.page ? ` (p.${c.page})` : ""}`),
        }),
      });
      if (!response.ok) throw new Error(tr("networkError"));
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `DMFT_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    } catch (err) { toast(err.message); }
  }

  function saveReport(message) {
    const question = message.question || questionFor(message);
    if (state.reports.some((r) => r.data.log_id && r.data.log_id === message.data.log_id)) { toast(tr("saved")); return; }
    state.reports.unshift({ id: newId(), title: question || "DMFT report", question, data: message.data, ts: message.ts });
    state.reports = state.reports.slice(0, 60);
    store.set("dmft.reports", state.reports);
    toast(tr("saved"));
  }

  // ------------------------------------------------------------------ full report / PDF

  function openReport(messages, print = false, title = "") {
    const paper = $("#reportPaper");
    const now = new Date();
    const sections = messages.map((message) => {
      const question = message.question || questionFor(message);
      const rendered = R.renderMarkdown(message.data.answer);
      let html = rendered.html.replace(/<div class="md-chart" data-chart="(\d+)"><\/div>/g, (_, i) =>
        `<figure class="chart-card"><div class="chart-head"><strong>${esc(rendered.charts[i].title)}</strong></div>${R.chartSVG(rendered.charts[i])}</figure>`);
      if (!rendered.charts.length) {
        rendered.tables.forEach((table) => {
          const spec = R.tableToChart(table);
          if (spec && /chart|graph|ग्राफ|चार्ट/i.test(question)) html += `<figure class="chart-card"><div class="chart-head"><strong>${esc(spec.title)}</strong></div>${R.chartSVG(spec)}</figure>`;
        });
      }
      const sources = message.data.citations || [];
      return `<div class="paper-section">
          <div class="q-label">${esc(tr("question"))}</div><h1 ${hasHindi(question) ? 'lang="hi"' : ""}>${esc(question || "-")}</h1>
          <div class="paper-section"><h2>${esc(tr("answer"))}</h2><div class="md" ${message.data.lang === "hi" ? 'lang="hi"' : ""}>${html}</div></div>
          ${sources.length ? `<div class="paper-section"><h2>${esc(tr("sources"))}</h2>${sources.map((c) => `<div class="src-row">[${c.n}] ${esc(c.title)}${c.page ? ` - ${tr("page")} ${c.page}` : ""}</div>`).join("")}</div>` : ""}
        </div>`;
    }).join('<hr style="border:0;border-top:1px dashed #e0e7f1;margin:28px 0">');
    paper.innerHTML = `
      <div class="paper-head"><img src="/static/img/logo.svg" alt="">
        <div><strong>DMFT ${uiLang() === "hi" ? "उत्तर बस्तर कांकेर" : "Uttar Bastar Kanker"}</strong><span>${esc(tr("reportFor"))}</span></div>
        <div class="meta">${esc(tr("generated"))}: ${now.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${isStaff() ? `<br>${esc(displayName())}` : ""}</div></div>
      ${sections}
      <div class="paper-foot">${esc(tr("reportNote"))}</div>`;
    const heading = title || messages[0]?.question || questionFor(messages[0]) || tr("reportFor");
    $("#reportHeading").textContent = heading;
    const tables = messages.flatMap((m) => R.renderMarkdown(m.data.answer).tables);
    $("#reportActions").innerHTML = `${tables.length ? `<button class="btn btn-sm" id="reportExcel">${icon("excel", "ic-sm")}Excel</button>` : ""}<button class="btn btn-sm btn-primary" id="reportPrint">${icon("pdf", "ic-sm")}PDF</button>`;
    $("#reportPrint").onclick = () => window.print();
    if ($("#reportExcel")) $("#reportExcel").onclick = () => exportExcel(messages[0], tables);
    const previousTitle = document.title;
    document.title = `DMFT_Report_${now.toISOString().slice(0, 10)}`;
    $("#report").hidden = false;
    $("#report").dataset.prevTitle = previousTitle;
    $("#reportClose").focus();
    if (print) setTimeout(() => window.print(), 350);
  }
  function closeReport() {
    $("#report").hidden = true;
    document.title = $("#report").dataset.prevTitle || "DMFT Sahayak";
  }
  $("#reportClose").addEventListener("click", closeReport);

  // ------------------------------------------------------------------ grievance form

  function grievanceForm(lang, message) {
    const dict = I18N[lang === "hi" ? "hi" : "en"];
    const form = document.createElement("form");
    form.className = "form-card";
    if (message.grievanceTicket) {
      const done = document.createElement("div");
      done.className = "success-box";
      done.innerHTML = `${icon("check")}<div>${R.renderMarkdown(message.grievanceMessage).html}</div>`;
      return done;
    }
    form.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>${esc(dict.gName)}</label><input class="input" name="name" required minlength="2" maxlength="200" autocomplete="name"></div>
        <div class="field"><label>${esc(dict.gMobile)}</label><input class="input" name="mobile" required inputmode="numeric" autocomplete="tel" pattern="(\\+?91[ -]?)?[6-9][0-9]{9}" maxlength="14"></div>
        <div class="field"><label>${esc(dict.gBlock)}</label><select class="input" name="block"><option value="">${esc(dict.gSelect)}</option>${state.meta.blocks.map((b) => `<option>${esc(b)}</option>`).join("")}</select></div>
        <div class="field"><label>${esc(dict.gVillage)}</label><input class="input" name="village" maxlength="200"></div>
      </div>
      <div class="field"><label>${esc(dict.gDescription)}</label><textarea class="input" name="description" required minlength="10" maxlength="4000" rows="4"></textarea></div>
      <p class="form-note">${esc(dict.gNote)}</p>
      <div style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">${esc(dict.gSubmit)}</button></div>
      <p class="form-error" role="alert"></p>`;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const error = $(".form-error", form);
      error.textContent = "";
      const button = $("button[type=submit]", form);
      button.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.lang = state.langPref;
        const result = await api("POST", "/api/grievance", payload);
        message.grievanceTicket = result.ticket;
        message.grievanceMessage = result.message;
        saveConversations();
        const done = document.createElement("div");
        done.className = "success-box";
        done.innerHTML = `${icon("check")}<div>${R.renderMarkdown(result.message).html}</div>`;
        form.replaceWith(done);
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
      }
    });
    return form;
  }

  // ------------------------------------------------------------------ history

  function renderHistory() {
    const view = $("#view-history");
    const query = state.historyQuery.toLowerCase();
    const list = state.conversations.filter((c) => !query || c.title.toLowerCase().includes(query) ||
      c.messages.some((m) => (m.text || m.data?.answer || "").toLowerCase().includes(query)));
    const item = (c) => {
      const lastBot = [...c.messages].reverse().find((m) => m.role === "bot");
      const preview = lastBot ? R.toPlainText(lastBot.data.answer).slice(0, 110) : "";
      return `<div class="list-item clickable" data-conv="${c.id}"><span class="icon-tile t-blue">${icon("chat")}</span>
        <div class="body"><strong>${esc(c.title)}</strong><span>${esc(preview)}</span></div>
        <div class="trail"><time style="font-size:12px;color:var(--text-3)">${isToday(c.updated) ? timeOf(c.updated) : dateOf(c.updated)}</time>
        <button class="icon-btn" data-delete-conv="${c.id}" aria-label="${esc(tr("deleteConv"))}">${icon("trash")}</button></div></div>`;
    };
    const today = list.filter((c) => isToday(c.updated));
    const earlier = list.filter((c) => !isToday(c.updated));
    view.innerHTML = `<div class="view-inner">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div><h1 class="page-title">${esc(tr("historyTitle"))}</h1><p class="page-sub">${esc(tr("historySub"))}</p></div>
        ${state.conversations.length ? `<button class="btn btn-sm btn-danger" data-action="clearHistory">${esc(tr("clearAll"))}</button>` : ""}
      </div>
      ${state.conversations.length ? `<div class="search-box">${icon("search")}<input class="input" id="historySearch" type="search" placeholder="${esc(tr("searchHistory"))}" value="${esc(state.historyQuery)}"></div>` : ""}
      ${list.length ? `${today.length ? `<div class="group-label">${esc(tr("today"))}</div><div class="list">${today.map(item).join("")}</div>` : ""}
        ${earlier.length ? `<div class="group-label">${esc(tr("earlier"))}</div><div class="list">${earlier.map(item).join("")}</div>` : ""}`
        : `<div class="empty-state"><div class="icon-tile t-blue">${icon("history", "ic-lg")}</div><h3>${esc(tr("noHistory"))}</h3><p>${esc(tr("noHistoryText"))}</p>
           <button class="btn btn-primary" data-action="newChat">${icon("plus", "ic-sm")}${esc(tr("newChat"))}</button></div>`}
    </div>`;
    const search = $("#historySearch");
    if (search) search.addEventListener("input", () => { state.historyQuery = search.value; renderHistory(); const s = $("#historySearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
    $$("[data-delete-conv]", view).forEach((b) => b.addEventListener("click", (event) => {
      event.stopPropagation();
      state.conversations = state.conversations.filter((c) => c.id !== b.dataset.deleteConv);
      if (state.current?.id === b.dataset.deleteConv) state.current = null;
      saveConversations(); renderHistory(); renderNav();
    }));
  }

  // ------------------------------------------------------------------ knowledge & projects

  async function loadDocs(force = false) {
    if (state.docs && !force) return state.docs;
    try { state.docs = await api("GET", "/api/documents"); } catch { state.docs = []; }
    return state.docs;
  }

  function docListItem(d) {
    const type = docType(d.mime, d.source_url);
    const name = uiLang() === "hi" && d.skill.name_hi ? d.skill.name_hi : d.skill.name_en;
    const snapshot = d.source_url && (type === "WEB" || type === "TXT");
    const askText = uiLang() === "hi" ? `"${d.title}" का सारांश बताइए` : `Summarise "${d.title}"`;
    return `<div class="list-item"><span class="type-badge type-${type}">${type}</span>
      <div class="body"><strong>${esc(d.title)}</strong><span>${esc(name)}${d.pages > 1 ? ` · ${d.pages} ${esc(tr("pages"))}` : ""} · ${dateOf(d.updated_at)}${d.visibility === "internal" ? ` · ${esc(tr("internal"))}` : ""}</span></div>
      <div class="trail">
        <button class="pill-btn compact" data-ask="${esc(askText)}" aria-label="${esc(tr("askAbout"))}">${icon("sparkle")}<span>${esc(tr("askAbout"))}</span></button>
        <a class="icon-btn" href="${esc(snapshot ? d.source_url : d.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(tr("open"))}">${icon("external")}</a>
      </div></div>`;
  }

  async function renderKnowledge() {
    const view = $("#view-knowledge");
    if (!state.docs) view.innerHTML = `<div class="view-inner"><h1 class="page-title">${esc(tr("kbTitle"))}</h1><p class="page-sub">…</p></div>`;
    const docs = await loadDocs();
    const skills = [];
    for (const d of docs) if (!skills.some((s) => s.slug === d.skill.slug)) skills.push(d.skill);
    const query = state.docQuery.toLowerCase();
    const shown = docs.filter((d) => (state.docFilter === "all" || d.skill.slug === state.docFilter) &&
      (!query || `${d.title} ${d.description} ${d.skill.name_en} ${d.skill.name_hi}`.toLowerCase().includes(query)));
    view.innerHTML = `<div class="view-inner">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div><h1 class="page-title">${esc(tr("kbTitle"))}</h1><p class="page-sub">${esc(tr("kbSub"))}</p></div>
        ${isStaff() ? `<button class="btn btn-sm btn-primary" data-action="upload">${icon("upload", "ic-sm")}${esc(tr("upload"))}</button>` : ""}
      </div>
      <div class="search-box">${icon("search")}<input class="input" id="docSearch" type="search" placeholder="${esc(tr("searchDocs"))}" value="${esc(state.docQuery)}"></div>
      <div class="chip-row"><button class="chip ${state.docFilter === "all" ? "active" : ""}" data-filter="all">${esc(tr("all"))} · ${docs.length}</button>
        ${skills.map((s) => `<button class="chip ${state.docFilter === s.slug ? "active" : ""}" data-filter="${esc(s.slug)}">${esc(uiLang() === "hi" && s.name_hi ? s.name_hi : s.name_en)}</button>`).join("")}</div>
      ${shown.length ? `<div class="list">${shown.map(docListItem).join("")}</div>` : `<div class="empty-state"><div class="icon-tile t-green">${icon("book", "ic-lg")}</div><h3>${esc(tr("noDocs"))}</h3></div>`}
    </div>`;
    const search = $("#docSearch", view);
    search.addEventListener("input", () => { state.docQuery = search.value; renderKnowledge().then(() => { const s = $("#docSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); });
    $$("[data-filter]", view).forEach((b) => b.addEventListener("click", () => { state.docFilter = b.dataset.filter; renderKnowledge(); }));
  }

  async function renderProjects() {
    const view = $("#view-projects");
    const docs = (await loadDocs()).filter((d) => d.skill.slug === "projects-kanker");
    const prompts = I18N[uiLang()].projPrompts;
    view.innerHTML = `<div class="view-inner">
      <h1 class="page-title">${esc(tr("projTitle"))}</h1><p class="page-sub">${esc(tr("projSub"))}</p>
      ${docs.length ? `
        <div class="card" style="margin-bottom:14px"><div class="chip-row" style="flex-wrap:wrap;margin:0">${prompts.map((q) => `<button class="chip" data-ask="${esc(q)}">${icon("chart", "ic-sm")} ${esc(q)}</button>`).join("")}</div></div>
        <div class="list">${docs.map(docListItem).join("")}</div>
        <div style="margin-top:14px"><button class="btn" data-action="uploadWorks">${icon("upload", "ic-sm")}${esc(tr("uploadWorks"))}</button></div>`
      : `<div class="card empty-state"><div class="icon-tile t-orange">${icon("briefcase", "ic-lg")}</div><h3>${esc(tr("projEmptyTitle"))}</h3><p>${esc(tr("projEmptyText"))}</p>
          <button class="btn btn-primary" data-action="uploadWorks">${icon("upload", "ic-sm")}${esc(tr("uploadWorks"))}</button></div>`}
    </div>`;
  }

  // ------------------------------------------------------------------ reports

  function renderReports() {
    const view = $("#view-reports");
    view.innerHTML = `<div class="view-inner"><h1 class="page-title">${esc(tr("reportsTitle"))}</h1><p class="page-sub">${esc(tr("reportsSub"))}</p>
      ${state.reports.length ? `<div class="list">${state.reports.map((r) => `
        <div class="list-item clickable" data-report="${r.id}"><span class="icon-tile t-purple">${icon("report")}</span>
          <div class="body"><strong>${esc(r.title)}</strong><span>${dateOf(r.ts)} · ${(r.data.citations || []).length} ${esc(tr("sources").toLowerCase())}</span></div>
          <div class="trail"><button class="icon-btn" data-report-pdf="${r.id}" aria-label="PDF">${icon("pdf")}</button><button class="icon-btn" data-report-del="${r.id}" aria-label="${esc(tr("deleteConv"))}">${icon("trash")}</button></div>
        </div>`).join("")}</div>`
      : `<div class="card empty-state"><div class="icon-tile t-purple">${icon("report", "ic-lg")}</div><h3>${esc(tr("noReports"))}</h3><p>${esc(tr("noReportsText"))}</p></div>`}
    </div>`;
    const find = (id) => state.reports.find((r) => r.id === id);
    view.onclick = (event) => {
      const del = event.target.closest("[data-report-del]");
      if (del) { state.reports = state.reports.filter((r) => r.id !== del.dataset.reportDel); store.set("dmft.reports", state.reports); renderReports(); return; }
      const pdf = event.target.closest("[data-report-pdf]");
      const item = pdf ? find(pdf.dataset.reportPdf) : find(event.target.closest("[data-report]")?.dataset.report);
      if (item) openReport([{ role: "bot", data: item.data, ts: item.ts, question: item.question }], Boolean(pdf), item.title);
    };
  }

  // ------------------------------------------------------------------ profile / more

  function segmented(name, value, options) {
    return `<div class="segmented" role="group" data-setting="${name}">${options.map(([v, label]) => `<button type="button" data-value="${v}" aria-pressed="${v === value}">${esc(label)}</button>`).join("")}</div>`;
  }

  function renderProfile() {
    const view = $("#view-profile");
    const account = isStaff()
      ? `<div class="profile-card"><div class="avatar-initials">${esc(initials(state.user.username))}</div><div style="flex:1;min-width:0"><strong>${esc(displayName())}</strong><span>${esc(state.user.role === "admin" ? tr("roleAdmin") : tr("roleEditor"))}</span></div></div>
         <div class="settings-group">
           <a class="setting link" href="/admin" target="_blank" rel="noopener"><span class="icon-tile t-blue">${icon("shield")}</span><div class="body"><strong>${esc(tr("adminPanel"))}</strong><span>${esc(tr("adminPanelSub"))}</span></div>${icon("external", "ic-sm")}</a>
           <button class="setting link" data-action="upload"><span class="icon-tile t-green">${icon("upload")}</span><div class="body"><strong>${esc(tr("uploadDoc"))}</strong><span>${esc(tr("uploadSub"))}</span></div>${icon("chevron-right", "ic-sm")}</button>
           <button class="setting link" data-action="logout"><span class="icon-tile t-rose">${icon("logout")}</span><div class="body"><strong>${esc(tr("signOut"))}</strong></div></button>
         </div>`
      : `<form class="card" id="loginForm" style="margin-bottom:14px">
           <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px"><span class="icon-tile t-blue">${icon("shield")}</span><div><strong style="display:block">${esc(tr("staffSignIn"))}</strong><span style="font-size:12.5px;color:var(--text-3)">${esc(tr("staffSignInSub"))}</span></div></div>
           <div class="grid-2"><div class="field"><label for="lu">${esc(tr("username"))}</label><input class="input" id="lu" autocomplete="username" required></div>
           <div class="field"><label for="lp">${esc(tr("password"))}</label><input class="input" id="lp" type="password" autocomplete="current-password" required></div></div>
           <p class="form-error" id="loginError" role="alert"></p>
           <button class="btn btn-primary" type="submit" style="width:100%">${esc(tr("signIn"))}</button>
         </form>`;
    view.innerHTML = `<div class="view-inner">
      <h1 class="page-title">${esc(isStaff() ? tr("more") : tr("profile"))}</h1><p class="page-sub">${esc(tr("brand"))} · ${esc(tr("aiAssistant"))}</p>
      ${account}
      <div class="group-label">${esc(tr("settings"))}</div>
      <div class="settings-group">
        <div class="setting" style="flex-wrap:wrap"><span class="icon-tile t-blue">${icon("globe")}</span><div class="body"><strong>${esc(tr("answerLang"))}</strong><span>${esc(tr("answerLangSub"))}</span></div>${segmented("lang", state.langPref, [["auto", tr("auto")], ["en", "English"], ["hi", "हिन्दी"]])}</div>
        <div class="setting" style="flex-wrap:wrap"><span class="icon-tile t-purple">${icon("sun")}</span><div class="body"><strong>${esc(tr("theme"))}</strong></div>${segmented("theme", state.theme, [["system", tr("system")], ["light", tr("light")], ["dark", tr("dark")]])}</div>
        <div class="setting" style="flex-wrap:wrap"><span class="icon-tile t-teal">${icon("text")}</span><div class="body"><strong>${esc(tr("textSize"))}</strong></div>${segmented("text", state.textSize, [["normal", tr("normal")], ["large", tr("large")]])}</div>
        <button class="setting link" data-action="clearHistory"><span class="icon-tile t-rose">${icon("trash")}</span><div class="body"><strong>${esc(tr("clearHistory"))}</strong><span>${esc(tr("clearHistorySub"))}</span></div></button>
      </div>
      <div class="group-label">${esc(tr("about"))}</div>
      <div class="card" style="font-size:14px;color:var(--text-2)">${esc(tr("aboutText"))}</div>
    </div>`;
    $$("[data-setting]", view).forEach((group) => group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (!button) return;
      const value = button.dataset.value;
      if (group.dataset.setting === "lang") return setLangPref(value);
      if (group.dataset.setting === "theme") { state.theme = value; store.set("dmft.theme", value); }
      if (group.dataset.setting === "text") { state.textSize = value; store.set("dmft.textSize", value); }
      applyPreferences(); renderProfile();
    }));
    const form = $("#loginForm", view);
    if (form) form.addEventListener("submit", async (event) => {
      event.preventDefault();
      $("#loginError").textContent = "";
      try {
        state.user = await api("POST", "/api/admin/login", { username: $("#lu").value.trim(), password: $("#lp").value });
        await enterMode();
        toast(tr("signedIn"));
        go("home");
      } catch (err) { $("#loginError").textContent = err.message; }
    });
  }

  // ------------------------------------------------------------------ attach menu, voice, upload

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startVoice(lang) {
    if (!SpeechRecognition) { toast(tr("voiceUnsupported")); return; }
    if (state.recognition) { state.recognition.stop(); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    const base = input.value ? input.value.trimEnd() + " " : "";
    recognition.onresult = (event) => {
      input.value = base + [...event.results].map((r) => r[0].transcript).join("");
      autosize(); updateComposer();
    };
    recognition.onend = () => { state.recognition = null; $("#micBtn").classList.remove("listening"); input.focus(); };
    recognition.onerror = () => recognition.stop();
    state.recognition = recognition;
    $("#micBtn").classList.add("listening");
    toast(tr("listening"));
    recognition.start();
  }

  function attachMenu() {
    const options = [
      ...(SpeechRecognition ? [
        { icon: "mic", tone: "t-rose", title: tr("voiceHi"), sub: tr("voiceSub"), run: () => startVoice("hi-IN") },
        { icon: "mic", tone: "t-blue", title: tr("voiceEn"), sub: tr("voiceSub"), run: () => startVoice("en-IN") },
      ] : []),
      { icon: "clipboard", tone: "t-green", title: tr("pasteText"), sub: tr("pasteSub"), run: pasteFromClipboard },
      ...(isStaff() ? [{ icon: "upload", tone: "t-purple", title: tr("uploadDoc"), sub: tr("uploadSub"), run: () => openUpload() }] : []),
    ];
    const list = document.createElement("div");
    list.className = "option-list";
    list.innerHTML = options.map((o, i) => `<button class="option" data-o="${i}"><span class="icon-tile ${o.tone}">${icon(o.icon)}</span><span class="body"><strong>${esc(o.title)}</strong><span>${esc(o.sub)}</span></span></button>`).join("");
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-o]");
      if (!button) return;
      closeSheet();
      options[Number(button.dataset.o)].run();
    });
    openSheet(tr("attachTitle"), list);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) { input.value = (input.value ? input.value + "\n" : "") + text.slice(0, state.meta.max_message_chars); autosize(); updateComposer(); }
    } catch { /* permission denied: user can paste manually */ }
    input.focus();
  }

  async function openUpload(skillSlug = "") {
    let skills = [];
    try { skills = await api("GET", "/api/admin/skills"); } catch (err) { toast(err.message); return; }
    const preset = skills.find((s) => s.slug === skillSlug) || skills[0];
    const form = document.createElement("form");
    form.innerHTML = `
      <div class="field"><label>${esc(tr("chooseFiles"))}</label><input class="input" type="file" name="files" multiple required accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.html,.htm,.png,.jpg,.jpeg"></div>
      <div class="grid-2">
        <div class="field"><label>${esc(tr("skill"))}</label><select class="input" name="skill_id">${skills.map((s) => `<option value="${s.id}" ${s.id === preset?.id ? "selected" : ""}>${esc(uiLang() === "hi" && s.name_hi ? s.name_hi : s.name_en)}</option>`).join("")}</select></div>
        <div class="field"><label>${esc(tr("visibility"))}</label><select class="input" name="visibility"><option value="public">${esc(tr("public_"))}</option><option value="internal">${esc(tr("internal_"))}</option></select></div>
      </div>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary" type="submit" style="width:100%">${icon("upload", "ic-sm")}${esc(tr("upload"))}</button>`;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const files = [...form.files.files];
      const button = $("button[type=submit]", form);
      button.disabled = true; button.textContent = tr("uploading");
      let ok = 0;
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        body.append("skill_id", form.skill_id.value);
        body.append("visibility", form.visibility.value);
        try { await api("POST", "/api/admin/documents", body, { form: true }); ok++; }
        catch (err) { $(".form-error", form).textContent = `${file.name}: ${err.message}`; }
      }
      if (ok) { toast(`${ok} ${tr("uploaded")}`); state.docs = null; closeSheet(); if (["knowledge", "projects"].includes(state.view)) renderAll(); }
      else { button.disabled = false; button.textContent = tr("upload"); }
    });
    openSheet(tr("uploadTitle"), form);
  }

  function notifications() {
    const s = state.stats || {};
    const items = [
      [s.review_pending, tr("nReview"), "/admin#review", "t-orange", "alert"],
      [s.grievances_open, tr("nGrievances"), "/admin#grievances", "t-rose", "users"],
      [s.documents_failed, tr("nFailed"), "/admin#documents", "t-purple", "doc"],
    ].filter(([n]) => n > 0);
    openSheet(tr("notifications"), items.length
      ? `<div class="option-list">${items.map(([n, label, href, tone, ic]) => `<a class="option" href="${href}" target="_blank" rel="noopener"><span class="icon-tile ${tone}">${icon(ic)}</span><span class="body"><strong>${n} ${esc(label)}</strong><span>${esc(tr("adminPanel"))}</span></span>${icon("external", "ic-sm")}</a>`).join("")}</div>`
      : `<div class="empty-state"><div class="icon-tile t-green">${icon("check", "ic-lg")}</div><h3>${esc(tr("noNotifications"))}</h3></div>`);
  }

  // ------------------------------------------------------------------ actions registry

  const ACTIONS = {
    back: () => (history.length > 1 ? history.back() : go("home")),
    language: (el) => languageMenu(el),
    newChat,
    notifications,
    upload: () => openUpload(),
    uploadWorks: () => (isStaff() ? openUpload("projects-kanker") : go("profile")),
    adminDocs: () => window.open("/admin#documents", "_blank", "noopener"),
    adminHome: () => window.open("/admin", "_blank", "noopener"),
    generateReport: () => { newChat(); input.value = tr("generateReportPrompt"); autosize(); updateComposer(); input.focus(); },
    minutes: () => { newChat(); send(tr("minutesPrompt")); },
    logout: async () => {
      await api("POST", "/api/admin/logout").catch(() => {});
      try { localStorage.setItem("dmft.admin.logout", String(Date.now())); } catch { /* storage blocked */ }  // closes open admin tabs
      state.user = null;
      await enterMode();
      toast(tr("signedOut"));
      go("home");
    },
    clearHistory: () => {
      if (!window.confirm(tr("confirmClear"))) return;
      state.conversations = []; state.current = null;
      saveConversations(); renderAll();
    },
    chatMenu: (el) => openMenu(el, [
      { label: tr("newChat"), icon: "plus", onClick: newChat },
      ...(state.current?.messages.length ? [
        { label: tr("exportConversation"), icon: "pdf", onClick: () => openReport(state.current.messages.filter((m) => m.role === "bot" && m.data.route !== "error").map((m) => ({ ...m, question: questionFor(m) })), false, state.current.title) },
        { label: tr("clearConversation"), icon: "trash", onClick: () => { state.conversations = state.conversations.filter((c) => c.id !== state.current.id); state.current = null; saveConversations(); renderAll(); } },
      ] : []),
      "-",
      { label: `${tr("language")}: ${tr("auto")}`, icon: "globe", checked: state.langPref === "auto", onClick: () => setLangPref("auto") },
      { label: "English", checked: state.langPref === "en", onClick: () => setLangPref("en") },
      { label: "हिन्दी", checked: state.langPref === "hi", onClick: () => setLangPref("hi") },
      "-",
      { label: tr("history"), icon: "history", onClick: () => go("history") },
      { label: tr("knowledge"), icon: "book", onClick: () => go("knowledge") },
    ]),
  };

  $("#sideNewChat").addEventListener("click", newChat);
  $("#attachBtn").addEventListener("click", attachMenu);
  $("#micBtn").addEventListener("click", () => startVoice(uiLang() === "en" && state.langPref === "en" ? "en-IN" : "hi-IN"));

  // ------------------------------------------------------------------ composer

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  }
  function updateComposer() {
    const limit = state.meta.max_message_chars || 2000;
    const length = input.value.length;
    const counter = $("#charCount");
    counter.hidden = length < limit * 0.8;
    counter.textContent = `${length} / ${limit}`;
    counter.classList.toggle("over", length > limit);
    $("#sendButton").disabled = state.busy || !input.value.trim() || length > limit;
    input.lang = hasHindi(input.value) ? "hi" : "";
  }
  input.addEventListener("input", () => { autosize(); updateComposer(); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
      event.preventDefault();
      send(input.value);
    }
  });
  $("#composer").addEventListener("submit", (event) => { event.preventDefault(); send(input.value); });

  function renderComposerText() {
    input.placeholder = tr("placeholder");
    $("#inputLabel").textContent = tr("inputLabel");
    $("#disclaimer").textContent = tr("disclaimer");
    $("#attachBtn").setAttribute("aria-label", tr("attach"));
    $("#sendButton").setAttribute("aria-label", tr("send"));
    $("#micBtn").setAttribute("aria-label", tr("voice"));
    $("#micBtn").hidden = !SpeechRecognition;
  }

  // ------------------------------------------------------------------ render all & boot

  function renderAll() {
    renderAppbar();
    renderNav();
    renderComposerText();
    const renderers = { home: renderHome, chat: renderChat, history: renderHistory, knowledge: renderKnowledge, projects: renderProjects, reports: renderReports, profile: renderProfile };
    renderers[state.view]?.();
  }

  async function refreshStats() {
    if (!isStaff()) { state.stats = null; return; }
    try { state.stats = await api("GET", "/api/admin/stats"); } catch { state.stats = null; }
  }

  async function refreshHealth() {
    try { state.llm = (await api("GET", "/healthz")).llm; } catch { state.llm = null; }
    if (["chat", "home"].includes(state.view)) renderAppbar();
  }

  async function enterMode() {
    state.mode = state.user ? "enterprise" : "standard";
    $("#app").dataset.mode = state.mode;
    state.docs = null;
    await refreshStats();
  }

  function updateOnline() {
    const banner = $("#offlineBanner");
    banner.hidden = navigator.onLine;
    banner.textContent = tr("offline");
  }
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);

  async function boot() {
    applyPreferences();
    try { state.user = await api("GET", "/api/admin/me"); } catch { state.user = null; }
    await enterMode();
    try { state.meta = await api("GET", "/api/meta"); input.maxLength = state.meta.max_message_chars; } catch { /* defaults */ }
    show(location.hash.replace(/^#\//, "") || "home");
    updateComposer();
    updateOnline();
    refreshHealth();
    setInterval(refreshHealth, 60000);
    setInterval(async () => { if (isStaff()) { await refreshStats(); renderAppbar(); renderNav(); } }, 120000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  boot();
})();
