(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const content = $("#content");
  let me = null;
  let skills = [];
  let pollTimer = null;

  // ------------------------------------------------------------ utilities

  const esc = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const fmtDate = (value) => {
    if (!value) return "—";
    const d = new Date(value.endsWith("Z") || value.includes("+") ? value : value + "Z");
    return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  };

  function toast(message) {
    const node = document.createElement("div");
    node.className = "toast";
    node.setAttribute("role", "status");
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }

  async function api(method, url, body, isForm = false) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      if (isForm) options.body = body;
      else { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
    }
    const response = await fetch(url, options);
    if (response.status === 401) { toLogin("expired"); throw new Error("Session expired - please sign in again"); }
    const data = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
    if (!response.ok) {
      const detail = data?.detail;
      const message = Array.isArray(detail) ? detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join("; ") : detail;
      throw new Error(message || `${response.status} ${response.statusText}`);
    }
    return data;
  }

  const skillName = (id) => skills.find((s) => s.id === id)?.name_en ?? `#${id}`;
  const skillOptions = (selected) =>
    skills.map((s) => `<option value="${s.id}" ${s.id === selected ? "selected" : ""}>${esc(s.name_en)}</option>`).join("");
  const visBadge = (v) => (v === "internal" ? '<span class="badge badge-warn">internal</span>' : '<span class="badge badge-ok">public</span>');
  const STATUS_CLASS = { indexed: "badge-ok", processing: "badge-primary", failed: "badge-danger", open: "badge-danger", in_progress: "badge-warn", resolved: "badge-ok" };
  const statusBadge = (s) => `<span class="badge ${STATUS_CLASS[s] || ""}">${esc(s.replace("_", " "))}</span>`;
  const routeBadge = (r) => {
    const cls = { rag: "badge-ok", qa: "badge-primary", cache: "badge-primary", documents: "badge-ok", refusal: "badge-warn", fallback: "badge-warn", error: "badge-danger", action: "badge-accent" }[r] || "";
    return `<span class="badge ${cls}">${esc(r)}</span>`;
  };

  // ------------------------------------------------------------ dialog

  const dialog = $("#dialog");
  let dialogSubmit = null;

  function openDialog(title, bodyHtml, onSubmit, okLabel = "Save") {
    $("#dialogTitle").textContent = title;
    $("#dialogBody").innerHTML = bodyHtml;
    $("#dialogError").textContent = "";
    $("#dialogOk").textContent = okLabel;
    dialogSubmit = onSubmit;
    dialog.showModal();
    dialog.querySelector("input, textarea, select")?.focus();
  }

  $("#dialogForm").addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "ok") return;
    event.preventDefault();
    const form = $("#dialogForm");
    if (!form.reportValidity()) return;
    const button = $("#dialogOk");
    button.disabled = true;
    try {
      await dialogSubmit(new FormData(form));
      dialog.close();
    } catch (err) {
      $("#dialogError").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });

  const confirmAction = (message) => window.confirm(message);

  // ------------------------------------------------------------ auth

  // The server only serves this page to a signed-in user (see /admin in app/main.py).
  // Sign-in lives on /admin/login; any sign-out or expiry sends every open admin tab back there.
  const LOGOUT_KEY = "dmft.admin.logout";
  let leaving = false;

  function toLogin(reason) {
    if (leaving) return;
    leaving = true;
    const next = encodeURIComponent(location.pathname + location.hash);
    location.replace(`/admin/login?reason=${reason}&next=${next}`);
  }

  $("#logout").addEventListener("click", async () => {
    $("#logout").disabled = true;
    await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    try { localStorage.setItem(LOGOUT_KEY, String(Date.now())); } catch { /* storage blocked */ }
    leaving = true;
    location.replace("/admin/login?reason=signed_out");
  });

  // Signed out in another tab.
  window.addEventListener("storage", (event) => { if (event.key === LOGOUT_KEY) toLogin("signed_out"); });
  // Returning to a tab after a while: confirm the session is still valid.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && me) api("GET", "/api/admin/me").catch(() => {});
  });
  // Back/forward cache can restore this page after sign-out; re-check instead of showing stale data.
  window.addEventListener("pageshow", (event) => { if (event.persisted) api("GET", "/api/admin/me").catch(() => {}); });

  async function startApp() {
    $("#whoami").textContent = `${me.username} (${me.role})`;
    document.querySelectorAll(".admin-only").forEach((n) => (n.hidden = me.role !== "admin"));
    await loadSkills();
    route();
  }

  async function loadSkills() { skills = await api("GET", "/api/admin/skills"); }

  // ------------------------------------------------------------ router

  const views = { dashboard, skills: skillsView, documents, sources, qa, review, logs, grievances, users };

  function route() {
    clearInterval(pollTimer);
    const [name, query] = (location.hash.slice(1) || "dashboard").split("?");
    const params = new URLSearchParams(query || "");
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === name));
    (views[name] || dashboard)(params).catch((err) => { content.innerHTML = `<div class="card form-error">${esc(err.message)}</div>`; });
    refreshCounters();
  }
  window.addEventListener("hashchange", route);

  async function refreshCounters() {
    try {
      const s = await api("GET", "/api/admin/stats");
      const set = (id, n) => { const node = $(id); node.hidden = !n; node.textContent = n; };
      set("#reviewCount", s.review_pending);
      set("#grievanceCount", s.grievances_open);
    } catch { /* ignore */ }
  }

  const head = (title, description, actions = "") =>
    `<div class="page-head"><div><h1>${title}</h1><p>${description}</p></div><div class="toolbar">${actions}</div></div>`;

  // ------------------------------------------------------------ dashboard

  async function dashboard() {
    const s = await api("GET", "/api/admin/stats");
    const tile = (label, value, attention = false) => `<div class="tile ${attention && value ? "attention" : ""}"><div class="label">${label}</div><div class="value">${value ?? 0}</div></div>`;
    const routes = Object.entries(s.routes_24h || {}).map(([r, n]) => `${routeBadge(r)} <strong>${n}</strong>`).join(" &nbsp; ") || "No conversations yet";
    content.innerHTML = `
      ${head("Dashboard", "Health of the DMFT Sahayak knowledge base and recent usage.", me.role === "admin" ? '<button class="btn" id="reindexAll">Re-index all documents</button>' : "")}
      <div class="tiles">
        ${tile("Skills", s.skills)}${tile("Documents", s.documents)}${tile("Indexed passages", s.chunks)}${tile("Curated Q&A", s.qa_pairs)}
        ${tile("Chats (24h)", s.chats_24h)}${tile("Review queue", s.review_pending, true)}${tile("Open grievances", s.grievances_open, true)}${tile("Failed documents", s.documents_failed, true)}
      </div>
      <div class="card"><h2>Answer routes, last 24 hours</h2><div>${routes}</div>
        <p class="sub" style="color:var(--text-3);font-size:13px;margin:10px 0 0">
          <strong>rag</strong> answered from documents · <strong>qa</strong> curated answer · <strong>cache</strong> repeated question ·
          <strong>refusal</strong> not in the knowledge base (appears in the review queue) · <strong>fallback</strong> AI service unavailable.
        </p>
      </div>
      <div class="card"><h2>How to train DMFT Sahayak</h2>
        <ol style="margin:0;padding-left:20px">
          <li><strong>Upload documents</strong> (PDF, Word, Excel, text, scanned images) to the right skill. They are searchable within a minute.</li>
          <li><strong>Add URL sources</strong> for official web pages and PDFs. They are re-checked every week and re-indexed when they change.</li>
          <li><strong>Work through the review queue</strong>: questions the bot could not answer or that users marked unhelpful. Write the correct answer once and it becomes a curated Q&A.</li>
          <li><strong>Create new skills</strong> for new topics (for example a new scheme). Each skill has its own documents, Q&A and answering instructions.</li>
        </ol>
      </div>
      <p style="color:var(--text-3);font-size:12px">Knowledge base version ${s.kb_version}</p>`;
    $("#reindexAll")?.addEventListener("click", async (e) => {
      if (!confirmAction("Re-extract and re-embed every document? This can take several minutes.")) return;
      e.target.disabled = true;
      e.target.textContent = "Re-indexing…";
      try { const r = await api("POST", "/api/admin/reindex-all"); toast(`Re-indexed ${r.reindexed} documents`); } catch (err) { toast(err.message); }
      dashboard();
    });
  }

  // ------------------------------------------------------------ skills

  function skillForm(s = {}) {
    return `
      <div class="grid-2">
        <div class="field"><label>Name (English)</label><input class="input" name="name_en" required value="${esc(s.name_en)}"></div>
        <div class="field"><label>Name (Hindi)</label><input class="input" name="name_hi" lang="hi" value="${esc(s.name_hi)}"></div>
      </div>
      <div class="field"><label>Slug</label><input class="input mono" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,62}" value="${esc(s.slug)}" ${s.id ? "disabled" : ""}><span class="hint">Lowercase id, e.g. <code>health-schemes</code>. Cannot be changed later.</span></div>
      <div class="field"><label>Description</label><textarea class="input" name="description" rows="3">${esc(s.description)}</textarea><span class="hint">What this skill covers. Used to route questions, so mention key topics and terms in Hindi and English.</span></div>
      <div class="field"><label>Keywords</label><input class="input" name="keywords" value="${esc((s.keywords || []).join(", "))}"><span class="hint">Comma separated, Hindi or English. A keyword match boosts this skill.</span></div>
      <div class="field"><label>Answering instructions</label><textarea class="input" name="instructions" rows="3">${esc(s.instructions)}</textarea><span class="hint">Extra rules for answers in this skill, e.g. "Always mention the sanctioned amount and block".</span></div>
      <div class="grid-2">
        <div class="field"><label>Visibility</label><select class="input" name="visibility"><option value="public">Public (citizens)</option><option value="internal" ${s.visibility === "internal" ? "selected" : ""}>Internal (staff only)</option></select></div>
        <div class="field"><label>Action</label><select class="input" name="action"><option value="">None - answer from knowledge</option><option value="grievance_form" ${s.action === "grievance_form" ? "selected" : ""}>Open grievance form on keyword match</option></select></div>
      </div>
      <label class="check"><input type="checkbox" name="enabled" ${s.enabled === false ? "" : "checked"}> Enabled</label>`;
  }

  const skillPayload = (fd) => ({
    name_en: fd.get("name_en"), name_hi: fd.get("name_hi"), description: fd.get("description"),
    keywords: String(fd.get("keywords") || "").split(",").map((k) => k.trim()).filter(Boolean),
    instructions: fd.get("instructions"), visibility: fd.get("visibility"),
    action: fd.get("action") || null, enabled: fd.get("enabled") === "on",
  });

  async function skillsView() {
    await loadSkills();
    content.innerHTML = `
      ${head("Skills", "Skill packs group documents, URL sources, curated Q&A and answering instructions for one topic. Add a skill to teach the bot a new area.", '<button class="btn btn-primary" id="newSkill">New skill</button>')}
      <div class="table-wrap"><table>
        <thead><tr><th>Skill</th><th>Visibility</th><th class="num">Docs</th><th class="num">Q&amp;A</th><th class="num">URLs</th><th>Status</th><th></th></tr></thead>
        <tbody>${skills.map((s) => `
          <tr>
            <td><strong>${esc(s.name_en)}</strong> <span lang="hi">${esc(s.name_hi)}</span><span class="sub mono">${esc(s.slug)}${s.action ? " · action: " + esc(s.action) : ""}</span><span class="sub clip">${esc(s.description)}</span></td>
            <td>${visBadge(s.visibility)}</td>
            <td class="num"><a href="#documents?skill=${s.id}">${s.document_count}</a></td>
            <td class="num"><a href="#qa?skill=${s.id}">${s.qa_count}</a></td>
            <td class="num">${s.source_count}</td>
            <td>${s.enabled ? '<span class="badge badge-ok">enabled</span>' : '<span class="badge">disabled</span>'}</td>
            <td><div class="actions">
              <button class="btn btn-sm" data-edit="${s.id}">Edit</button>
              <button class="btn btn-sm" data-reindex="${s.id}">Re-index</button>
              ${me.role === "admin" ? `<button class="btn btn-sm btn-danger" data-delete="${s.id}">Delete</button>` : ""}
            </div></td>
          </tr>`).join("")}
        </tbody></table></div>`;

    $("#newSkill").addEventListener("click", () =>
      openDialog("New skill", skillForm(), async (fd) => {
        await api("POST", "/api/admin/skills", { slug: fd.get("slug"), ...skillPayload(fd) });
        toast("Skill created");
        skillsView();
      }));
    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const s = skills.find((x) => x.id === Number(b.dataset.edit));
      openDialog(`Edit skill: ${s.name_en}`, skillForm(s), async (fd) => {
        await api("PUT", `/api/admin/skills/${s.id}`, skillPayload(fd));
        toast("Skill saved");
        skillsView();
      });
    }));
    content.querySelectorAll("[data-reindex]").forEach((b) => b.addEventListener("click", async () => {
      const r = await api("POST", `/api/admin/skills/${b.dataset.reindex}/reindex`);
      toast(`${r.queued} documents queued for re-indexing`);
    }));
    content.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      const s = skills.find((x) => x.id === Number(b.dataset.delete));
      if (!confirmAction(`Delete skill "${s.name_en}" with all its documents, sources and Q&A? This cannot be undone.`)) return;
      await api("DELETE", `/api/admin/skills/${s.id}`);
      toast("Skill deleted");
      skillsView();
    }));
  }

  // ------------------------------------------------------------ documents

  async function documents(params) {
    const skillId = Number(params.get("skill")) || null;
    const docs = await api("GET", `/api/admin/documents${skillId ? `?skill_id=${skillId}` : ""}`);
    content.innerHTML = `
      ${head("Documents", "Upload official documents. Text is extracted (with Hindi + English OCR for scanned pages), split into passages and indexed. Citizens can download public documents from chat answers.",
        `<select class="input" id="skillFilter"><option value="">All skills</option>${skillOptions(skillId)}</select>`)}
      <form class="card" id="uploadForm">
        <h2>Upload documents</h2>
        <label class="drop" id="drop"><input type="file" name="files" id="fileInput" multiple hidden accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.html,.htm,.png,.jpg,.jpeg">
          <span id="dropText"><strong>Choose files</strong> or drag them here · PDF, Word, Excel, CSV, text, images</span></label>
        <div class="upload-grid">
          <div class="field"><label>Skill</label><select class="input" name="skill_id" required>${skillOptions(skillId || skills[0]?.id)}</select></div>
          <div class="field"><label>Visibility</label><select class="input" name="visibility"><option value="public">Public - citizens can download</option><option value="internal">Internal - staff only</option></select></div>
          <div class="field"><label>Title <span class="hint">(optional, single file)</span></label><input class="input" name="title"></div>
        </div>
        <div class="field"><label>Description <span class="hint">(optional - helps the bot find this document when users ask for it)</span></label><input class="input" name="description"></div>
        <button class="btn btn-primary" type="submit" id="uploadBtn">Upload &amp; index</button>
      </form>
      <div class="table-wrap">${docs.length ? `<table>
        <thead><tr><th>Document</th><th>Skill</th><th>Visibility</th><th>Status</th><th class="num">Pages</th><th class="num">Passages</th><th>Updated</th><th></th></tr></thead>
        <tbody>${docs.map((d) => `
          <tr>
            <td><strong>${esc(d.title)}</strong><span class="sub">${esc(d.filename)}${d.source_url ? ` · <a href="${esc(d.source_url)}" target="_blank" rel="noopener">source</a>` : ""}</span>
              ${d.error ? `<span class="sub" style="color:var(--danger)">${esc(d.error)}</span>` : ""}</td>
            <td>${esc(skillName(d.skill_id))}</td>
            <td>${visBadge(d.visibility)}</td>
            <td>${statusBadge(d.status)}</td>
            <td class="num">${d.pages}${d.ocr_pages ? `<span class="sub">${d.ocr_pages} OCR</span>` : ""}</td>
            <td class="num">${d.chunk_count}</td>
            <td>${fmtDate(d.updated_at)}</td>
            <td><div class="actions">
              <a class="btn btn-sm" href="/api/documents/${d.id}/download" target="_blank" rel="noopener">Open</a>
              <button class="btn btn-sm" data-edit="${d.id}">Edit</button>
              <button class="btn btn-sm" data-reindex="${d.id}">Re-index</button>
              <button class="btn btn-sm btn-danger" data-delete="${d.id}">Delete</button>
            </div></td>
          </tr>`).join("")}</tbody></table>` : '<div class="empty">No documents yet.</div>'}</div>`;

    $("#skillFilter").addEventListener("change", (e) => { location.hash = e.target.value ? `documents?skill=${e.target.value}` : "documents"; });

    const drop = $("#drop");
    const fileInput = $("#fileInput");
    const showFiles = () => { $("#dropText").innerHTML = fileInput.files.length ? `<strong>${fileInput.files.length} file(s):</strong> ${esc([...fileInput.files].map((f) => f.name).join(", "))}` : "<strong>Choose files</strong> or drag them here"; };
    fileInput.addEventListener("change", showFiles);
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { fileInput.files = e.dataTransfer.files; showFiles(); });

    $("#uploadForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const files = [...fileInput.files];
      if (!files.length) { toast("Choose at least one file"); return; }
      const fd = new FormData(e.target);
      const button = $("#uploadBtn");
      button.disabled = true;
      let ok = 0;
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        body.append("skill_id", fd.get("skill_id"));
        body.append("visibility", fd.get("visibility"));
        body.append("title", files.length === 1 ? fd.get("title") : "");
        body.append("description", fd.get("description"));
        button.textContent = `Uploading ${file.name}…`;
        try { await api("POST", "/api/admin/documents", body, true); ok++; } catch (err) { toast(`${file.name}: ${err.message}`); }
      }
      toast(`${ok} of ${files.length} uploaded - indexing in the background`);
      documents(params);
    });

    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const d = docs.find((x) => x.id === Number(b.dataset.edit));
      openDialog("Edit document", `
        <div class="field"><label>Title</label><input class="input" name="title" required value="${esc(d.title)}"></div>
        <div class="field"><label>Description</label><textarea class="input" name="description" rows="3">${esc(d.description)}</textarea></div>
        <div class="grid-2">
          <div class="field"><label>Skill</label><select class="input" name="skill_id">${skillOptions(d.skill_id)}</select></div>
          <div class="field"><label>Visibility</label><select class="input" name="visibility"><option value="public">Public</option><option value="internal" ${d.visibility === "internal" ? "selected" : ""}>Internal</option></select></div>
        </div>`, async (fd) => {
        await api("PUT", `/api/admin/documents/${d.id}`, { title: fd.get("title"), description: fd.get("description"), skill_id: Number(fd.get("skill_id")), visibility: fd.get("visibility") });
        toast("Document saved");
        documents(params);
      });
    }));
    content.querySelectorAll("[data-reindex]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Indexing…";
      try { const d = await api("POST", `/api/admin/documents/${b.dataset.reindex}/reindex`); toast(`${d.title}: ${d.status}, ${d.chunk_count} passages`); } catch (err) { toast(err.message); }
      documents(params);
    }));
    content.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      const d = docs.find((x) => x.id === Number(b.dataset.delete));
      if (!confirmAction(`Delete "${d.title}"? The bot will no longer use it.`)) return;
      await api("DELETE", `/api/admin/documents/${d.id}`);
      toast("Document deleted");
      documents(params);
    }));

    if (docs.some((d) => d.status === "processing")) pollTimer = setInterval(() => documents(params), 4000);
  }

  // ------------------------------------------------------------ URL sources

  async function sources() {
    const rows = await api("GET", "/api/admin/sources");
    content.innerHTML = `
      ${head("URL sources", "Official web pages or PDF links (for example kanker.gov.in notices). They are fetched, indexed, and re-checked weekly; changed content is re-indexed automatically.", '<button class="btn btn-primary" id="addSource">Add URL</button>')}
      <div class="table-wrap">${rows.length ? `<table>
        <thead><tr><th>Source</th><th>Skill</th><th>Visibility</th><th>Last fetched</th><th>Auto refresh</th><th></th></tr></thead>
        <tbody>${rows.map((s) => `
          <tr>
            <td><strong>${esc(s.title || "Untitled")}</strong><span class="sub"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url)}</a></span>
              ${s.last_error ? `<span class="sub" style="color:var(--danger)">${esc(s.last_error)}</span>` : ""}</td>
            <td>${esc(skillName(s.skill_id))}</td>
            <td>${visBadge(s.visibility)}</td>
            <td>${fmtDate(s.last_fetched)}</td>
            <td>${s.refresh ? "Weekly" : "Off"}</td>
            <td><div class="actions">
              <button class="btn btn-sm" data-refresh="${s.id}">Fetch now</button>
              <button class="btn btn-sm btn-danger" data-delete="${s.id}">Remove</button>
            </div></td>
          </tr>`).join("")}</tbody></table>` : '<div class="empty">No URL sources yet.</div>'}</div>`;

    $("#addSource").addEventListener("click", () => openDialog("Add URL source", `
      <div class="field"><label>URL</label><input class="input" name="url" type="url" required placeholder="https://kanker.gov.in/..."><span class="hint">Public web page or direct PDF link. Pages that need JavaScript cannot be read; upload those documents instead.</span></div>
      <div class="field"><label>Title</label><input class="input" name="title" placeholder="Taken from the page if empty"></div>
      <div class="grid-2">
        <div class="field"><label>Skill</label><select class="input" name="skill_id">${skillOptions(skills[0]?.id)}</select></div>
        <div class="field"><label>Visibility</label><select class="input" name="visibility"><option value="public">Public</option><option value="internal">Internal</option></select></div>
      </div>
      <label class="check"><input type="checkbox" name="refresh" checked> Re-check weekly</label>`, async (fd) => {
      const s = await api("POST", "/api/admin/sources", { url: fd.get("url"), title: fd.get("title"), skill_id: Number(fd.get("skill_id")), visibility: fd.get("visibility"), refresh: fd.get("refresh") === "on" });
      toast(s.last_error ? `Added, but fetch failed: ${s.last_error}` : "Source added and indexed");
      sources();
    }, "Add & fetch"));
    content.querySelectorAll("[data-refresh]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "Fetching…";
      try { const s = await api("POST", `/api/admin/sources/${b.dataset.refresh}/refresh`); toast(s.last_error ? `Failed: ${s.last_error}` : "Fetched and indexed"); } catch (err) { toast(err.message); }
      sources();
    }));
    content.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirmAction("Remove this source and its indexed document?")) return;
      await api("DELETE", `/api/admin/sources/${b.dataset.delete}`);
      toast("Source removed");
      sources();
    }));
  }

  // ------------------------------------------------------------ Q&A

  async function qaForm(q = {}, docs = null) {
    docs = docs || (await api("GET", "/api/admin/documents"));
    return `
      <div class="field"><label>Skill</label><select class="input" name="skill_id">${skillOptions(q.skill_id ?? skills[0]?.id)}</select></div>
      <div class="grid-2">
        <div class="field"><label>Question (English)</label><textarea class="input" name="question_en" rows="2">${esc(q.question_en)}</textarea></div>
        <div class="field"><label>Question (Hindi)</label><textarea class="input" name="question_hi" rows="2" lang="hi">${esc(q.question_hi)}</textarea></div>
      </div>
      <div class="field"><label>Answer (English)</label><textarea class="input" name="answer_en" rows="5">${esc(q.answer_en)}</textarea></div>
      <div class="field"><label>Answer (Hindi)</label><textarea class="input" name="answer_hi" rows="5" lang="hi">${esc(q.answer_hi)}</textarea>
        <span class="hint">Fill at least one language for question and answer. A missing answer language is translated automatically. Markdown lists and **bold** are supported.</span></div>
      <div class="field"><label>Attach document <span class="hint">(shared with the answer)</span></label><select class="input" name="document_id"><option value="">None</option>
        ${docs.map((d) => `<option value="${d.id}" ${d.id === q.document_id ? "selected" : ""}>${esc(d.title)}</option>`).join("")}</select></div>
      <label class="check"><input type="checkbox" name="enabled" ${q.enabled === false ? "" : "checked"}> Enabled</label>`;
  }

  const qaPayload = (fd) => ({
    skill_id: Number(fd.get("skill_id")), question_en: fd.get("question_en") || "", question_hi: fd.get("question_hi") || "",
    answer_en: fd.get("answer_en") || "", answer_hi: fd.get("answer_hi") || "",
    document_id: fd.get("document_id") ? Number(fd.get("document_id")) : null, enabled: fd.get("enabled") === "on",
  });

  async function qa(params) {
    const skillId = Number(params.get("skill")) || null;
    const rows = await api("GET", `/api/admin/qa${skillId ? `?skill_id=${skillId}` : ""}`);
    content.innerHTML = `
      ${head("Curated Q&A", "Verified answers written by DMFT staff. When a question closely matches, this answer is returned directly; close matches are also given to the AI as trusted notes.",
        `<select class="input" id="skillFilter"><option value="">All skills</option>${skillOptions(skillId)}</select><button class="btn btn-primary" id="newQa">New Q&amp;A</button>`)}
      <div class="table-wrap">${rows.length ? `<table>
        <thead><tr><th>Question</th><th>Answer</th><th>Skill</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((q) => `
          <tr>
            <td><div>${esc(q.question_en)}</div><div lang="hi">${esc(q.question_hi)}</div></td>
            <td><div class="clip">${esc(q.answer_en || q.answer_hi)}</div></td>
            <td>${esc(skillName(q.skill_id))}<span class="sub">by ${esc(q.created_by)}</span></td>
            <td>${q.enabled ? '<span class="badge badge-ok">enabled</span>' : '<span class="badge">disabled</span>'}</td>
            <td><div class="actions"><button class="btn btn-sm" data-edit="${q.id}">Edit</button><button class="btn btn-sm btn-danger" data-delete="${q.id}">Delete</button></div></td>
          </tr>`).join("")}</tbody></table>` : '<div class="empty">No curated answers yet.</div>'}</div>`;

    $("#skillFilter").addEventListener("change", (e) => { location.hash = e.target.value ? `qa?skill=${e.target.value}` : "qa"; });
    $("#newQa").addEventListener("click", async () => openDialog("New curated answer", await qaForm({ skill_id: skillId ?? skills[0]?.id }), async (fd) => {
      await api("POST", "/api/admin/qa", qaPayload(fd));
      toast("Answer added - active immediately");
      qa(params);
    }));
    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async () => {
      const q = rows.find((x) => x.id === Number(b.dataset.edit));
      openDialog("Edit curated answer", await qaForm(q), async (fd) => {
        await api("PUT", `/api/admin/qa/${q.id}`, qaPayload(fd));
        toast("Answer saved");
        qa(params);
      });
    }));
    content.querySelectorAll("[data-delete]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirmAction("Delete this curated answer?")) return;
      await api("DELETE", `/api/admin/qa/${b.dataset.delete}`);
      qa(params);
    }));
  }

  // ------------------------------------------------------------ review queue

  async function review() {
    const rows = await api("GET", "/api/admin/review");
    content.innerHTML = `
      ${head("Review queue", "Questions the bot could not answer, answered with low confidence, or that users marked unhelpful. Teach the correct answer once and the bot will use it from now on.")}
      ${rows.length ? rows.map((r) => `
        <div class="review-item">
          <div class="review-meta">${routeBadge(r.route)} ${r.feedback < 0 ? '<span class="badge badge-danger">👎 unhelpful</span>' : ""}
            <span>${fmtDate(r.created_at)}</span><span>· score ${Number(r.top_score).toFixed(2)}</span><span>· ${esc(r.lang)}</span>
            ${(r.skills || []).length ? `<span>· routed: ${esc(r.skills.join(", "))}</span>` : ""}</div>
          <div class="q" ${r.lang === "hi" ? 'lang="hi"' : ""}>${esc(r.question)}</div>
          ${r.standalone_question ? `<div class="sub" style="font-size:13px;color:var(--text-3)">Interpreted as: ${esc(r.standalone_question)}</div>` : ""}
          <div class="a">${esc(r.answer)}</div>
          ${r.feedback_comment ? `<div style="font-size:13px"><strong>User comment:</strong> ${esc(r.feedback_comment)}</div>` : ""}
          <div class="actions" style="justify-content:flex-start;margin-top:6px">
            <button class="btn btn-sm btn-primary" data-teach="${r.id}">Teach answer</button>
            <button class="btn btn-sm" data-dismiss="${r.id}">Dismiss</button>
          </div>
        </div>`).join("") : '<div class="card empty">Nothing to review. 🎉</div>'}`;

    content.querySelectorAll("[data-teach]").forEach((b) => b.addEventListener("click", async () => {
      const r = rows.find((x) => x.id === Number(b.dataset.teach));
      const question = r.standalone_question || r.question;
      const isHindi = /[ऀ-ॿ]/.test(question);
      const routed = skills.find((s) => s.slug === (r.skills || [])[0]);
      const prefill = { skill_id: routed?.id ?? skills[0]?.id, question_en: isHindi ? "" : question, question_hi: isHindi ? question : "" };
      openDialog("Teach the correct answer", await qaForm(prefill), async (fd) => {
        const payload = qaPayload(fd);
        delete payload.enabled;
        await api("POST", `/api/admin/review/${r.id}/resolve`, payload);
        toast("Learned - the bot will use this answer from now on");
        review();
        refreshCounters();
      }, "Save answer");
    }));
    content.querySelectorAll("[data-dismiss]").forEach((b) => b.addEventListener("click", async () => {
      await api("POST", `/api/admin/review/${b.dataset.dismiss}/dismiss`);
      review();
      refreshCounters();
    }));
  }

  // ------------------------------------------------------------ chat logs

  async function logs(params) {
    const routeFilter = params.get("route") || "";
    const offset = Number(params.get("offset")) || 0;
    const rows = await api("GET", `/api/admin/logs?limit=50&offset=${offset}${routeFilter ? `&route=${routeFilter}` : ""}`);
    const routes = ["", "rag", "qa", "cache", "documents", "refusal", "fallback", "action", "greeting", "error"];
    const link = (o) => `#logs?offset=${Math.max(0, o)}${routeFilter ? `&route=${routeFilter}` : ""}`;
    content.innerHTML = `
      ${head("Chat logs", "All conversations. Mobile numbers, Aadhaar numbers and emails are masked before storage.",
        `<select class="input" id="routeFilter">${routes.map((r) => `<option value="${r}" ${r === routeFilter ? "selected" : ""}>${r || "All routes"}</option>`).join("")}</select>`)}
      <div class="table-wrap">${rows.length ? `<table>
        <thead><tr><th>Time</th><th>Question</th><th>Answer</th><th>Route</th><th class="num">Score</th><th class="num">ms</th><th>Feedback</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td style="white-space:nowrap">${fmtDate(r.created_at)}<span class="sub mono">${esc(r.session_id.slice(0, 8))}</span></td>
            <td ${r.lang === "hi" ? 'lang="hi"' : ""}>${esc(r.question)}</td>
            <td><div class="clip">${esc(r.answer)}</div></td>
            <td>${routeBadge(r.route)}</td>
            <td class="num">${Number(r.top_score).toFixed(2)}</td>
            <td class="num">${r.latency_ms}</td>
            <td>${r.feedback > 0 ? "👍" : r.feedback < 0 ? "👎" : ""} ${esc(r.feedback_comment)}</td>
          </tr>`).join("")}</tbody></table>` : '<div class="empty">No conversations.</div>'}</div>
      <div class="toolbar" style="margin-top:12px;justify-content:flex-end">
        ${offset > 0 ? `<a class="btn btn-sm" href="${link(offset - 50)}">← Newer</a>` : ""}
        ${rows.length === 50 ? `<a class="btn btn-sm" href="${link(offset + 50)}">Older →</a>` : ""}
      </div>`;
    $("#routeFilter").addEventListener("change", (e) => { location.hash = e.target.value ? `logs?route=${e.target.value}` : "logs"; });
  }

  // ------------------------------------------------------------ grievances

  async function grievances(params) {
    const statusFilter = params.get("status") || "";
    const rows = await api("GET", `/api/admin/grievances${statusFilter ? `?status=${statusFilter}` : ""}`);
    const statuses = ["open", "in_progress", "resolved", "rejected"];
    content.innerHTML = `
      ${head("Grievances", "Grievances registered through the chat. Update the status as they are processed.",
        `<select class="input" id="statusFilter"><option value="">All statuses</option>${statuses.map((s) => `<option value="${s}" ${s === statusFilter ? "selected" : ""}>${s.replace("_", " ")}</option>`).join("")}</select>`)}
      <div class="table-wrap">${rows.length ? `<table>
        <thead><tr><th>Ticket</th><th>Citizen</th><th>Location</th><th>Grievance</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((g) => `
          <tr>
            <td class="mono">${esc(g.ticket)}<span class="sub">${fmtDate(g.created_at)}</span></td>
            <td>${esc(g.name)}<span class="sub mono">${esc(g.mobile)}</span></td>
            <td>${esc(g.block || "—")}<span class="sub">${esc(g.village)}</span></td>
            <td><div class="clip" ${g.lang === "hi" ? 'lang="hi"' : ""}>${esc(g.description)}</div>${g.remarks ? `<span class="sub">Remarks: ${esc(g.remarks)}</span>` : ""}</td>
            <td>${statusBadge(g.status)}</td>
            <td><div class="actions"><button class="btn btn-sm" data-edit="${g.id}">Update</button></div></td>
          </tr>`).join("")}</tbody></table>` : '<div class="empty">No grievances.</div>'}</div>`;
    $("#statusFilter").addEventListener("change", (e) => { location.hash = e.target.value ? `grievances?status=${e.target.value}` : "grievances"; });
    content.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const g = rows.find((x) => x.id === Number(b.dataset.edit));
      openDialog(`Grievance ${g.ticket}`, `
        <p style="white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:8px" ${g.lang === "hi" ? 'lang="hi"' : ""}>${esc(g.description)}</p>
        <div class="field"><label>Status</label><select class="input" name="status">${statuses.map((s) => `<option value="${s}" ${s === g.status ? "selected" : ""}>${s.replace("_", " ")}</option>`).join("")}</select></div>
        <div class="field"><label>Remarks</label><textarea class="input" name="remarks" rows="3">${esc(g.remarks)}</textarea></div>`, async (fd) => {
        await api("PUT", `/api/admin/grievances/${g.id}`, { status: fd.get("status"), remarks: fd.get("remarks") });
        toast("Grievance updated");
        grievances(params);
      });
    }));
  }

  // ------------------------------------------------------------ users & audit

  async function users() {
    if (me.role !== "admin") { content.innerHTML = '<div class="card">Admin role required.</div>'; return; }
    const [list, audit] = await Promise.all([api("GET", "/api/admin/users"), api("GET", "/api/admin/audit?limit=200")]);
    content.innerHTML = `
      ${head("Users & audit", "Staff accounts and a record of every change made in the admin panel.", '<button class="btn btn-primary" id="newUser">New user</button>')}
      <div class="table-wrap" style="margin-bottom:16px"><table>
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>${list.map((u) => `
          <tr><td><strong>${esc(u.username)}</strong></td><td>${esc(u.role)}</td>
            <td>${u.active ? '<span class="badge badge-ok">active</span>' : '<span class="badge">inactive</span>'}</td>
            <td>${fmtDate(u.created_at)}</td>
            <td><div class="actions">${u.username !== me.username ? `<button class="btn btn-sm" data-toggle="${u.id}" data-active="${u.active}">${u.active ? "Deactivate" : "Activate"}</button>` : ""}</div></td></tr>`).join("")}
        </tbody></table></div>
      <div class="card"><h2>Audit log</h2><div class="table-wrap"><table>
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
        <tbody>${audit.map((a) => `<tr><td style="white-space:nowrap">${fmtDate(a.created_at)}</td><td>${esc(a.username)}</td><td class="mono">${esc(a.action)}</td><td>${esc(a.target)}</td><td>${esc(a.detail)}</td></tr>`).join("")}</tbody>
      </table></div></div>`;
    $("#newUser").addEventListener("click", () => openDialog("New staff user", `
      <div class="field"><label>Username</label><input class="input" name="username" required pattern="[A-Za-z0-9_.\\-]{3,100}"></div>
      <div class="field"><label>Password</label><input class="input" name="password" type="password" required minlength="10" autocomplete="new-password"><span class="hint">At least 10 characters.</span></div>
      <div class="field"><label>Role</label><select class="input" name="role"><option value="editor">Editor - manage knowledge, review, grievances</option><option value="admin">Admin - also users, delete skills, re-index all</option></select></div>`,
      async (fd) => {
        await api("POST", "/api/admin/users", { username: fd.get("username"), password: fd.get("password"), role: fd.get("role") });
        toast("User created");
        users();
      }));
    content.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
      await api("PUT", `/api/admin/users/${b.dataset.toggle}/active?active=${b.dataset.active !== "true"}`);
      users();
    }));
  }

  // ------------------------------------------------------------ boot

  api("GET", "/api/admin/me").then((user) => { me = user; startApp(); }).catch(() => {});
})();
