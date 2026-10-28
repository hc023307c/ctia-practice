export function createPortableRuntime({getStorage=()=>globalThis.localStorage,onChange=()=>{}}={}){
 let backend=null,kvPersistent=false,notesPersistent=null,noteStore=null;
 const memory=new Map();
 function changed(){onChange({kvPersistent,notesPersistent,persistent:kvPersistent&&notesPersistent===true});}
 try{backend=getStorage();backend.setItem('ctia-portable-probe','1');backend.removeItem('ctia-portable-probe');kvPersistent=true;}catch{}
 const storage={
  getItem(key){if(kvPersistent){try{const value=backend.getItem(key);memory.set(key,value);return value;}catch{kvPersistent=false;changed();}}return memory.get(key)??null;},
  setItem(key,value){value=String(value);memory.set(key,value);if(kvPersistent){try{backend.setItem(key,value);}catch{kvPersistent=false;changed();}}},
  removeItem(key){memory.set(key,null);if(kvPersistent){try{backend.removeItem(key);}catch{kvPersistent=false;changed();}}}
 };
 function wrapNotesStore(factory){
  if(noteStore)return noteStore;
  let driver=null,rows=new Map();
  const ready=(async()=>{try{driver=factory();const data=await driver.readAll();rows=new Map(data.map(n=>[n.questionId,structuredClone(n)]));notesPersistent=true;}catch{notesPersistent=false;}changed();})();
  async function write(notes,replace){
   await ready;
   if(notesPersistent){try{if(replace)await driver.replaceAll(notes);else await driver.putMany(notes);}catch{notesPersistent=false;changed();}}
   if(replace)rows.clear();for(const note of notes)rows.set(note.questionId,structuredClone(note));
  }
  noteStore={async readAll(){await ready;return [...rows.values()].map(n=>structuredClone(n));},putMany:notes=>write(notes,false),replaceAll:notes=>write(notes,true)};
  return noteStore;
 }
 return {storage,wrapNotesStore,get notesStore(){return noteStore;},get persistent(){return kvPersistent&&notesPersistent===true;},get status(){return {kvPersistent,notesPersistent};},refresh:changed};
}
export function attachPortableUI({runtime,flush,getState,applyState,questions,parseBackup,makeBackup,confirmAction,notify,doc=document}){
 const status=doc.querySelector('#portable-status'),notice=doc.querySelector('#portable-notice'),exportButton=doc.querySelector('#portable-export'),importButton=doc.querySelector('#portable-import'),input=doc.querySelector('#portable-file');
 let busy=false;
 function refresh(){const {kvPersistent,notesPersistent}=runtime.status;const good=kvPersistent&&notesPersistent===true;
  status.textContent=notesPersistent===null?'正在檢查本機保存能力……':good?'✓ 自動保存可用：目前瀏覽器會保存紀錄。':'⚠ 暫存模式：部分紀錄無法自動保存，離開或重新整理前務必匯出全部紀錄。';
  status.classList.toggle('portable-warning',!good);notice.textContent='可離線閱讀與測驗；選字翻譯需網路，朗讀依裝置。HTML 不會自行寫入新紀錄，換檔案／換裝置請匯出再匯入。';
 }
 async function run(task){if(busy)return;busy=true;exportButton.disabled=importButton.disabled=true;try{await task();}catch(error){notify(error.message||'紀錄操作未完成，請保留此頁再試。');}finally{busy=false;exportButton.disabled=importButton.disabled=false;refresh();}}
 exportButton.onclick=()=>run(async()=>{await flush();const {state,notes}=await getState();const backup=makeBackup(state,notes,questions);const blob=new Blob([JSON.stringify(backup)],{type:'application/json'}),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=`CTIA_all_records_${new Date().toISOString().slice(0,10)}.json`;doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('已匯出全部紀錄，請妥善保存下載的 JSON 備份檔。');});
 importButton.onclick=()=>input.click();
 input.onchange=()=>{const file=input.files?.[0];input.value='';if(!file)return;run(async()=>{if(file.size>25*1024*1024)throw Error('備份超過 25 MB，無法匯入。');const data=parseBackup(await file.text(),questions);
  if(!await confirmAction('匯入全部紀錄',`備份含 ${data.notes.length} 題筆記、閱讀已熟 ${data.state.readMastered.length} 題、考試已熟 ${data.state.examMastered.length} 題${data.state.session?'，以及一份測驗紀錄':''}。將取代目前筆記、兩套已熟紀錄、測驗與設定。請先匯出目前紀錄。確定匯入？`))return;
  await flush();await applyState(data);notify('完整紀錄已還原。計時測驗依原截止時間繼續，不會重置時間。');
 });};
 refresh();return {refresh};
}
