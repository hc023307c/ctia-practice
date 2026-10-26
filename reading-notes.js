import {blankNote,validateNote,parseBackup,makeBackup,normalizedPoint,drawStroke,INK_COLORS,MAX_BACKUP_BYTES} from './notes-data.js?v=20261026-overlay';
import {createNotesStore} from './notes-store.js?v=20261026-overlay';
export function createReadingNotes({root,questionIds,notify,confirmAction,closeTranslation}){
 const store=createNotesStore(),records=new Map(),dirty=new Set(),revisions=new Map(),errors=new Map(),editors=new Map(),expanded=new Set();
 let ready=false,storageError='',loadPromise,saveChain=Promise.resolve(),generation=0;
 const allowed=()=>questionIds();
 function load(){
  if(loadPromise)return loadPromise;
  loadPromise=store.readAll().then(rows=>{
   for(const row of rows){try{records.set(row.questionId,validateNote(row,allowed()));}catch{storageError='部分舊筆記格式無法讀取，請保留原有備份。';}}
   ready=true;
  }).catch(()=>{storageError='無法開啟本機筆記儲存。請使用一般瀏覽模式，並確認瀏覽器允許儲存網站資料。';ready=false;});
  return loadPromise;
 }
 function get(id){if(!records.has(id))records.set(id,blankNote(id));return records.get(id);}
 function updateIndicator(id){
  const card=root.querySelector(`#q-${id}`);if(!card)return;
  const strokes=records.get(id)?.strokes||[],has=strokes.some(s=>s.tool==='pen'&&s.surface==='question'),legacy=strokes.some(s=>!s.surface);
  const status=card.querySelector('[data-note-indicator]');if(status)status.textContent=has?'已有畫線':legacy?'舊筆記可匯出':'';
  const editor=editors.get(id);if(editor){editor.status.textContent=errors.get(id)|| (dirty.has(id)?'尚有變更，正在儲存……':has?'已儲存於此裝置':legacy?'舊手寫板筆記已保留，可匯出備份；不會套在題目上。':'尚無畫線');editor.status.classList.toggle('error',errors.has(id));editor.updateButtons();}
 }
 function changed(id){get(id).updatedAt=Date.now();revisions.set(id,(revisions.get(id)||0)+1);dirty.add(id);errors.delete(id);updateIndicator(id);}
 function save(id){
  if(!dirty.has(id))return saveChain;
  const note=structuredClone(get(id)),revision=revisions.get(id);
  saveChain=saveChain.catch(()=>{}).then(()=>store.putMany([note])).then(()=>{if(revisions.get(id)===revision){dirty.delete(id);errors.delete(id);}updateIndicator(id);}).catch(()=>{errors.set(id,'未儲存：請保留此頁並匯出筆記備份。');updateIndicator(id);});
  return saveChain;
 }
 function flush(){for(const editor of editors.values())editor.finish();for(const id of dirty)save(id);return saveChain;}
 function unmount(){
  generation++;
  for(const editor of editors.values())editor.destroy();editors.clear();flush();
 }
 function makeEditor(id,slot){
  const card=slot.closest('.question'),content=card.querySelector('.note-content');
  const host=document.createElement('section');host.className='note-editor';host.setAttribute('aria-label',`第 ${id} 題手寫筆記`);
  host.innerHTML=`<div class="note-toolbar" role="group" aria-label="筆記工具"><div class="note-tool-group"><button type="button" class="small active" data-tool="pen" aria-pressed="true">筆</button><button type="button" class="secondary small" data-tool="eraser" aria-pressed="false">橡皮擦</button><button type="button" class="secondary small" data-scroll aria-pressed="false">捲動</button></div><div class="note-tool-group note-colors" aria-label="筆色">${INK_COLORS.map((color,i)=>`<button type="button" class="note-color ${i===0?'active':''}" data-color="${color}" style="--ink:${color}" aria-label="${['深綠色筆','藍色筆','紅色筆'][i]}" aria-pressed="${i===0}"></button>`).join('')}</div><label class="note-width">粗細 <select aria-label="筆畫粗細"><option value="2">細</option><option value="4" selected>中</option><option value="8">粗</option></select></label><div class="note-tool-group"><button type="button" class="secondary small" data-undo>復原</button><button type="button" class="secondary small" data-redo>重做</button><button type="button" class="quiet small danger" data-clear>清空</button></div></div><div class="note-editor-footer"><span class="note-save-status" role="status"></span><span>直接在下方題目畫線；取消勾選可選字翻譯。捲動時請拖曳題卡外側，或切換「捲動」。</span></div>`;
  slot.append(host);
  const find=s=>host.querySelector(s),status=find('.note-save-status'),lifecycle=new AbortController(),surfaces=[];
  let canvas=null,ctx=null,activeTarget=null;
  const blocks=[...content.querySelectorAll('[data-ink-target]')];
  for(const block of blocks){const layer=document.createElement('canvas');layer.className='note-canvas note-overlay';layer.setAttribute('aria-label',`第 ${id} 題 ${block.dataset.inkTarget} 畫線區`);block.append(layer);surfaces.push({block,canvas:layer,ctx:layer.getContext('2d'),target:block.dataset.inkTarget});}
  let tool='pen',color=INK_COLORS[0],width=4,mode='write',activeStroke=null,pointerId=null,remainingPoints=150000,redo=[],undo=get(id).strokes.filter(s=>s.surface==='question').map(stroke=>({type:'stroke',stroke})),saveTimer,raf=0,destroyed=false;
  function redraw(){
   for(const surface of surfaces){
    const {canvas,ctx,target}=surface,rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height||!ctx)continue;
    if(rect.bottom < -600||rect.top > window.innerHeight+600){if(canvas.width!==1){canvas.width=1;canvas.height=1;}continue;}
    const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.clearRect(0,0,w,h);for(const stroke of get(id).strokes)if(stroke.surface==='question'&&stroke.target===target)drawStroke(ctx,stroke,w,h);
    if(activeStroke&&activeTarget===target)drawStroke(ctx,activeStroke,w,h);
   }
  }
  function resize(){cancelAnimationFrame(raf);raf=requestAnimationFrame(redraw);}
  function updateButtons(){find('[data-undo]').disabled=!undo.length;find('[data-redo]').disabled=!redo.length;find('[data-clear]').disabled=!get(id).strokes.some(s=>s.surface==='question');}
  function finish(){
   if(!activeStroke)return;
   get(id).strokes.push(activeStroke);undo.push({type:'stroke',stroke:activeStroke});activeStroke=null;redo=[];const oldPointer=pointerId;pointerId=null;try{if(oldPointer!==null&&canvas.hasPointerCapture(oldPointer))canvas.releasePointerCapture(oldPointer);}catch{}
   changed(id);clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(id),200);redraw();
  }
  function point(event){return normalizedPoint(event.clientX,event.clientY,canvas.getBoundingClientRect());}
  for(const surface of surfaces){
  surface.canvas.addEventListener('pointerdown',e=>{
   if(mode!=='write'||pointerId!==null||(e.pointerType==='mouse'&&e.button!==0))return;
   canvas=surface.canvas;ctx=surface.ctx;activeTarget=surface.target;if(!ctx)return;
   remainingPoints=150000-get(id).strokes.reduce((sum,s)=>sum+s.points.length,0);
   if(get(id).strokes.length>=5000||remainingPoints<1){notify('本題筆畫較多，請先匯出備份，再清理部分筆畫。');return;}
   e.preventDefault();closeTranslation();pointerId=e.pointerId;activeStroke={surface:'question',target:activeTarget,tool,color,width:tool==='eraser'?Math.max(18,width*4):width,points:[point(e)]};try{canvas.setPointerCapture(pointerId);}catch{}redraw();
  },{signal:lifecycle.signal});
  surface.canvas.addEventListener('pointermove',e=>{
   if(e.pointerId!==pointerId||!activeStroke)return;e.preventDefault();
   const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
   for(const item of events.length?events:[e]){const p=point(item),last=activeStroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>.0005)activeStroke.points.push(p);if(activeStroke.points.length>=Math.min(20000,remainingPoints)){finish();break;}}
   resize();
  },{signal:lifecycle.signal});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])surface.canvas.addEventListener(name,e=>{if(e.pointerId===pointerId)finish();},{signal:lifecycle.signal});
  }
  function setEnabled(enabled){finish();host.hidden=!enabled;slot.hidden=!enabled;content.classList.toggle('ink-writing',enabled&&mode==='write');closeTranslation();resize();}
  find('[data-scroll]').onclick=()=>{finish();mode=mode==='write'?'scroll':'write';content.classList.toggle('ink-writing',mode==='write');find('[data-scroll]').classList.toggle('active',mode==='scroll');find('[data-scroll]').setAttribute('aria-pressed',String(mode==='scroll'));find('[data-scroll]').textContent=mode==='scroll'?'返回書寫':'捲動';};
  host.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{finish();tool=button.dataset.tool;host.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});});
  host.querySelectorAll('[data-color]').forEach(button=>button.onclick=()=>{color=button.dataset.color;host.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});});
  find('select').onchange=e=>width=Number(e.target.value);
  find('[data-undo]').onclick=()=>{finish();const action=undo.pop();if(action){if(action.type==='clear')get(id).strokes=[...action.strokes];else get(id).strokes=get(id).strokes.filter(s=>s!==action.stroke);redo.push(action);changed(id);save(id);redraw();}};
  find('[data-redo]').onclick=()=>{finish();const action=redo.pop();if(action){if(action.type==='clear')get(id).strokes=get(id).strokes.filter(s=>s.surface!=='question');else get(id).strokes.push(action.stroke);undo.push(action);changed(id);save(id);redraw();}};
  find('[data-clear]').onclick=async()=>{finish();if(await confirmAction('清空本題畫線？',`只會清空第 ${id} 題的題目畫線；其他題和舊手寫板筆記會保留。清空後仍可按「復原」還原。`)){
   if(destroyed)return;undo.push({type:'clear',strokes:[...get(id).strokes]});redo=[];get(id).strokes=get(id).strokes.filter(s=>s.surface!=='question');changed(id);save(id);redraw();
  }};
  const observer=new ResizeObserver(resize),visibility=new IntersectionObserver(resize,{rootMargin:'600px'});for(const surface of surfaces){observer.observe(surface.block);visibility.observe(surface.block);}
  const editor={host,slot,status,resize,finish,updateButtons,setEnabled,get destroyed(){return destroyed;},destroy(){finish();destroyed=true;clearTimeout(saveTimer);save(id);observer.disconnect();visibility.disconnect();cancelAnimationFrame(raf);lifecycle.abort();host.remove();for(const surface of surfaces)surface.canvas.remove();content.classList.remove('ink-writing');}};
  redraw();updateIndicator(id);return editor;
 }
 async function exportNotes(){
  await load();if(!ready){notify(storageError);return;}await flush();
  let backup;try{backup=makeBackup([...records.values()],allowed());parseBackup(JSON.stringify(backup),allowed());}catch(error){notify(error.message||'無法匯出筆記。');return;}if(!backup.notes.length){notify('目前沒有可匯出的手寫筆記。');return;}
  const blob=new Blob([JSON.stringify(backup)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`CTIA_notes_${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify(`已匯出 ${backup.notes.length} 題筆記，請保存下載檔案。`);
 }
 async function importNotes(file){
  if(!file)return;await load();if(!ready){notify(storageError);return;}
  try{
   if(file.size>MAX_BACKUP_BYTES)throw new Error('備份檔案超過 25 MB，無法匯入。');
   const notes=parseBackup(await file.text(),allowed());if(!notes.length)throw new Error('這份備份沒有筆記。');
   const existing=notes.filter(n=>records.get(n.questionId)?.strokes.length).length;
   if(!await confirmAction('匯入手寫筆記',`備份包含 ${notes.length} 題筆記，會覆寫其中 ${existing} 題現有筆記；未包含的題目會保留。確定匯入？`))return;
   await flush();await store.putMany(notes);
   for(const note of notes){records.set(note.questionId,note);dirty.delete(note.questionId);errors.delete(note.questionId);revisions.set(note.questionId,(revisions.get(note.questionId)||0)+1);const editor=editors.get(note.questionId);if(editor){editor.destroy();editors.delete(note.questionId);const checkbox=root.querySelector(`#note-toggle-${note.questionId}`);const replacement=makeEditor(note.questionId,editor.slot);editors.set(note.questionId,replacement);replacement.setEnabled(!!checkbox?.checked);}updateIndicator(note.questionId);}
   notify(`已匯入 ${notes.length} 題筆記。`);
  }catch(error){notify(error.message||'匯入失敗，未修改筆記。');}
 }
 function mount(){
  const currentGeneration=generation;
  root.querySelector('[data-notes-export]')?.addEventListener('click',exportNotes);
  const input=root.querySelector('[data-notes-file]');root.querySelector('[data-notes-import]')?.addEventListener('click',()=>input?.click());if(input)input.onchange=()=>{importNotes(input.files?.[0]);input.value='';};
  load().then(()=>{
   if(currentGeneration!==generation)return;
   const message=root.querySelector('[data-notes-message]');if(message)message.textContent=storageError||'筆記只儲存在此裝置的瀏覽器，請定期匯出備份。';
   root.querySelectorAll('[data-note-toggle]').forEach(checkbox=>{
    const id=Number(checkbox.dataset.noteToggle),slot=root.querySelector(`#note-slot-${id}`);checkbox.disabled=!ready;
    if(ready){const editor=makeEditor(id,slot);editors.set(id,editor);checkbox.checked=expanded.has(id);editor.setEnabled(checkbox.checked);updateIndicator(id);}
    checkbox.onchange=()=>{if(checkbox.checked)expanded.add(id);else expanded.delete(id);editors.get(id)?.setEnabled(checkbox.checked);updateIndicator(id);};

   });
  });
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
 window.addEventListener('pagehide',flush);
 return {mount,unmount,flush};
}
