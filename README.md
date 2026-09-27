# DMFT Sahayak — Uttar Bastar Kanker

A bilingual (Hindi / English) assistant for the District Mineral Foundation Trust (DMFT), Uttar Bastar Kanker.

What it does:
- **Answers only from official documents.** Answers come from documents that the DMFT team has added to its knowledge base. It uses retrieval-augmented generation (RAG) with Gemini.
- **Cites its sources.** Every answer shows the documents and pages it came from, and those documents can be downloaded from the chat.
- **Refuses rather than guesses.** When the information isn't in the documents, it says so.
- **Can be trained through an admin panel.** Staff add *skill packs*, upload documents and URLs, and work through a review queue of questions the bot could not answer.

Citizens can type or paste questions in **Hindi (Devanagari)**, **English**, or **Hinglish** (romanised Hindi, e.g. "kanker me kitne tehsil hai"). The bot replies in the user's language, or in whichever language is chosen with the EN / हिं switch.

---

## The app (mobile + web)

One responsive app serves phones and desktops. On Android or iOS it can be installed from the browser's "Add to Home screen" option (web-app manifest + service worker).

**Standard mode** is for citizens and needs no login:
- **Home:** greeting, suggested questions, and a composer with voice typing (Hindi / English).
- **Chat:** the answer card shows sources, citations and document downloads. Actions include Copy, 👍 / 👎 with a reason, Listen (text-to-speech), PDF, and related follow-up questions.
- **History:** conversations, saved on the device.
- **Knowledge:** searchable library of official documents.
- **Profile:** language, theme and text size.

**Enterprise mode** is for DMFT staff, who sign in under Profile with the same accounts as `/admin`:
- **Dashboard:** live KPIs, Ask AI / Knowledge Base / Project Data / Documents tiles, quick actions, recent conversations, and a notification bell for the review queue, open grievances and failed documents.
- **Enterprise Mode chat:** internal documents are included.
- **Projects:** works-list documents.
- **Reports:** saved answers.
- **Uploads:** document upload straight from the app.

