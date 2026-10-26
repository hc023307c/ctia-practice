import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMasteryStore,practiceIds,makePracticeSession} from '../mastery.js';
import {grade,validSession} from '../core.js';
const qs=JSON.parse(fs.readFileSync(new URL('../questions.json',import.meta.url))),config={range:'1-5',count:'',minutes:'10',shuffleQuestions:true,shuffleOptions:true};
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
const storeFor=s=>createMasteryStore({getStorage:()=>s,questionIds:()=>qs.map(q=>q.id)});
test('reading and exam mastery persist independently by original question ID and restore independently',()=>{
 const s=storage(),m=storeFor(s);assert.equal(m.set('read',2,true),true);assert.equal(m.ids('exam').has(2),false);m.set('exam',4,true);m.set('read',2,true);
 const reloaded=storeFor(s);assert.deepEqual([...reloaded.ids('read')],[2]);assert.deepEqual([...reloaded.ids('exam')],[4]);reloaded.set('read',2,false);assert.equal(reloaded.ids('read').size,0);assert.deepEqual([...reloaded.ids('exam')],[4]);
});
test('stored invalid IDs and duplicates never affect bank membership',()=>{
 const s=storage();s.setItem('ctia-mastery-read-v1',JSON.stringify({version:1,ids:[2,2,'3',null,-1,89,1.5,4]}));assert.deepEqual([...storeFor(s).ids('read')],[2,4]);assert.equal(storeFor(s).set('read',89,true),false);
 for(const text of ['{bad','null','{}','{"version":99,"ids":[1]}']){s.setItem('ctia-mastery-read-v1',text);assert.equal(storeFor(s).ids('read').size,0);}
});
test('storage failure is reported without pretending the new mastery was persisted',()=>{
 const s=storage(),m=storeFor(s);m.set('read',1,true);s.setItem=()=>{throw Error('quota');};assert.equal(m.set('read',2,true),false);assert.equal(m.ids('read').has(2),false);assert.equal(m.ids('read').has(1),true);assert.equal(m.set('read',1,false),false);assert.equal(m.ids('read').has(1),true);
 const unavailable=createMasteryStore({getStorage:()=>{throw Error('denied');},questionIds:()=>[1]});assert.equal(unavailable.ids('read').size,0);assert.equal(unavailable.set('read',1,true),false);
});
test('reading entry snapshot keeps a newly mastered question until the next visit',()=>{
 const m=storeFor(storage());m.set('read',1,true);const snapshot=m.ids('read');m.set('read',2,true);assert.deepEqual(practiceIds(qs,'1-3',snapshot),[2,3]);assert.deepEqual(practiceIds(qs,'1-3',m.ids('read')),[3]);assert.deepEqual(practiceIds(qs,'1-3',m.ids('read'),true),[1,2,3]);
});
test('exam filters before random sampling and preserves original range/config for retries',()=>{
 const mastery=new Set([1,2,4]),c={...config,count:'2'},s=makePracticeSession(qs,c,mastery,1000,()=>0);assert.deepEqual(new Set(s.items.map(i=>i.id)),new Set([3,5]));assert.deepEqual(s.config,c);assert.equal(s.deadline,601000);assert.ok(validSession(s,qs));assert.deepEqual(mastery,new Set([1,2,4]));
});
test('marking exam mastery never mutates the running session, grading, choices or timer',()=>{
 const m=storeFor(storage()),session=makePracticeSession(qs,config,m.ids('exam'),1000,()=>0);session.answers[1]=['D'];const before=structuredClone(session),score=grade(session,qs);m.set('exam',session.items[0].id,true);assert.deepEqual(session,before);assert.deepEqual(grade(session,qs),score);const retry=makePracticeSession(qs,session.config,m.ids('exam'),2000,()=>0);assert.equal(retry.items.length,4);assert.ok(!retry.items.some(i=>i.id===session.items[0].id));
});
test('all mastered range and insufficient eligible count are explicit errors; including mastered restores availability',()=>{
 assert.throws(()=>makePracticeSession(qs,config,new Set([1,2,3,4,5])),/都已讀熟/);assert.throws(()=>makePracticeSession(qs,{...config,count:'4'},new Set([1,2])),/1～3/);const s=makePracticeSession(qs,{...config,includeMastered:true},new Set([1,2,3,4,5]));assert.equal(s.items.length,5);assert.throws(()=>practiceIds(qs,'99',new Set()),/沒有第/);
});
test('wrong-question retry respects latest mastery and does not silently include other questions',()=>{
 const retry=makePracticeSession(qs,{...config,range:'2,5,8',count:''},new Set([2,5]));assert.deepEqual(retry.items.map(i=>i.id),[8]);assert.deepEqual(retry.config.range,'2,5,8');
});
