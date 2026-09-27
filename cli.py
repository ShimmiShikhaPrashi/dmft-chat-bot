"""DMFT Sahayak management commands.

  python cli.py create-admin <username> [--role admin|editor]
  python cli.py seed [--no-fetch]              load seed/skills/*.yaml (skills, Q&A, documents, URL sources)
  python cli.py ingest <folder> --skill <slug> [--visibility public|internal]
  python cli.py reindex                         re-extract and re-embed every document
  python cli.py refresh-sources                 re-fetch all URL sources now
  python cli.py eval [--file seed/eval.yaml]    retrieval quality check (no LLM calls)
"""

import argparse
import getpass
import logging
import sys
from collections import defaultdict
from pathlib import Path

import yaml
from sqlalchemy import select

from app.config import BASE_DIR, settings
from app.db import SessionLocal, init_db
from app.ingest.extract import SUPPORTED_EXTENSIONS
from app.ingest.fetch import refresh_source
from app.ingest.pipeline import DuplicateDocument, create_document, index_document, reindex_all
from app.lang import detect_language, normalize
from app.models import AdminUser, QAPair, Skill, Source
from app.rag.embedder import embed_one
from app.rag.knowledge import bump_kb_version, knowledge
from app.rag.retriever import is_relevant, retrieve

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("cli")

SKILL_FIELDS = ("name_en", "name_hi", "description", "keywords", "instructions", "action", "enabled", "visibility")


def cmd_create_admin(args) -> None:
    from app.auth import hash_password, revoke_user_sessions

    password = args.password or getpass.getpass("Password (min 10 chars): ")
    if len(password) < 10:
        sys.exit("Password must be at least 10 characters")
    with SessionLocal() as db:
        user = db.scalar(select(AdminUser).where(AdminUser.username == args.username))
        if user:
            user.password_hash = hash_password(password)
            user.role = args.role
            user.active = True
            revoke_user_sessions(db, user.id)  # the old password's sessions end
            print(f"Updated user '{args.username}' ({args.role}); existing sessions signed out")
        else:
            db.add(AdminUser(username=args.username, password_hash=hash_password(password), role=args.role))
            print(f"Created user '{args.username}' ({args.role})")
        db.commit()


def cmd_seed(args) -> None:
    files = sorted((BASE_DIR / "seed" / "skills").glob("*.yaml"))
    with SessionLocal() as db:
        for path in files:
            spec = yaml.safe_load(path.read_text(encoding="utf-8"))
            skill = db.scalar(select(Skill).where(Skill.slug == spec["slug"]))
            if skill is None:
                skill = Skill(slug=spec["slug"], **{k: spec[k] for k in SKILL_FIELDS if k in spec})
                db.add(skill)
                log.info("Skill created: %s", spec["slug"])
            elif args.update:
                for key in SKILL_FIELDS:
                    if key in spec:
                        setattr(skill, key, spec[key])
                log.info("Skill updated: %s", spec["slug"])
            db.commit()

            existing_questions = {q.question_en.strip() for q in skill.qa_pairs} | {
                q.question_hi.strip() for q in skill.qa_pairs
            }
            added = 0
            for qa in spec.get("qa", []):
                if qa.get("question_en", "").strip() in existing_questions or qa.get("question_hi", "").strip() in existing_questions:
                    continue
                db.add(QAPair(skill_id=skill.id, created_by="seed", **qa))
                added += 1
            db.commit()
            if added:
                log.info("  %d Q&A pairs added", added)

            for doc in spec.get("documents", []):
                file_path = BASE_DIR / doc["path"]
                if not file_path.exists():
                    log.warning("  Missing seed document %s", file_path)
                    continue
                try:
                    document = create_document(
                        db, skill, file_path.read_bytes(), file_path.name, doc.get("title", ""),
                        doc.get("description", ""), doc.get("visibility", "public"),
                    )
                except DuplicateDocument:
                    continue
                document = index_document(db, document.id)
                log.info("  Document %s: %s (%d chunks)", document.status, document.title, document.chunk_count)

            for src in spec.get("sources", []):
                source = db.scalar(select(Source).where(Source.skill_id == skill.id, Source.url == src["url"]))
                if source is None:
                    source = Source(skill_id=skill.id, url=src["url"], title=src.get("title", ""),
                                    visibility=src.get("visibility", "public"))
                    db.add(source)
                    db.commit()
                if args.no_fetch or source.document_id:
                    continue
                document = refresh_source(db, source)
                if document:
                    log.info("  Source indexed: %s (%d chunks)", document.title, document.chunk_count)
                else:
                    log.warning("  Source failed: %s - %s", source.url, source.last_error)
        bump_kb_version(db)
    print("Seed complete.")


