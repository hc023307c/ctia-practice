export function initializeOfflineApp({beforeUpdate=async()=>{}}={}){
 const status=document.querySelector('#pwa-status'),updateButton=document.querySelector('#pwa-update'),checkButton=document.querySelector('#pwa-check'),installButton=document.querySelector('#pwa-install');
 if(!status)return;
 let registration=null,installPrompt=null,reloading=false;
 const show=(text,state)=>{status.textContent=text;status.dataset.state=state;};
 function message(worker,data){return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timeout=setTimeout(()=>{channel.port1.close();reject(Error('timeout'));},8000);channel.port1.onmessage=e=>{clearTimeout(timeout);channel.port1.close();resolve(e.data);};worker.postMessage(data,[channel.port2]);});}
 async function check(){
  const worker=navigator.serviceWorker?.controller||registration?.active;
  if(!worker){show('離線資料尚未備妥，請保持連線後重新開啟。','loading');return;}
  try{const result=await message(worker,{type:'CHECK_CACHE',repair:navigator.onLine});if(!result.complete)throw Error('missing');show(navigator.onLine?'✓ 離線準備完成：可離線閱讀與測驗。':'✓ 目前離線：題庫與測驗可繼續使用。','ready');}catch{show('離線資源尚未完整，請連線後重新開啟；目前請保持網路。','error');}
 }
 checkButton.onclick=check;
 updateButton.onclick=async()=>{if(!registration?.waiting)return;updateButton.disabled=true;try{await beforeUpdate();reloading=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}catch{reloading=false;updateButton.disabled=false;show('更新前保存未完成，請先匯出全部紀錄。','error');}};
 installButton.onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;installButton.hidden=true;};
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installButton.hidden=false;});
 window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.hidden=true;});
 if(!('serviceWorker' in navigator)||!window.isSecureContext){show('此環境無法啟用離線功能；請用 Safari／Chrome 開啟 HTTPS 網址。','error');return;}
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)location.reload();else check();});
 window.addEventListener('online',check);window.addEventListener('offline',check);
 const waiting=()=>{if(registration?.waiting){updateButton.hidden=false;show('新版已下載。請先匯出紀錄，再按「更新版本」。','update');}};
 navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(async reg=>{
  registration=reg;waiting();reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'){waiting();if(!reg.waiting)check();}else if(worker.state==='redundant')show('離線準備失敗，請確認網路後重新開啟。','error');});});
  const ready=await navigator.serviceWorker.ready;registration=ready;await check();waiting();reg.update().catch(()=>{});
 }).catch(()=>show('無法準備離線題庫；目前仍可連線使用，請稍後再試。','error'));
}
