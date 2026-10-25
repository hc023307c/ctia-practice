export const VERSION = 'ctia-88-v1';
export function parseRange(text, questions) {
  const all = questions.map(q => q.id);
  if (!text.trim()) return all;
  const result = new Set();
  for (const part of text.replace(/[，、]/g, ',').replace(/[～~–—]/g, '-').split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('題號格式不正確，請輸入例如 1-20 或 2,5,8-15。');
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (start > end || end - start > questions.length) throw new Error('題號範圍不正確，請確認起訖題號。');
    for (let id = start; id <= end; id++) {
      if (!all.includes(id)) throw new Error(`題庫沒有第 ${id} 題。`);
      result.add(id);
    }
  }
  return [...result].sort((a,b) => a-b);
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeSession(questions, config, now = Date.now(), random = Math.random) {
  const ids = parseRange(config.range, questions);
  const count = Number(config.count || ids.length);
  if (!Number.isInteger(count) || count < 1 || count > ids.length) throw new Error(`出題數量須為 1～${ids.length} 題。`);
  const minutes = Number(config.minutes || 0);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new Error('時間請輸入 0～1440 分鐘，0 代表不限時。');
  let selected = ids.map(id => questions.find(q => q.id === id));
  if (count < selected.length) selected = shuffle(selected, random).slice(0,count);
  selected = config.shuffleQuestions ? shuffle(selected, random) : selected.sort((a,b) => a.id-b.id);
  return {version:VERSION, config, startedAt:now, deadline:minutes ? now+minutes*60000 : null,
    items:selected.map(q => ({id:q.id, options:(config.shuffleOptions && !q.lockOptions ? shuffle(q.options,random) : q.options).map(o=>o.id)})),
    index:0, answers:{}, flags:[], finishedAt:null};
}
export function isCorrect(question, selected = []) {
  return selected.length === question.answers.length && question.answers.every(id => selected.includes(id));
}
export function grade(session, questions) {
  let correct=0, unanswered=0;
  for (const item of session.items) {
    const selected=session.answers[item.id] || [];
    if (!selected.length) unanswered++;
    if (isCorrect(questions.find(q => q.id === item.id), selected)) correct++;
  }
  const total=session.items.length;
  return {total,correct,unanswered,wrong:total-correct-unanswered,score:Math.round(correct/total*100)};
}
export function validSession(s, questions) {
  return !!s && s.version===VERSION && Array.isArray(s.items) && s.items.length>0 && s.items.length<=questions.length &&
    new Set(s.items.map(i=>i.id)).size===s.items.length && Number.isFinite(s.startedAt) &&
    (s.deadline===null || Number.isFinite(s.deadline)) && (s.finishedAt===null || Number.isFinite(s.finishedAt)) &&
    Number.isInteger(s.index) && s.index>=0 && s.index<s.items.length && s.answers && typeof s.answers==='object' &&
    Array.isArray(s.flags) && s.config && s.items.every(i=>{
      const q=questions.find(q=>q.id===i.id);
      const a=s.answers[i.id]||[];
      return q && Array.isArray(i.options) && i.options.length===q.options.length && new Set(i.options).size===q.options.length &&
        i.options.every(id=>q.options.some(o=>o.id===id)) && Array.isArray(a) && new Set(a).size===a.length && a.every(id=>i.options.includes(id));
    });
}
