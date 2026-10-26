export function createNotesStore(indexedDB=globalThis.indexedDB){
 let connection;
 function open(){
  if(connection)return connection;
  connection=new Promise((resolve,reject)=>{
   if(!indexedDB)return reject(new Error('此瀏覽器無法使用本機筆記儲存。'));
   const request=indexedDB.open('ctia-handwriting-v1',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('notes'))request.result.createObjectStore('notes',{keyPath:'questionId'});};
   request.onerror=()=>{connection=null;reject(request.error||new Error('無法開啟本機筆記儲存。'));};
   request.onblocked=()=>{connection=null;reject(new Error('筆記儲存正由其他頁面使用，請關閉其他題庫分頁再試。'));};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=null;};resolve(db);};
  });return connection;
 }
 async function readAll(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('notes','readonly'),request=tx.objectStore('notes').getAll();let rows=[];request.onsuccess=()=>rows=request.result;tx.oncomplete=()=>resolve(rows);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('讀取筆記失敗。'));});}
 async function putMany(notes){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('notes','readwrite');tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||new Error('筆記未儲存，請匯出備份。'));try{for(const note of notes)tx.objectStore('notes').put(note);}catch(e){tx.abort();reject(e);}});}
 return {readAll,putMany};
}
