// Adds search vectors to the exported knowledge base: demo/.build/content.json -> demo/kb/kb.json.
// Uses the same model and settings as the browser (engine.js), so document and question vectors match.
// Run through `python cli.py export-demo`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as transformers from "@huggingface/transformers";
import { CONFIG, createEmbedder, encodeVectors } from "./engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const content = JSON.parse(readFileSync(join(here, ".build", "content.json"), "utf-8"));

console.log(`Loading ${CONFIG.model} (${CONFIG.dtype}) ...`);
const embed = await createEmbedder(transformers);

const started = Date.now();
const chunkVecs = await embed(content.chunks.map((c) => c.t), "passage");
const qaTexts = [];
const qaOwner = [];
content.qa.forEach((qa, i) => {
  for (const q of [qa.question_en, qa.question_hi]) {
    if (q && q.trim()) { qaTexts.push(q); qaOwner.push(i); }
  }
});
const qaVecs = qaTexts.length ? await embed(qaTexts, "query") : [];
const skillVecs = await embed(
  content.skills.map((s) => `${s.name_en}. ${s.name_hi}. ${s.description}. ${s.keywords.join(" ")}`), "query",
);
const docVecs = content.docs.length ? await embed(content.docs.map((d) => `${d.title}. ${d.description}`), "query") : [];

const kb = {
  ...content,
  model: CONFIG.model,
  dtype: CONFIG.dtype,
  dim: chunkVecs[0]?.length || 384,
  vectors: {
    chunks: chunkVecs.length ? encodeVectors(chunkVecs) : "",
    qa: qaVecs.length ? encodeVectors(qaVecs) : "",
    qa_owner: qaOwner,
    skills: skillVecs.length ? encodeVectors(skillVecs) : "",
    docs: docVecs.length ? encodeVectors(docVecs) : "",
  },
};
mkdirSync(join(here, "kb"), { recursive: true });
const out = join(here, "kb", "kb.json");
writeFileSync(out, JSON.stringify(kb));
console.log(
  `Wrote demo/kb/kb.json: ${content.skills.length} skills, ${content.docs.length} documents, ` +
  `${content.chunks.length} passages, ${content.qa.length} curated Q&A ` +
  `(${((Date.now() - started) / 1000).toFixed(1)} s, ${(JSON.stringify(kb).length / 1024).toFixed(0)} KB)`,
);