def cmd_ingest(args) -> None:
    folder = Path(args.folder)
    with SessionLocal() as db:
        skill = db.scalar(select(Skill).where(Skill.slug == args.skill))
        if skill is None:
            sys.exit(f"Unknown skill '{args.skill}'. Create it in the admin panel or seed first.")
        for path in sorted(folder.rglob("*")):
            if path.suffix.lower() not in SUPPORTED_EXTENSIONS or not path.is_file():
                continue
            try:
                document = create_document(db, skill, path.read_bytes(), path.name, visibility=args.visibility)
            except DuplicateDocument:
                log.info("Skip duplicate %s", path.name)
                continue
            document = index_document(db, document.id)
            log.info("%s %s (%d chunks) %s", document.status, path.name, document.chunk_count, document.error or "")


def cmd_reindex(_args) -> None:
    with SessionLocal() as db:
        print(f"Re-indexed {reindex_all(db)} documents")


def cmd_refresh_sources(_args) -> None:
    with SessionLocal() as db:
        for source in db.scalars(select(Source)):
            document = refresh_source(db, source, force=True)
            print(f"{'ok ' if document else 'ERR'} {source.url} {source.last_error or ''}")


def cmd_eval(args) -> None:
    cases = yaml.safe_load(Path(args.file).read_text(encoding="utf-8"))
    totals, passed = defaultdict(int), defaultdict(int)
    failures = []
    with SessionLocal() as db:
        snap = knowledge.snapshot(db)
        for case in cases:
            question = normalize(case["q"])
            expected = case.get("skill")
            lang = detect_language(question)
            vec = embed_one(question)
            qa = knowledge.match_qa(snap, vec, "public")
            hits = [h for h in retrieve(snap, [(question, vec)], "public") if is_relevant(h)]
            top_dense = max((h.dense for h in hits), default=0.0)
            qa_skill, qa_score = (snap.skills[qa[0][0].skill_id].slug, qa[0][1]) if qa else (None, 0.0)
            # Same gate as chat_service: answer if a curated note or a relevant chunk exists.
            qa_ok = qa_score >= settings.qa_context_threshold
            dense_ok = bool(hits)
            hit_skills = [snap.skills[h.skill_id].slug for h in hits[:3]]
            if expected is None:
                ok = not (qa_ok or dense_ok)
            else:
                ok = (qa_ok and qa_skill == expected) or (dense_ok and expected in hit_skills)
            totals[lang] += 1
            passed[lang] += ok
            if args.verbose:
                print(f"{'ok ' if ok else 'BAD'} qa={qa_score:.3f} dense={top_dense:.3f} {expected} <- {case['q']}")
            if not ok:
                failures.append((case["q"], expected, qa_skill, round(qa_score, 3), hit_skills, round(top_dense, 3)))
    print("\nRetrieval eval (hit@3 / correct refusal)")
    for lang in sorted(totals):
        print(f"  {lang:9s} {passed[lang]}/{totals[lang]}  ({passed[lang] / totals[lang]:.0%})")
    total = sum(totals.values())
    print(f"  {'overall':9s} {sum(passed.values())}/{total}  ({sum(passed.values()) / max(total, 1):.0%})")
    if failures:
        print("\nFailures: question | expected | best QA skill (score) | top-3 hit skills | top dense")
        for row in failures:
            print("  ", " | ".join(str(x) for x in row))


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Hindi output on Windows consoles
    init_db()
    parser = argparse.ArgumentParser(description="DMFT Sahayak management")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin")
    p.add_argument("username")
    p.add_argument("--role", choices=["admin", "editor"], default="admin")
    p.add_argument("--password", help="omit to be prompted")
    p.set_defaults(func=cmd_create_admin)

    p = sub.add_parser("seed")
    p.add_argument("--no-fetch", action="store_true", help="do not download URL sources")
    p.add_argument("--update", action="store_true", help="overwrite existing skill fields from YAML")
    p.set_defaults(func=cmd_seed)

    p = sub.add_parser("ingest")
    p.add_argument("folder")
    p.add_argument("--skill", required=True)
    p.add_argument("--visibility", choices=["public", "internal"], default="public")
    p.set_defaults(func=cmd_ingest)

    sub.add_parser("reindex").set_defaults(func=cmd_reindex)
    sub.add_parser("refresh-sources").set_defaults(func=cmd_refresh_sources)

    p = sub.add_parser("eval")
    p.add_argument("--file", default=str(BASE_DIR / "seed" / "eval.yaml"))
    p.add_argument("--verbose", action="store_true", help="print scores for every question")
    p.set_defaults(func=cmd_eval)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
