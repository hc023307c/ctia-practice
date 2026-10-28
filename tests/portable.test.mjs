import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPortableRuntime} from '../portable/runtime.js';
import {makePortableBackup,parsePortableBackup} from '../portable/backup.js';
import {makeSession,grade} from '../core.js';
import {blankNote} from '../notes-data.js';
const qs=JSON.parse(fs.readFileSync(new URL('../questions.json',import.meta.url))),config={range:'1-3',count:'',minutes:'10',shuffleQuestions:true,shuffleOptions:true};
function disk(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
const state=()=>({session:makeSession(qs,config,1000,()=>.25),reading:{language:'bilingual',range:'1-20'},readMastered:[1],examMastered:[2],translationEnabled:true});
const note=()=>({...blankNote(1),strokes:[{surface:'question',target:'question-en-0',tool:'pen',color:'#b14343',width:4,points:[[.1,.2],[.3,.4]]}]});
test('full backup retains shuffled options, answers, score, deadlines, notes and independent mastery/settings',()=>{
 const s=state();s.session.answers[1]=['D'];const backup=makePortableBackup(s,[note()],qs),parsed=parsePortableBackup(JSON.stringify(backup),qs);assert.deepEqual(parsed,backup);assert.deepEqual(parsed.state,s);assert.equal(parsed.state.session.deadline,601000);assert.deepEqual(grade(parsed.state.session,qs),grade(s.session,qs));assert.deepEqual(parsed.notes,[note()].map(n=>({...n,updatedAt:parsed.notes[0].updatedAt})));
});
test('full backup accepts empty/new progress and completed exams without resetting time',()=>{
 const s=state();s.session=null;assert.equal(makePortableBackup(s,[],qs).state.session,null);s.session=makeSession(qs,config,1000);s.session.finishedAt=3000;assert.equal(makePortableBackup(s,[],qs).state.session.finishedAt,3000);
});
test('invalid final record rejects whole import before state can be applied',()=>{
 const b=makePortableBackup(state(),[note()],qs);
 for(const corrupt of [x=>x.notes[0].strokes[0].points.push([2,1]),x=>x.state.examMastered.push(99),x=>x.state.readMastered.push(1),x=>x.state.reading.range='90',x=>x.state.session.items[0].options=['A','A','B','C'],x=>x.state.session.deadline=0,x=>x.bank='other']){const c=structuredClone(b);corrupt(c);assert.throws(()=>parsePortableBackup(JSON.stringify(c),qs));}
 assert.throws(()=>parsePortableBackup('{oops',qs));
});
test('unavailable localStorage and IndexedDB still allow manual-backup memory operation',async()=>{
 const runtime=createPortableRuntime({getStorage:()=>{throw Error('blocked');}});runtime.storage.setItem('answer','D');assert.equal(runtime.storage.getItem('answer'),'D');runtime.storage.removeItem('answer');assert.equal(runtime.storage.getItem('answer'),null);
 const store=runtime.wrapNotesStore(()=>{throw Error('blocked');});assert.deepEqual(await store.readAll(),[]);await store.putMany([note()]);assert.equal((await store.readAll()).length,1);assert.equal(runtime.persistent,false);await store.replaceAll([]);assert.deepEqual(await store.readAll(),[]);
});
test('quota failure keeps latest changes exportable and marks persistence unavailable',async()=>{
 const backend=disk(),events=[],runtime=createPortableRuntime({getStorage:()=>backend,onChange:s=>events.push(s)});runtime.storage.setItem('one','old');backend.setItem=()=>{throw Error('quota');};runtime.storage.setItem('one','new');assert.equal(runtime.storage.getItem('one'),'new');assert.equal(runtime.status.kvPersistent,false);
 const driver={readAll:async()=>[note()],putMany:async()=>{throw Error('quota');},replaceAll:async()=>{throw Error('quota');}};
 const store=runtime.wrapNotesStore(()=>driver);await store.readAll();await store.putMany([{...note(),questionId:2}]);assert.deepEqual((await store.readAll()).map(n=>n.questionId),[1,2]);assert.equal(runtime.status.notesPersistent,false);assert.ok(events.length);
});
test('persistent adapter observes external storage writes and does not clear unrelated records',async()=>{
 const backend=disk(),runtime=createPortableRuntime({getStorage:()=>backend});backend.setItem('key','one');assert.equal(runtime.storage.getItem('key'),'one');backend.setItem('key','two');assert.equal(runtime.storage.getItem('key'),'two');backend.setItem('unrelated','keep');runtime.storage.removeItem('key');assert.equal(backend.getItem('unrelated'),'keep');
 let rows=[];const store=runtime.wrapNotesStore(()=>({readAll:async()=>rows,putMany:async n=>rows=n,replaceAll:async n=>rows=n}));await store.readAll();await store.replaceAll([note()]);assert.equal(runtime.persistent,true);assert.equal(rows.length,1);
});