**Tables and charts:**
- When the official documents contain the numbers, answers include Markdown tables and charts, drawn as SVG bar, line or pie charts.
- Any table with a numeric column can be switched to a chart.
- **View Full Report** opens a printable report (Download PDF uses the browser's print, so Hindi renders correctly).
- **Download Excel** builds a formatted `.xlsx` on the server.

Screenshots were checked at 390 px (phone) and 1440 px (desktop), in light and dark themes, in English and Hindi.

To use the official DMFT/district emblem, replace `static/img/logo.svg` with it, keeping the same file name.

## Architecture

```
Browser  ── /            chat UI (static/index.html)
         ── /admin       admin panel (static/admin.html)
            │
FastAPI  ── POST /api/chat
            1. normalise + detect language (hi / en / hinglish)
            2. rewrite: follow-up -> standalone question, Hindi -> English search query (1 Gemini call)
            3. skill actions (e.g. grievance form on "शिकायत दर्ज")
            4. semantic answer cache (cleared whenever the knowledge base changes)
            5. curated Q&A (staff-written answers)
            6. hybrid retrieval: bge-m3 dense vectors (Chroma) + BM25, fused with RRF
            7. relevance gate  -> refuse without calling the LLM if nothing relevant
            8. Gemini answers ONLY from the retrieved passages, with [n] citations
            9. citations + downloadable document cards, turn logged (PII masked)
```

| Layer | Technology |
|---|---|
| API / web | FastAPI, vanilla JS, bundled Noto Sans (Latin + Devanagari) fonts |
| Embeddings | `BAAI/bge-m3` (multilingual, runs locally, 1024-dim) |
| Vector store | ChromaDB (persistent, `storage/chroma`) |
| Lexical search | BM25 with a Devanagari-aware tokenizer |
| Metadata | SQLite (`storage/app.db`): skills, documents, passages, Q&A, logs, grievances, users, audit |
| LLM | Gemini via `google-genai` (`GEMINI_MODEL`, default `gemini-3.6-flash`) |
| Ingestion | PyMuPDF text layer, falling back to Tesseract OCR (`hin+eng`) per page; DOCX, XLSX/CSV, TXT/MD, HTML, images |

Code layout:

```
app/
  main.py            app, routes, startup warm-up, /healthz
  config.py          all settings (from .env)
  lang.py            language detection, normalisation, tokenizer, bilingual messages, PII masking
  models.py, db.py   SQLAlchemy models
  auth.py            admin login (bcrypt + JWT cookie), audit log
  api/chat.py        /api/chat, /api/feedback, /api/grievance, /api/documents/{id}/download
  api/admin.py       /api/admin/*  (skills, documents, sources, Q&A, review, logs, grievances, users)
  ingest/            extract.py (PDF/OCR/DOCX/...), chunker.py, pipeline.py, fetch.py (URL sources)
  rag/               embedder, store (Chroma), knowledge (BM25/Q&A/skill indexes), retriever,
                     cache, generator (Gemini prompts + circuit breaker), chat_service (orchestration)
  scheduler.py       nightly check that re-fetches URL sources older than 7 days
seed/                skill packs (YAML), official PDFs, eval set
cli.py               management commands
tests/               pytest suite (no model download or API key needed)
```

---

## Quick start (Windows, local)

```powershell
python -m venv .venv; .venv\Scripts\activate
pip install --index-url https://download.pytorch.org/whl/cpu torch
pip install -r requirements.txt
copy .env.example .env          # then set GEMINI_API_KEY and ADMIN_JWT_SECRET

python cli.py create-admin admin    # prompts for a password (min 10 chars)
python cli.py seed                  # loads the 7 Kanker skill packs, PDFs and kanker.gov.in pages
uvicorn app.main:app --port 8000
```

Open http://localhost:8000 for the chat and http://localhost:8000/admin for the admin panel (you are sent to the sign-in page first).

Notes:
- The first start downloads the embedding model (about 2.3 GB) into `%USERPROFILE%\.cache\huggingface`.
- The server needs about 3 GB of RAM.
- **Hindi OCR on Windows.** Scanned Hindi PDFs need Tesseract (default path `C:\Program Files\Tesseract-OCR`) plus Hindi language data:
  1. Download `hin.traineddata` from https://github.com/tesseract-ocr/tessdata_fast.
  2. Copy it into `C:\Program Files\Tesseract-OCR\tessdata`.
  3. Re-index any scanned documents that were uploaded before this.

  Without it, OCR uses English only (a warning is logged). PDFs that have a text layer don't need OCR.

## Docker

```bash
cp .env.example .env            # set GEMINI_API_KEY, ADMIN_JWT_SECRET, COOKIE_SECURE=true behind HTTPS
docker compose up -d --build
docker compose exec dmft-sahayak python cli.py create-admin admin
docker compose exec dmft-sahayak python cli.py seed
```

The image includes Tesseract (Hindi and English) and the bge-m3 model, so it runs without internet access (`HF_HUB_OFFLINE=1`). Gemini still needs outbound HTTPS.

All data lives in the `dmft-storage` volume, which holds `app.db`, `chroma/` and `files/`. **Back this volume up.** Run a single container/worker: indexes and the model are held in process memory.

Put the container behind an HTTPS reverse proxy (nginx/IIS) and set `COOKIE_SECURE=true`.

## Hosting

The code lives on GitHub (https://github.com/ShimmiShikhaPrashi/dmft-chat-bot). The app itself needs a server: it is a Python service that keeps the embedding model in memory. GitHub Pages cannot run it because Pages serves only static files.

**What GitHub does automatically** (`.github/workflows/ci.yml`), on every push to `main`:
1. It runs the test suite.
2. If the tests pass, it builds the Docker image and publishes it to GitHub Container Registry as `ghcr.io/shimmishikhaprashi/dmft-chat-bot:latest`.

Progress is shown in the repository's **Actions** tab, and the image appears under **Packages**.

**Server requirements:** Linux, 2+ vCPU, **4 GB RAM or more**, 15 GB disk, Docker, and outbound HTTPS to Gemini. Any of these works:
- the district's NIC / State Data Centre server;
- a cloud VM (e.g. AWS Lightsail / EC2, Azure, GCP, DigitalOcean).

**Run it on the server:**

```bash
# Only needed if the repository/package is private: a GitHub token with read:packages
echo <TOKEN> | docker login ghcr.io -u ShimmiShikhaPrashi --password-stdin

docker pull ghcr.io/shimmishikhaprashi/dmft-chat-bot:latest
# Create /opt/dmft/.env with GEMINI_API_KEY, ADMIN_JWT_SECRET (long random) and COOKIE_SECURE=true
docker run -d --name dmft-sahayak --restart unless-stopped   --env-file /opt/dmft/.env -e HF_HUB_OFFLINE=1   -p 127.0.0.1:8000:8000 -v dmft-storage:/app/storage   ghcr.io/shimmishikhaprashi/dmft-chat-bot:latest

# First time only
docker exec -it dmft-sahayak python cli.py create-admin admin
docker exec dmft-sahayak python cli.py seed
```

Then put nginx (or IIS) in front with an HTTPS certificate for the public domain, forwarding to `127.0.0.1:8000`.

**To update to a new version:**
1. `docker pull` the image again.
2. `docker rm -f dmft-sahayak`.
3. Run the same `docker run` command. Data in the `dmft-storage` volume is kept.

---

## Training the bot (for DMFT staff)

"Training" here means curating the knowledge base. The model itself is not retrained, which is what keeps answers limited to your official data.

1. **Skills** (Admin → Skills). A skill is a topic pack with its own documents, URL sources, curated Q&A and answering instructions.
   - Create one for each new area (e.g. "Health works 2025-26").
   - Write the description and keywords in both Hindi and English, because they are used to route questions.
   - Set a skill to *internal* to hide it from citizens.
2. **Documents** (Admin → Documents). Upload PDF, Word, Excel, CSV, text or scanned images.
   - They are extracted, OCR'd if scanned, split into passages and searchable within about a minute.
   - *Public* documents can be downloaded by citizens when relevant.
   - *Internal* documents are used and shown only to logged-in staff.
3. **URL sources** (Admin → URL sources). Add official pages or PDF links (e.g. kanker.gov.in notices).
   - They are re-checked weekly and re-indexed when they change.
   - Pages that need JavaScript (e.g. dmf.cg.nic.in) cannot be read; download and upload those documents instead.
4. **Curated Q&A** (Admin → Curated Q&A). Staff-written answers in Hindi and/or English.
   - A near-identical question gets the curated answer directly.
   - Similar questions pass it to the AI as a trusted note.
   - If only one language is filled in, the other is translated automatically.
5. **Review queue** (Admin → Review queue). This lists questions that were refused, answered with low confidence, or marked 👎 by users.
   - Click **Teach answer** to turn one into a curated Q&A.
   - **Do this weekly.** It is the main way the bot gets better.

The seed skills are `general`, `dmft-pmkkky`, `kanker-district`, `kanker-notices`, `cg-dmf-rules`, `projects-kanker` and `grievance`.

**`cg-dmf-rules` and `projects-kanker` start empty.** Upload the Chhattisgarh DMF rules and the district's approved works list, annual plan and progress reports to them. The old placeholder project list was removed so that no invented data is shown to citizens.

Staff can also bulk-load a folder:

```bash
python cli.py ingest "D:\DMFT\Works 2025-26" --skill projects-kanker --visibility public
```

## Configuration (`.env`)

| Setting | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | – | Required for generated answers. Without it the bot returns curated answers and document excerpts. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Gemini model id |
| `ADMIN_JWT_SECRET` | insecure default | **Set a long random value in production** |
| `COOKIE_SECURE` | `false` | `true` when served over HTTPS |
| `EMBED_MODEL` / `EMBED_DEVICE` | `BAAI/bge-m3` / `cpu` | Embedding model (changing it requires `python cli.py reindex`) |
| `TESSERACT_CMD`, `OCR_LANGS` | auto / `hin+eng` | OCR binary and languages |
| `CHAT_RATE_LIMIT` | `20/minute` | Per-IP chat limit |
| `MIN_RELEVANCE`, `MIN_HIT_RELEVANCE` | `0.52`, `0.45` | Relevance gate; tune with `python cli.py eval --verbose` |
| `QA_MATCH_THRESHOLD`, `QA_CONTEXT_THRESHOLD` | `0.95`, `0.65` | Curated answer: direct reply / note to the AI |
| `SOURCE_REFRESH_DAYS` | `7` | URL source refresh interval |

**Gemini quota.** The free tier allows only about 20 requests per day, and each Hindi question uses 2 calls. Use a paid tier for public launch.

When Gemini is rate-limited or down, the bot pauses LLM calls (15 minutes for a daily quota, shorter otherwise). During that time it answers within seconds from curated Q&A, the answer cache, or document excerpts. `GET /healthz` shows the LLM status.

## Security & privacy

- **Admin access.** Staff sign in at `/admin/login`. The server only serves `/admin` to a signed-in user and redirects everyone else to the sign-in page.
  - Passwords are hashed with bcrypt.
  - Each sign-in creates a server-side session (`admin_sessions` table). The cookie is an HTTP-only, SameSite=Strict signed token naming that session.
  - Sessions end after `ADMIN_SESSION_HOURS` (default 12) without activity and extend while in use.
  - Signing out revokes the session on the server and returns every open admin tab to the sign-in page. Deactivating a user or resetting their password with `cli.py create-admin` signs them out everywhere.
  - Roles are *editor* and *admin*; only admins can delete skills, manage users and view the audit log.
- **Audit log.** Every admin change is recorded.
- **Document access.** Internal documents never reach public answers or downloads (the API returns 403).
- **Personal data.** Mobile numbers, Aadhaar numbers and emails in chat messages are masked before logging. Grievance contact details are stored only in the grievances table, which only staff can see.
- **Prompt injection.** Retrieved text is fenced in the prompt as data. The model is told to ignore any instructions inside documents.
- **Abuse limits.** Chat, feedback, grievance and login are rate-limited. Uploads are limited by type and size. URL fetching refuses private/internal network addresses.

## Tests and quality checks

```bash
python -m pytest -q          # 42 tests, fast fake embedder, no API key needed
python cli.py eval --verbose # retrieval + refusal check on seed/eval.yaml (37 hi/en/hinglish questions)
```

Add real citizen questions to `seed/eval.yaml` over time. Rerun the eval after changing thresholds or the embedding model.
