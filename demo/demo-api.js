// DMFT Sahayak static demo: answers the chat app's /api/* calls inside the browser, so the unchanged app
// (static/index.html + app.js) runs on GitHub Pages with no server. Loaded before app.js by demo/assemble.py.
//
// - Knowledge: demo/kb/kb.json, a snapshot of the public knowledge base (`python cli.py export-demo`).
// - Search: engine.js (hybrid BM25 + multilingual-e5-small in the browser, same flow as the server).
// - Answers: extractive by default; Gemini if the viewer saves their own API key in Profile.
(() => {
  "use strict";

  const DEMO_BASE = new URL(".", document.currentScript.src);
  const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js";
  const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  const SETTINGS_KEY = "dmft.demo.gemini";
  const HISTORY_KEY = "dmft.demo.history";
  const LOCAL_KEY = "dmft.demo.records";
  const FIRST_ANSWER_WAIT_MS = 25000;
  const realFetch = window.fetch.bind(window);

  const status = { kb: "loading", model: "idle", progress: 0, error: "" };
  const listeners = new Set();
  let notifyTimer = null;
  function notify() {
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      listeners.forEach((fn) => { try { fn(); } catch { /* listener errors must not break the demo */ } });
    }, 250);
  }

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } },
  };
  const settings = () => store.get(SETTINGS_KEY, {});

  // ------------------------------------------------------------ knowledge base + model

  let engine = null;
  let kb = null;
  let embed = null;
  let modelPromise = null;

  const kbReady = (async () => {
    engine = await import(new URL("engine.js", DEMO_BASE).href);
    const response = await realFetch(new URL("kb/kb.json", DEMO_BASE));
    if (!response.ok) throw new Error(`Knowledge base not found (${response.status})`);
    kb = engine.createKB(await response.json());
    status.kb = "ready";
    notify();
    loadModel();
    return kb;
  })().catch((err) => {
    status.kb = "failed";
    status.error = String(err?.message || err);
    notify();
    throw err;
  });

  function loadModel() {
    if (modelPromise) return modelPromise;
    status.model = "loading";
    notify();
    const files = new Map();
    modelPromise = (async () => {
      const transformers = await import(TRANSFORMERS_URL);
      transformers.env.allowLocalModels = false;
      embed = await engine.createEmbedder(transformers, {
        progress: (p) => {
          if (p.status !== "progress" || !p.total) return;
          files.set(p.file, [p.loaded, p.total]);
          let loaded = 0;
          let total = 0;
          for (const [l, t] of files.values()) { loaded += l; total += t; }
          status.progress = Math.min(99, Math.round((100 * loaded) / total));
          notify();
        },
      });
      status.model = "ready";
      status.progress = 100;
      notify();
      return embed;
    })().catch((err) => {
      console.warn("DMFT demo: search model unavailable, using keyword search", err);
      status.model = "failed";
      status.error = String(err?.message || err);
      notify();
      return null;
    });
    return modelPromise;
  }

  // ------------------------------------------------------------ Gemini (viewer's own key)

  let llmPausedUntil = 0;
  const hasLlm = () => Boolean(settings().key) && Date.now() >= llmPausedUntil;

  async function gemini(prompt) {
    const { key, model } = settings();
    const name = (model || kb.gemini_model).trim();
    const response = await realFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Rate limit or outage: answer from documents for a while instead of failing every question.
      llmPausedUntil = Date.now() + (response.status === 429 ? 60000 : 10000);
      throw new Error(data?.error?.message || `Gemini error ${response.status}`);
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("Empty response from Gemini");
    return text;
  }

  // ------------------------------------------------------------ API handlers

  const histories = new Map(Object.entries(store.get(HISTORY_KEY, {})));
  const saveHistories = () => {
    const recent = [...histories.entries()].slice(-30);
    store.set(HISTORY_KEY, Object.fromEntries(recent));
  };
  let logSeq = Date.now();

  const LLM_NOTE = {
    en: "\n\n_The AI service did not respond, so this answer shows the relevant lines from the documents._",
    hi: "\n\n_AI सेवा ने उत्तर नहीं दिया, इसलिए यह उत्तर दस्तावेज़ों की प्रासंगिक पंक्तियाँ दिखाता है।_",
    cg: "\n\n_AI सेवा ले जवाब नइ आइस, एकरे सेती ए जवाब म दस्तावेज़ के काम के लाइन दिखत हे।_",
  };

  async function chat(body) {
    await kbReady;
    if (!embed && status.model === "loading") {
      await Promise.race([modelPromise, new Promise((resolve) => setTimeout(resolve, FIRST_ANSWER_WAIT_MS))]);
    }
    const sessionId = String(body.session_id || "default");
    const history = histories.get(sessionId) || [];
    const result = await engine.answer(kb, {
      message: String(body.message || ""),
      langPref: body.lang || "auto",
      history: history.slice(-engine.CONFIG.historyTurns),
      embed,
      llm: hasLlm() ? gemini : null,
    });
    if (result.llm_error) result.answer += LLM_NOTE[result.lang] || LLM_NOTE.en;
    if (engine.HISTORY_ROUTES.has(result.route)) {
      histories.set(sessionId, [...history, { q: result.standalone, a: result.answer }].slice(-6));
      saveHistories();
    }
    delete result.standalone;
    delete result.llm_error;
    result.log_id = ++logSeq;
    return result;
  }

  function saveLocal(kind, record) {
    const records = store.get(LOCAL_KEY, { feedback: [], grievances: [] });
    (records[kind] = records[kind] || []).push({ ...record, at: new Date().toISOString() });
    records[kind] = records[kind].slice(-200);
    store.set(LOCAL_KEY, records);
  }

  function grievance(body) {
    const L = kb.langTools;
    const digits = String(body.mobile || "").replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (String(body.name || "").trim().length < 2) return [422, { detail: [{ msg: "Please enter your name" }] }];
    if (!/^[6-9]\d{9}$/.test(digits)) return [422, { detail: [{ msg: "Enter a valid 10-digit mobile number" }] }];
    if (String(body.description || "").trim().length < 10) return [422, { detail: [{ msg: "Please describe the grievance (at least 10 characters)" }] }];
    const lang = L.answerLanguage(L.detectLanguage(body.description), body.lang);
    const now = new Date();
    const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const ticket = `DEMO-KNK-${stamp}-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    saveLocal("grievances", { ticket, name: body.name, block: body.block, village: body.village, description: body.description });
    return [200, { ticket, message: L.t("grievance_created", lang, { ticket }) + L.t("grievance_demo", lang) }];
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load the Excel library"));
      document.head.appendChild(script);
    });
  }

  async function exportXlsx(body) {
    if (!window.XLSX) await loadScript(XLSX_URL);
    const X = window.XLSX;
    const plain = (text) => String(text || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\*\*|__|`/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const cell = (value) => {
      const text = String(value ?? "").trim();
      return /^-?[\d,]+(\.\d+)?$/.test(text) && /\d/.test(text) ? Number(text.replace(/,/g, "")) : text;
    };
    const workbook = X.utils.book_new();
    const summary = [
      ["DMFT Sahayak report (demo)"], [],
      ["Title", body.title || ""], ["Question", body.question || ""], ["Answer", plain(body.answer)], [],
      ["Sources"], ...(body.sources || []).map((s) => [s]),
    ];
    const summarySheet = X.utils.aoa_to_sheet(summary);
    summarySheet["!cols"] = [{ wch: 14 }, { wch: 100 }];
    X.utils.book_append_sheet(workbook, summarySheet, "Summary");
    const used = new Set(["Summary"]);
    (body.tables || []).forEach((table, i) => {
      const rows = [table.headers, ...table.rows.map((row) => row.map(cell))];
      const sheet = X.utils.aoa_to_sheet(rows);
      sheet["!cols"] = table.headers.map((_, c) => ({
        wch: Math.min(60, Math.max(10, ...rows.map((r) => String(r[c] ?? "").length + 2))),
      }));
      let name = (table.title || `Table ${i + 1}`).replace(/[[\]:*?/\\]/g, " ").slice(0, 28).trim() || `Table ${i + 1}`;
      while (used.has(name)) name = `${name.slice(0, 25)} ${i + 1}`;
      used.add(name);
      X.utils.book_append_sheet(workbook, sheet, name);
    });
    const data = X.write(workbook, { bookType: "xlsx", type: "array" });
    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new Response(new Blob([data], { type: mime }), { status: 200, headers: { "Content-Type": mime } });
  }

  const json = (data, code = 200) =>
    new Response(JSON.stringify(data), { status: code, headers: { "Content-Type": "application/json" } });

  async function handle(method, path, body) {
    if (path === "/api/admin/login") {
      return json({ detail: "Staff sign-in is available on the DMFT office server. / स्टाफ़ लॉगिन DMFT कार्यालय के सर्वर पर उपलब्ध है।" }, 403);
    }
    if (path === "/api/admin/logout") return json({ ok: true });
    if (path.startsWith("/api/admin/")) return json({ detail: "Not signed in" }, 401);
    if (path === "/healthz") {
      await kbReady.catch(() => {});
      return json({
        status: "ok", demo: true, kb_version: kb?.kb_version ?? null,
        llm: {
          configured: Boolean(settings().key),
          model: settings().model || kb?.gemini_model || "",
          cooling_down_seconds: Math.max(0, Math.round((llmPausedUntil - Date.now()) / 1000)),
          last_error: "",
        },
      });
    }
    await kbReady;
    if (path === "/api/meta") {
      return json({
        blocks: kb.blocks || [], max_message_chars: kb.max_message_chars, staff: null,
        skills: kb.skills.map((s) => ({ slug: s.slug, name_en: s.name_en, name_hi: s.name_hi })),
      });
    }
    if (path === "/api/documents" && method === "GET") return json(engine.catalogue(kb));
    if (path === "/api/chat" && method === "POST") return json(await chat(body || {}));
    if (path === "/api/feedback" && method === "POST") {
      saveLocal("feedback", { log_id: body?.log_id, value: body?.value, comment: body?.comment || "" });
      return json({ ok: true });
    }
    if (path === "/api/grievance" && method === "POST") {
      const [code, data] = grievance(body || {});
      return json(data, code);
    }
    if (path === "/api/export/xlsx" && method === "POST") return exportXlsx(body || {});
    return json({ detail: "Not available in the demo" }, 404);
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!(url.startsWith("/api/") || url === "/healthz")) return realFetch(input, init);
    const method = String(init.method || "GET").toUpperCase();
    let body = null;
    if (typeof init.body === "string") { try { body = JSON.parse(init.body); } catch { body = null; } }
    try {
      return await handle(method, url.split(/[?#]/)[0], body);
    } catch (err) {
      console.error("DMFT demo:", err);
      return json({ detail: String(err?.message || err) }, 500);
    }
  };

  // ------------------------------------------------------------ hooks used by app.js (window.DMFTDemo)

  const TEXT = {
    en: {
      loading: "Demo · loading…", model: (p) => `Demo · search model ${p}%`, ai: "Demo · AI answers",
      docs: "Demo · document answers", keyword: "Demo · keyword search",
      keyLabel: "AI answers (Gemini key)", keyOff: "Optional. Without a key, answers quote the documents.",
      keyOn: "On. The key is saved in this browser.", add: "Add key", change: "Change",
      keyPlaceholder: "Paste a Gemini API key", modelName: "Gemini model",
      save: "Save", remove: "Remove key", saved: "Gemini key saved in this browser", removed: "Gemini key removed",
      keyHint: "Stored only in this browser and sent only to Google. Use a key restricted to the Generative Language API.",
    },
    hi: {
      loading: "डेमो · लोड हो रहा है…", model: (p) => `डेमो · सर्च मॉडल ${p}%`, ai: "डेमो · AI उत्तर",
      docs: "डेमो · दस्तावेज़ उत्तर", keyword: "डेमो · कीवर्ड खोज",
      keyLabel: "AI उत्तर (Gemini कुंजी)", keyOff: "वैकल्पिक। कुंजी के बिना उत्तर दस्तावेज़ों के अंश दिखाते हैं।",
      keyOn: "चालू। कुंजी इस ब्राउज़र में सहेजी गई है।", add: "कुंजी जोड़ें", change: "बदलें",
      keyPlaceholder: "Gemini API कुंजी पेस्ट करें", modelName: "Gemini मॉडल",
      save: "सहेजें", remove: "कुंजी हटाएँ", saved: "Gemini कुंजी इस ब्राउज़र में सहेजी गई", removed: "Gemini कुंजी हटाई गई",
      keyHint: "कुंजी केवल इस ब्राउज़र में रहती है और केवल Google को भेजी जाती है।",
    },
  };
  const text = (lang) => TEXT[lang === "en" ? "en" : "hi"]; // Chhattisgarhi UI: Hindi settings text

  window.DMFTDemo = {
    onChange(fn) { listeners.add(fn); },
    isLimited: () => !hasLlm(),
    statusLabel(lang) {
      const t = text(lang);
      if (status.kb !== "ready") return t.loading;
      if (status.model === "loading") return t.model(status.progress);
      if (hasLlm()) return t.ai;
      return status.model === "failed" ? t.keyword : t.docs;
    },
    // One collapsed row in Profile → Settings; the rest of Profile (staff sign-in included) is the normal app.
    settingsHTML({ lang, esc, icon }) {
      const t = text(lang);
      const s = settings();
      return `<div class="setting" style="flex-wrap:wrap">
        <span class="icon-tile t-orange">${icon("sparkle")}</span>
        <div class="body"><strong>${esc(t.keyLabel)}</strong><span>${esc(s.key ? t.keyOn : t.keyOff)}</span></div>
        <button class="btn btn-sm" type="button" id="demoKeyToggle" aria-expanded="false" aria-controls="demoKeyForm">${esc(s.key ? t.change : t.add)}</button>
        <form id="demoKeyForm" autocomplete="off" hidden style="flex-basis:100%;margin-top:6px">
          <div class="grid-2">
            <div class="field"><label for="demoKey">${esc(t.keyLabel)}</label>
              <input class="input" id="demoKey" type="password" placeholder="${esc(t.keyPlaceholder)}" spellcheck="false"></div>
            <div class="field"><label for="demoModel">${esc(t.modelName)}</label>
              <input class="input" id="demoModel" value="${esc(s.model || kb?.gemini_model || "")}" spellcheck="false"></div>
          </div>
          <p style="font-size:12.5px;color:var(--text-3);margin:0 0 10px">${esc(t.keyHint)}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" type="submit">${esc(t.save)}</button>
            ${s.key ? `<button class="btn btn-sm" type="button" id="demoRemove">${esc(t.remove)}</button>` : ""}
          </div>
        </form>
      </div>`;
    },
    bindSettings(root, { lang, toast, rerender }) {
      const t = text(lang);
      const form = root.querySelector("#demoKeyForm");
      if (!form) return;
      root.querySelector("#demoKeyToggle").addEventListener("click", (event) => {
        form.hidden = !form.hidden;
        event.currentTarget.setAttribute("aria-expanded", String(!form.hidden));
        if (!form.hidden) root.querySelector("#demoKey").focus();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const key = root.querySelector("#demoKey").value.trim();
        const model = root.querySelector("#demoModel").value.trim();
        const current = settings();
        store.set(SETTINGS_KEY, { key: key || current.key || "", model });
        llmPausedUntil = 0;
        toast(t.saved);
        rerender();
      });
      root.querySelector("#demoRemove")?.addEventListener("click", () => {
        store.set(SETTINGS_KEY, { model: settings().model || "" });
        toast(t.removed);
        rerender();
      });
    },
  };
})();
