import fs from 'node:fs';
import assert from 'node:assert/strict';
const questions=JSON.parse(fs.readFileSync(new URL('../questions.json',import.meta.url)));
assert.equal(questions.length,88);assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
for(const q of questions){assert.ok(q.explanation?.reason?.trim()&&q.explanation?.distractors?.trim()&&q.explanation?.takeaway?.trim(),`Missing explanation: ${q.id}`);assert.ok(Array.isArray(q.explanation.references));for(const r of q.explanation.references)assert.ok(r.label&&new URL(r.url).protocol==='https:');assert.ok(q.en&&q.zh);assert.equal(q.options.length,4);assert.equal(new Set(q.options.map(o=>o.id)).size,4);for(const o of q.options)assert.ok(o.en&&o.zh);for(const id of q.answers)assert.ok(q.options.some(o=>o.id===id));}
console.log(`Validated ${questions.length} bilingual questions, explanations and answer mappings.`);
