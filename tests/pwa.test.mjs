import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function worker({failInstall=false}={}){
 const handlers={},buckets=new Map([['ctia-practice-shell-old',new Map()],['unrelated-cache',new Map()]]),deleted=[];let cacheName,claimed=false,skipped=false,network=0;
 const cache={addAll:async requests=>{for(const request of requests){const path=new URL(request.url).pathname.replace('/ctia-practice/','');assert.ok(path===''||fs.existsSync(new URL('../'+path,import.meta.url)),path);buckets.get(cacheName).set(request.url,{url:request.url,body:'cached'});}if(failInstall)throw Error('interrupted');},match:async key=>buckets.get(cacheName)?.get(typeof key==='string'?key:key.url)};
 const self={location:{href:'https://example.com/ctia-practice/sw.js'},clients:{claim:async()=>claimed=true},skipWaiting:()=>skipped=true,addEventListener:(name,handler)=>handlers[name]=handler};
 const caches={open:async name=>{cacheName=name;if(!buckets.has(name))buckets.set(name,new Map());return cache;},keys:async()=>[...buckets.keys()],delete:async name=>{deleted.push(name);return buckets.delete(name);}};
 vm.runInNewContext(source,{self,caches,URL,Request,Promise,Set,fetch:async()=>{network++;throw Error('offline');}});
 async function lifecycle(name){let result;handlers[name]({waitUntil:p=>result=p});await result;}
 async function request(url,{method='GET',mode='navigate'}={}){let result;handlers.fetch({request:{url,method,mode},respondWith:p=>result=p});return result===undefined?undefined:await result;}
 async function message(type,extra={}){let result,response;handlers.message({data:{type,...extra},ports:[{postMessage:x=>response=x}],waitUntil:p=>result=p});await result;return response;}
 return {lifecycle,request,message,buckets,deleted,get network(){return network;},get claimed(){return claimed;},get skipped(){return skipped;}};
}
test('offline install contains every app dependency, manifest and icon; query strings work without network',async()=>{
 const w=worker();await w.lifecycle('install');const status=await w.message('CHECK_CACHE');assert.equal(status.complete,true);assert.equal(status.count,status.total);assert.ok(status.total>=20);
 for(const file of ['app.js?v=old','questions.json?v=old','portable/backup.js?v=mobile','reading-notes.js?v=mobile','icons/app-192.png']){const response=await w.request('https://example.com/ctia-practice/'+file,{mode:'cors'});assert.equal(response.body,'cached');}
 const page=await w.request('https://example.com/ctia-practice/?app=1');assert.ok(page.url.endsWith('index.html'));assert.equal(w.network,0);
});
test('failed installation discards incomplete cache and never activates an incomplete offline app',async()=>{const w=worker({failInstall:true});await assert.rejects(()=>w.lifecycle('install'));assert.ok(w.deleted.some(name=>name.includes('mobile-v1')));assert.equal(w.claimed,false);assert.ok(w.buckets.has('ctia-practice-shell-old'));});
test('activation deletes only old CTIA shell caches, not unrelated caches or user records',async()=>{const w=worker();await w.lifecycle('install');await w.lifecycle('activate');assert.equal(w.claimed,true);assert.ok(!w.buckets.has('ctia-practice-shell-old'));assert.ok(w.buckets.has('unrelated-cache'));});
test('translation APIs, unrelated sites, POSTs and worker updates are not intercepted',async()=>{const w=worker();await w.lifecycle('install');for(const url of ['https://api.mymemory.translated.net/get?q=hello','https://example.com/other-project/','https://example.com/ctia-practice/sw.js'])assert.equal(await w.request(url,{mode:'cors'}),undefined);assert.equal(await w.request('https://example.com/ctia-practice/app.js',{method:'POST'}),undefined);});
test('new worker is activated only after explicit update message',async()=>{const w=worker();await w.lifecycle('install');assert.equal(w.skipped,false);await w.message('ACTIVATE_UPDATE');assert.equal(w.skipped,true);});
test('manifest and iOS links stay inside repo scope and preserve standalone display',()=>{const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url)));assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');assert.ok(manifest.start_url.startsWith('./'));for(const icon of manifest.icons)assert.ok(fs.existsSync(new URL('../'+icon.src,import.meta.url)));const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(html.includes('apple-touch-icon'));assert.equal((html.match(/id="portable-export"/g)||[]).length,1);});

test('evicted offline cache is reported incomplete and can be repaired while online',async()=>{const w=worker();await w.lifecycle('install');for(const [name,bucket] of w.buckets)if(name.includes('mobile-v1'))bucket.clear();assert.equal((await w.message('CHECK_CACHE')).complete,false);assert.equal((await w.message('CHECK_CACHE',{repair:true})).complete,true);});
