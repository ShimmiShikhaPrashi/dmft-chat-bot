// Checks the demo's browser-side RAG on seed/eval.yaml (exported to demo/.build/eval.json), with the
// same pass rule as `python cli.py eval`: the expected skill is found (curated note or relevant passage in
// the top 3), or nothing relevant is found for out-of-scope questions.
//
//   node demo/eval.mjs            summary and failures
//   node demo/eval.mjs --verbose  every question with its scores, plus sample answers

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as transformers from "@huggingface/transformers";
import { CONFIG, answer, createEmbedder, createKB, isRelevant, matchQA, retrieve } from "./engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const verbose = process.argv.includes("--verbose");
const kb = createKB(JSON.parse(readFileSync(join(here, "kb", "kb.json"), "utf-8")));
const cases = JSON.parse(readFileSync(join(here, ".build", "eval.json"), "utf-8"));
const embed = await createEmbedder(transformers);
const slug = (id) => kb.skillMap.get(id)?.slug;

const totals = {};
const passed = {};
const failures = [];
const inScope = [];
const outScope = [];
for (const c of cases) {
  const question = kb.langTools.normalize(c.q);
  const lang = kb.langTools.detectLanguage(question);
  const [vec] = await embed([question], "query");
  const queries = [{ text: question, vec }];
  const qa = matchQA(kb, queries);
  const all = retrieve(kb, queries);
  const hits = all.filter(isRelevant);
  const topDense = Math.max(0, ...all.map((h) => h.dense));
  // Same note rule as engine.answer: meta skills ("general") count only as direct matches.
  const usable = qa.filter(([info, s]) => s >= CONFIG.qaMatch || !CONFIG.directOnlySkills.includes(slug(info.skill_id)));
  const [qaInfo, qaScore] = usable[0] || [null, 0];
  const qaOk = qaScore >= CONFIG.qaContext;
  const hitSkills = hits.slice(0, 3).map((h) => slug(h.chunk.s));
  const ok = c.skill == null
    ? !(qaOk || hits.length)
    : (qaOk && slug(qaInfo.skill_id) === c.skill) || hitSkills.includes(c.skill);
  (c.skill == null ? outScope : inScope).push({ q: c.q, qa: qaScore, dense: topDense });
  totals[lang] = (totals[lang] || 0) + 1;
  passed[lang] = (passed[lang] || 0) + (ok ? 1 : 0);
  if (verbose) console.log(`${ok ? "ok " : "BAD"} qa=${qaScore.toFixed(3)} dense=${topDense.toFixed(3)} ${c.skill} <- ${c.q}`);
  if (!ok) failures.push([c.q, c.skill, qaInfo && slug(qaInfo.skill_id), qaScore.toFixed(3), hitSkills.join(","), topDense.toFixed(3)].join(" | "));
}

console.log("\nDemo retrieval eval (hit@3 / correct refusal)");
for (const lang of Object.keys(totals).sort()) {
  console.log(`  ${lang.padEnd(9)} ${passed[lang]}/${totals[lang]}  (${Math.round((100 * passed[lang]) / totals[lang])}%)`);
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`  ${"overall".padEnd(9)} ${sum(passed)}/${sum(totals)}  (${Math.round((100 * sum(passed)) / sum(totals))}%)`);
if (failures.length) {
  console.log("\nFailures: question | expected | best QA skill | QA score | top-3 hit skills | top dense");
  failures.forEach((f) => console.log("  ", f));
}
if (verbose) {
  const lowest = (rows, key) => Math.min(...rows.map((r) => r[key])).toFixed(3);
  const highest = (rows, key) => Math.max(...rows.map((r) => r[key])).toFixed(3);
  console.log(`\nCalibration: in-scope dense min ${lowest(inScope, "dense")}, out-of-scope dense max ${highest(outScope, "dense")}; ` +
    `out-of-scope QA max ${highest(outScope, "qa")}`);
  for (const q of ["What percentage of funds must go to high priority sectors?", "कांकेर ज़िले में कितनी तहसीलें हैं?", "Share the PMKKKY guidelines PDF"]) {
    const r = await answer(kb, { message: q, embed });
    console.log(`\n--- ${q}  [${r.route}]\n${r.answer}\n  citations: ${r.citations.map((c) => `${c.n}:${c.title} p${c.page}`).join("; ")}` +
      `\n  documents: ${r.documents.map((d) => d.title).join("; ")}\n  suggestions: ${r.suggestions.join(" | ")}`);
  }
}
process.exit(failures.length ? 1 : 0);
