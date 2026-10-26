export const TRANSLATION_VERSION='mymemory-zhTW-v1';
export const MAX_TRANSLATION_BYTES=1800;
export const CACHE_TTL=30*24*60*60*1000;
export const normalizeText=text=>String(text??'').replace(/\s+/g,' ').trim();
export const byteLength=text=>new TextEncoder().encode(text).length;
export function cacheKey(text,context='') {return JSON.stringify([TRANSLATION_VERSION,normalizeText(text),normalizeText(context)]);}
export function splitText(text,limit=450){
 let remaining=normalizeText(text);const chunks=[];
 if(!remaining || !/[a-z]/i.test(remaining))throw new Error('請選取英文單字、片語或句子。');
 if(byteLength(remaining)>MAX_TRANSLATION_BYTES)throw new Error('這次選取的文字較長，請分段選取（每次最多約 1,800 個英文字元）。');
 while(remaining){
  let part='';for(const ch of remaining){if(byteLength(part+ch)>limit)break;part+=ch;}
  if(part.length<remaining.length){const boundary=part.lastIndexOf(' ');if(boundary>part.length/2)part=part.slice(0,boundary);}
  if(!part)throw new Error('無法處理這段文字，請重新選取。');
  chunks.push(part);remaining=remaining.slice(part.length).trimStart();
 }
 return chunks;
}
export function decodeTranslation(text){
 return text.replace(/&(amp|quot|apos|lt|gt|#39|#x27|#\d+|#x[0-9a-f]+);/gi,(match,key)=>{
  const common={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>','#39':"'",'#x27':"'"};
  if(common[key.toLowerCase()]!==undefined)return common[key.toLowerCase()];
  const code=key.toLowerCase().startsWith('#x')?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):match;
 });
}
export function parseTranslation(payload){
 const status=Number(payload?.responseStatus);
 const text=payload?.responseData?.translatedText;
 if(status===429 || payload?.quotaFinished===true || /USED ALL AVAILABLE FREE TRANSLATIONS|DAILY LIMIT/i.test(text||'')){
  const error=new Error('MyMemory 今日免費翻譯用量已達上限，請稍後再試，或使用下方 Google 翻譯。');error.code='quota';throw error;
 }
 if(status!==200 || typeof text!=='string' || !text.trim() || /^(MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE PAIR)/i.test(text))throw new Error('翻譯服務暫時無法提供結果，請稍後重試。');
 return decodeTranslation(text).trim();
}
export function createTranslationService({fetchImpl=globalThis.fetch,storage,now=Date.now,timeoutMs=15000}={}){
 try{if(storage===undefined)storage=globalThis.localStorage;}catch{storage=null;}
 const storeKey='ctia-translation-cache-v1',cache=new Map();
 let quotaUntil=0;
 try{quotaUntil=Number(storage?.getItem('ctia-translation-quota-until'))||0;}catch{}
 function quotaError(){const e=new Error('MyMemory 今日免費翻譯用量已達上限，請稍後再試，或使用下方 Google 翻譯。');e.code='quota';return e;}
 try{const rows=JSON.parse(storage?.getItem(storeKey)||'[]');if(Array.isArray(rows))for(const row of rows.slice(-100))if(Array.isArray(row)&&typeof row[0]==='string'&&typeof row[1]?.text==='string'&&Number.isFinite(row[1]?.at)&&now()-row[1].at<CACHE_TTL)cache.set(row[0],row[1]);}catch{}
 function cached(text,context=''){const entry=cache.get(cacheKey(text,context));if(entry&&now()-entry.at<CACHE_TTL)return entry.text;return null;}
 async function translate(text,context='',{signal}={}){
  const hit=cached(text,context);if(hit)return {text:hit,cached:true};
  if(now()<quotaUntil)throw quotaError();
  const chunks=splitText(text),controller=new AbortController();
  let timedOut=false;
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timeout=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  try{
   const parts=[];
   for(const chunk of chunks){
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',chunk);url.searchParams.set('langpair','en|zh-TW');
    const response=await fetchImpl(url.toString(),{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(response.status===429){const retry=Number(response.headers?.get('retry-after'));quotaUntil=now()+(retry>0?retry*1000:3600000);throw quotaError();}
    if(!response.ok)throw new Error('翻譯服務暫時無法連線，請稍後重試。');
    parts.push(parseTranslation(await response.json()));
   }
   if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
   const translated=parts.join(' '),key=cacheKey(text,context);
   if(normalizeText(translated).toLowerCase()===normalizeText(text).toLowerCase()&&!/[\u3400-\u9fff]/.test(translated))throw new Error('服務沒有提供這段文字的中文譯文，可使用下方 Google 翻譯查詢。');cache.delete(key);cache.set(key,{text:translated,at:now()});
   while(cache.size>100)cache.delete(cache.keys().next().value);
   try{storage?.setItem(storeKey,JSON.stringify([...cache]));}catch{}
   return {text:translated,cached:false};
  }catch(error){
   if(error.code==='quota'){quotaUntil=Math.max(quotaUntil,now()+3600000);try{storage?.setItem('ctia-translation-quota-until',String(quotaUntil));}catch{}}
   if(timedOut)throw new Error('翻譯等候超過 15 秒，請檢查網路後重試。');
   if(error.name==='AbortError')throw error;
   if(error instanceof TypeError)throw new Error('目前無法連線至翻譯服務，請檢查網路，或使用下方 Google 翻譯。');
   throw error;
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
 }
 return {translate,cached};
}
