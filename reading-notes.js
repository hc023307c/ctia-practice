import {blankNote,validateNote,parseBackup,makeBackup,normalizedPoint,drawStroke,INK_COLORS,MAX_BACKUP_BYTES} from './notes-data.js?v=20261026-notes';
import {createNotesStore} from './notes-store.js?v=20261026-notes';
export function createReadingNotes({root,questionIds,notify,confirmAction,closeTranslation}){
 const store=createNotesStore(),records=new Map(),dirty=new Set(),revisions=new Map(),errors=new Map(),editors=new Map(),expanded=new Set();
 let ready=false,storageError='',loadPromise,saveChain=Promise.resolve(),generation=0,activeModalEditor=null;
 const dialog=document.createElement('dialog');dialog.id='notes-dialog';dialog.className='notes-dialog';dialog.innerHTML='<div class="notes-dialog-head"><h2>放大手寫筆記</h2><button type="button" class="secondary small" data-close-note>完成並返回 ×</button></div><div class="notes-dialog-body"></div>';
 document.body.append(dialog);
 dialog.querySelector('[data-close-note]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{const editor=activeModalEditor;activeModalEditor=null;if(editor&&!editor.destroyed){if(editor.slot.isConnected)editor.slot.append(editor.host);editor.resize();}document.body.classList.remove('notes-modal-open');});
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
  const has=!!records.get(id)?.strokes.some(s=>s.tool==='pen');
  const status=card.querySelector('[data-note-indicator]');if(status)status.textContent=has?'已有筆記':'';
  const editor=editors.get(id);if(editor){editor.status.textContent=errors.get(id)|| (dirty.has(id)?'尚有變更，正在儲存……':has?'已儲存於此裝置':'尚無筆記');editor.status.classList.toggle('error',errors.has(id));editor.updateButtons();}
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
  if(dialog.open)dialog.close();activeModalEditor=null;document.body.classList.remove('notes-modal-open');
  for(const editor of editors.values())editor.destroy();editors.clear();flush();
 }
 function makeEditor(id,slot){
  const host=document.createElement('section');host.className='note-editor';host.setAttribute('aria-label',`第 ${id} 題手寫筆記`);
  host.innerHTML=`<div class="note-toolbar" role="group" aria-label="筆記工具"><div class="note-tool-group"><button type="button" class="small active" data-tool="pen" aria-pressed="true">筆</button><button type="button" class="secondary small" data-tool="eraser" aria-pressed="false">橡皮擦</button><button type="button" class="secondary small" data-scroll aria-pressed="false">捲動</button></div><div class="note-tool-group note-colors" aria-label="筆色">${INK_COLORS.map((color,i)=>`<button type="button" class="note-color ${i===0?'active':''}" data-color="${color}" style="--ink:${color}" aria-label="${['深綠色筆','藍色筆','紅色筆'][i]}" aria-pressed="${i===0}"></button>`).join('')}</div><label class="note-width">粗細 <select aria-label="筆畫粗細"><option value="2">細</option><option value="4" selected>中</option><option value="8">粗</option></select></label><div class="note-tool-group"><button type="button" class="secondary small" data-undo>復原</button><button type="button" class="secondary small" data-redo>重做</button><button type="button" class="secondary small" data-expand>放大書寫 ↗</button><button type="button" class="quiet small danger" data-clear>清空</button></div></div><div class="note-canvas-frame"><canvas class="note-canvas" aria-label="第 ${id} 題手寫畫布">此瀏覽器無法顯示手寫畫布。</canvas></div><div class="note-editor-footer"><span class="note-save-status" role="status"></span><span>書寫區可用手指、筆或滑鼠；要滑動此區請切換「捲動」。</span></div>`;
  slot.append(host);
  const find=s=>host.querySelector(s),canvas=find('canvas'),ctx=canvas.getContext('2d'),status=find('.note-save-status'),lifecycle=new AbortController();
  let tool='pen',color=INK_COLORS[0],width=4,mode='write',activeStroke=null,pointerId=null,remainingPoints=150000,redo=[],undo=get(id).strokes.map(stroke=>({type:'stroke',stroke})),saveTimer,raf=0,destroyed=false;
  function redraw(){
   const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
   const ratio=Math.min(window.devicePixelRatio||1,3),w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   ctx.clearRect(0,0,w,h);for(const stroke of get(id).strokes)drawStroke(ctx,stroke,w,h);if(activeStroke)drawStroke(ctx,activeStroke,w,h);
  }
  function resize(){cancelAnimationFrame(raf);raf=requestAnimationFrame(redraw);}
  function updateButtons(){find('[data-undo]').disabled=!undo.length;find('[data-redo]').disabled=!redo.length;find('[data-clear]').disabled=!get(id).strokes.length;}
  function finish(){
   if(!activeStroke)return;
   get(id).strokes.push(activeStroke);undo.push({type:'stroke',stroke:activeStroke});activeStroke=null;redo=[];const oldPointer=pointerId;pointerId=null;try{if(oldPointer!==null&&canvas.hasPointerCapture(oldPointer))canvas.releasePointerCapture(oldPointer);}catch{}
   changed(id);clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(id),200);redraw();
  }
  function point(event){return normalizedPoint(event.clientX,event.clientY,canvas.getBoundingClientRect());}
  canvas.addEventListener('pointerdown',e=>{
   if(mode!=='write'||pointerId!==null||(e.pointerType==='mouse'&&e.button!==0))return;
   if(!ctx)return;
   remainingPoints=150000-get(id).strokes.reduce((sum,s)=>sum+s.points.length,0);
   if(get(id).strokes.length>=5000||remainingPoints<1){notify('本題筆畫較多，請先匯出備份，再清理部分筆畫。');return;}
   e.preventDefault();closeTranslation();pointerId=e.pointerId;activeStroke={tool,color,width:tool==='eraser'?Math.max(18,width*4):width,points:[point(e)]};try{canvas.setPointerCapture(pointerId);}catch{}redraw();
  },{signal:lifecycle.signal});
  canvas.addEventListener('pointermove',e=>{
   if(e.pointerId!==pointerId||!activeStroke)return;e.preventDefault();
   const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
   for(const item of events.length?events:[e]){const p=point(item),last=activeStroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>.0005)activeStroke.points.push(p);if(activeStroke.points.length>=Math.min(20000,remainingPoints)){finish();break;}}
   resize();
  },{signal:lifecycle.signal});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(e.pointerId===pointerId)finish();},{signal:lifecycle.signal});
  find('[data-scroll]').onclick=()=>{finish();mode=mode==='write'?'scroll':'write';canvas.classList.toggle('scroll-mode',mode==='scroll');find('[data-scroll]').classList.toggle('active',mode==='scroll');find('[data-scroll]').setAttribute('aria-pressed',String(mode==='scroll'));find('[data-scroll]').textContent=mode==='scroll'?'返回書寫':'捲動';};
  host.querySelectorAll('[data-tool]').forEach(button=>button.onclick=()=>{finish();tool=button.dataset.tool;host.querySelectorAll('[data-tool]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});});
  host.querySelectorAll('[data-color]').forEach(button=>button.onclick=()=>{color=button.dataset.color;host.querySelectorAll('[data-color]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});});
  find('select').onchange=e=>width=Number(e.target.value);
  find('[data-undo]').onclick=()=>{finish();const action=undo.pop();if(action){if(action.type==='clear')get(id).strokes=[...action.strokes];else get(id).strokes.pop();redo.push(action);changed(id);save(id);redraw();}};
  find('[data-redo]').onclick=()=>{finish();const action=redo.pop();if(action){if(action.type==='clear')get(id).strokes=[];else get(id).strokes.push(action.stroke);undo.push(action);changed(id);save(id);redraw();}};
  find('[data-clear]').onclick=async()=>{finish();if(await confirmAction('清空本題筆記？',`只會清空第 ${id} 題的筆記；其他題不受影響。清空後仍可按「復原」還原。`)){
   if(destroyed)return;undo.push({type:'clear',strokes:[...get(id).strokes]});redo=[];get(id).strokes=[];changed(id);save(id);redraw();
  }};
  find('[data-expand]').onclick=()=>{finish();save(id);closeTranslation();activeModalEditor=editor;dialog.querySelector('h2').textContent=`第 ${id} 題 · 放大手寫筆記`;dialog.querySelector('.notes-dialog-body').append(host);document.body.classList.add('notes-modal-open');dialog.showModal();resize();};
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  const editor={host,slot,status,resize,finish,updateButtons,get destroyed(){return destroyed;},destroy(){finish();destroyed=true;clearTimeout(saveTimer);save(id);observer.disconnect();cancelAnimationFrame(raf);lifecycle.abort();host.remove();}};
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
   for(const note of notes){records.set(note.questionId,note);dirty.delete(note.questionId);errors.delete(note.questionId);revisions.set(note.questionId,(revisions.get(note.questionId)||0)+1);const editor=editors.get(note.questionId);if(editor){editor.destroy();editors.delete(note.questionId);const checkbox=root.querySelector(`#note-toggle-${note.questionId}`);if(checkbox?.checked){const replacement=makeEditor(note.questionId,editor.slot);editors.set(note.questionId,replacement);replacement.resize();}}updateIndicator(note.questionId);}
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
    checkbox.onchange=()=>{if(checkbox.checked){expanded.add(id);closeTranslation();slot.hidden=false;const editor=makeEditor(id,slot);editors.set(id,editor);updateIndicator(id);}else{expanded.delete(id);editors.get(id)?.destroy();editors.delete(id);slot.hidden=true;updateIndicator(id);}};
    if(ready&&expanded.has(id)){checkbox.checked=true;slot.hidden=false;const editor=makeEditor(id,slot);editors.set(id,editor);updateIndicator(id);}else updateIndicator(id);
   });
  });
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
 window.addEventListener('pagehide',flush);
 return {mount,unmount,flush};
}
