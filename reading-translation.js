import {createTranslationService,normalizeText,cacheKey,splitText} from './translation-service.js?v=20261026-select-translate';
export function createReadingTranslator({root,isReading,questionFor,service=createTranslationService()}){
 const panel=document.createElement('section');panel.id='selection-translation';panel.className='translation-panel';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','translation-title');
 panel.innerHTML=`<div class="translation-heading"><div><span class="translation-eyebrow">ENGLISH → 繁體中文</span><h2 id="translation-title">選字翻譯</h2></div><button type="button" class="secondary small" data-close aria-label="關閉翻譯小卡">關閉 ×</button></div><p class="translation-selected" lang="en"></p><div class="translation-status" role="status" aria-live="polite"></div><p class="translation-result" lang="zh-Hant"></p><p class="translation-hint"></p><details class="translation-context"><summary>查看所在原文</summary><p lang="en"></p><button type="button" class="secondary small" data-sentence>翻譯這段原文</button></details><div class="translation-actions"><button type="button" class="secondary small" data-retry hidden>重新翻譯</button><a data-google target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">用 Google 翻譯開啟 ↗</a></div><p class="translation-credit">線上服務：MyMemory · 一般機器譯文，未必符合本題語境。</p>`;
 document.body.append(panel);
 const find=s=>panel.querySelector(s),sourceEl=find('.translation-selected'),resultEl=find('.translation-result'),statusEl=find('.translation-status'),hintEl=find('.translation-hint');
 let enabled=true,pending=null,settleTimer,controller,requestId=0,current=null,lastKey='',suppressed='',dragging=false,panelPointer=false;
 try{enabled=localStorage.getItem('ctia-translation-enabled')!=='false';}catch{}
 const abort=()=>{requestId++;controller?.abort();controller=null;};
 function close({suppress=true}={}){clearTimeout(settleTimer);abort();if(suppress&&current)suppressed=current.key;current=null;lastKey='';pending=null;panel.hidden=true;document.body.classList.remove('translation-open');}
 function readingSource(node){const el=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;const english=el?.closest('#read-questions .qtext[lang="en"], #read-questions .option p[lang="en"]');return english&&root.contains(english)?english:null;}
 function selected(){
  if(!enabled||!isReading())return null;
  const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return null;
  const range=selection.getRangeAt(0),start=readingSource(range.startContainer),end=readingSource(range.endContainer);
  if(!start||start!==end)return null;
  const text=normalizeText(selection.toString());if(!text||!/[a-z]/i.test(text))return null;
  const article=start.closest('.question'),id=Number(article?.id?.replace('q-',''));if(!Number.isInteger(id)||!questionFor(id))return null;
  const context=normalizeText(start.textContent);return {text,context,id,key:cacheKey(text,context)};
 }
 function sourceTextFor(c){
  // Keep the source context visible without claiming the external API reasons over it.
  return c.context;
 }
 async function lookup(candidate,{force=false}={}){
  if(!enabled||!isReading())return;
  if(!force&&candidate.key===lastKey&&!panel.hidden)return;
  clearTimeout(settleTimer);abort();const token=requestId;controller=new AbortController();current=candidate;lastKey=candidate.key;
  panel.hidden=false;document.body.classList.add('translation-open');sourceEl.textContent=candidate.text;resultEl.textContent='';statusEl.textContent='翻譯中……';statusEl.classList.remove('translation-error');hintEl.textContent=`原始題號 ${candidate.id} · 單字有多義時，可展開原文翻譯整句輔助理解。`;
  const contextDetails=find('.translation-context');contextDetails.open=false;contextDetails.hidden=candidate.context===candidate.text;find('.translation-context p').textContent=sourceTextFor(candidate);
  find('[data-retry]').hidden=true;
  const external=new URL('https://translate.google.com/');external.searchParams.set('sl','en');external.searchParams.set('tl','zh-TW');external.searchParams.set('text',candidate.text);external.searchParams.set('op','translate');find('[data-google]').href=external.toString();
  try{
   splitText(candidate.text);
   const result=await service.translate(candidate.text,candidate.context,{signal:controller.signal});
   if(token!==requestId||!isReading()||!enabled||panel.hidden)return;
   resultEl.textContent=result.text;statusEl.textContent=result.cached?'已顯示快取譯文':'線上譯文';
  }catch(error){
   if(token!==requestId||error.name==='AbortError'||!isReading()||panel.hidden)return;
   statusEl.textContent=error.message;statusEl.classList.add('translation-error');find('[data-retry]').hidden=error.code==='quota';
  }
 }
 function schedule(){
  if(panelPointer||!enabled||!isReading())return;
  const candidate=selected();clearTimeout(settleTimer);
  if(!candidate){pending=null;return;}
  if(candidate.key===suppressed||candidate.key===lastKey)return;
  if(current&&current.key!==candidate.key){abort();current=null;lastKey='';panel.hidden=true;document.body.classList.remove('translation-open');}
  pending=candidate;
  if(!dragging)settleTimer=setTimeout(()=>{const fresh=selected();if(fresh&&pending&&fresh.key===pending.key)lookup(fresh);},650);
 }
 function startPointer(event){
  panelPointer=panel.contains(event.target);if(panelPointer)return;
  if(!isReading())return;
  if(readingSource(event.target)){dragging=true;suppressed='';}else if(!panel.hidden){close();}
 }
 function endPointer(){dragging=false;if(!panelPointer)schedule();panelPointer=false;}
 document.addEventListener('selectionchange',schedule);
 document.addEventListener('pointerdown',startPointer,{passive:true});
 document.addEventListener('pointerup',endPointer,{passive:true});
 document.addEventListener('pointercancel',endPointer,{passive:true});
 // Touch events also cover native selection-handle releases on mobile Safari.
 document.addEventListener('touchend',()=>{if(!panelPointer){dragging=false;schedule();}},{passive:true});
 document.addEventListener('keyup',event=>{if(event.key==='Escape')close();else schedule();});
 find('[data-close]').onclick=()=>close();
 find('[data-retry]').onclick=()=>{if(current)lookup(current,{force:true});};
 find('[data-sentence]').onclick=()=>{if(current){const c={...current,text:current.context};c.key=cacheKey(c.text,c.context);lookup(c,{force:true});}};
 return {
  reset(){close({suppress:false});suppressed='';dragging=false;},
  enabled:()=>enabled,
  setEnabled(value){enabled=!!value;try{localStorage.setItem('ctia-translation-enabled',String(enabled));}catch{}if(!enabled)close();},
 };
}
