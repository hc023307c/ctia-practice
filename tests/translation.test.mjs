import test from 'node:test';
import assert from 'node:assert/strict';
import {splitText,byteLength,parseTranslation,createTranslationService,cacheKey,CACHE_TTL} from '../translation-service.js';
const ok=text=>({ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:text}})});
function memory(){const entries=new Map();return {getItem:k=>entries.get(k)||null,setItem:(k,v)=>entries.set(k,v)};}
test('translation supports words, phrases and sentences',()=>{
 for(const text of ['aim','threat actor','He steals confidential data for profit.'])assert.deepEqual(splitText(text),[text]);
});
test('long text split preserves normalized content and UTF-8 byte limit',()=>{
 const text=('The attacker’s method involves data collection and analysis. ').repeat(20).trim();const parts=splitText(text);assert.ok(parts.length>1);parts.forEach(p=>assert.ok(byteLength(p)<=450));assert.equal(parts.join(' '),text);
});
test('reject empty, non-English or overlong input without truncating',()=>{
 for(const text of ['','中文內容','a'.repeat(1801)])assert.throws(()=>splitText(text));
});
test('quota text never displayed as a successful translation',()=>{
 for(const payload of [{responseStatus:429,responseData:{translatedText:'out of quota'}},{responseStatus:200,responseData:{translatedText:'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.'}},{responseStatus:200,quotaFinished:true,responseData:{translatedText:'anything'}}])assert.throws(()=>parseTranslation(payload),e=>e.code==='quota');
 assert.throws(()=>parseTranslation({responseStatus:403,responseData:{translatedText:'Forbidden'}}));
});
test('HTML entities decoded as data',()=>assert.equal(parseTranslation({responseStatus:200,responseData:{translatedText:'目的 &amp; 目標 &#39; &#x4e2d; &lt;b&gt;'}}),"目的 & 目標 ' 中 <b>"));
test('successful calls cache and use no credentials or personal data',async()=>{
 let calls=0;const storage=memory();const service=createTranslationService({storage,fetchImpl:async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.hostname,'api.mymemory.translated.net');assert.equal(u.searchParams.get('langpair'),'en|zh-TW');assert.equal(u.searchParams.get('q'),'aim');assert.equal(u.searchParams.get('de'),null);assert.equal(options.credentials,'omit');return ok('目的');}});
 assert.deepEqual(await service.translate('aim','whose aim is to attack'),{text:'目的',cached:false});
 assert.deepEqual(await service.translate('aim','whose aim is to attack'),{text:'目的',cached:true});assert.equal(calls,1);
 const reopened=createTranslationService({storage,fetchImpl:()=>{throw Error('must use persisted cache');}});assert.equal((await reopened.translate('aim','whose aim is to attack')).cached,true);
});
test('context distinguishes cache entries; expired data not reused',async()=>{
 assert.notEqual(cacheKey('aim','first sentence'),cacheKey('aim','another sentence'));
 const storage=memory();const first=createTranslationService({storage,now:()=>100,fetchImpl:async()=>ok('目的')});await first.translate('aim');
 const later=createTranslationService({storage,now:()=>CACHE_TTL+101,fetchImpl:async()=>ok('目標')});assert.equal(later.cached('aim'),null);assert.equal((await later.translate('aim')).text,'目標');
});
test('HTTP quota error is explicit and never cached',async()=>{
 const s=createTranslationService({storage:memory(),fetchImpl:async()=>({ok:false,status:429})});await assert.rejects(()=>s.translate('aim'),e=>e.code==='quota');assert.equal(s.cached('aim'),null);
});
test('cancellation prevents stale result from entering cache',async()=>{
 const controller=new AbortController();const s=createTranslationService({storage:memory(),fetchImpl:async()=>{controller.abort();return ok('過時結果');}});await assert.rejects(()=>s.translate('aim','',{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(s.cached('aim'),null);
});
test('network failure provides actionable error',async()=>{
 const s=createTranslationService({storage:memory(),fetchImpl:async()=>{throw new TypeError('Failed to fetch');}});await assert.rejects(()=>s.translate('aim'),/無法連線/);
});
test('timeout aborts requests and keeps cache clean',async()=>{
 const s=createTranslationService({storage:memory(),timeoutMs:5,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))))});await assert.rejects(()=>s.translate('aim'),/等候超過/);assert.equal(s.cached('aim'),null);
});
test('quota response stops subsequent external requests but permits cached lookups',async()=>{
 let count=0;const s=createTranslationService({storage:memory(),fetchImpl:async()=>{count++;return {ok:false,status:429};}});
 await assert.rejects(()=>s.translate('aim'),e=>e.code==='quota');await assert.rejects(()=>s.translate('hacker'),e=>e.code==='quota');assert.equal(count,1);
});
test('unchanged English is not cached or mislabeled as a Chinese translation',async()=>{
 const s=createTranslationService({storage:memory(),fetchImpl:async()=>ok('aim')});await assert.rejects(()=>s.translate('aim'),/沒有提供/);assert.equal(s.cached('aim'),null);
});
