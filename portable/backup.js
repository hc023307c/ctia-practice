import {parseRange,validSession} from '../core.js';
import {parseBackup,MAX_BACKUP_BYTES} from '../notes-data.js';
export function validatePortableBackup(data,questions){
 const ids=questions.map(q=>q.id);
 if(data?.format!=='ctia-portable-backup'||data.version!==1||data.bank!=='ctia-88'||!data.state)throw Error('這不是相容的完整紀錄備份。請選擇本可攜版匯出的 JSON 檔。');
 const state=data.state,reading=state.reading;
 if(!reading||!['english','bilingual'].includes(reading.language)||typeof reading.range!=='string'||typeof state.translationEnabled!=='boolean')throw Error('閱讀設定格式不正確。');
 parseRange(reading.range,questions);
 function mastered(value){if(!Array.isArray(value)||value.length>ids.length||new Set(value).size!==value.length||!value.every(id=>Number.isInteger(id)&&ids.includes(id)))throw Error('已熟紀錄題號不正確。');return [...value];}
 const session=state.session;
 if(session!==null){
  if(!validSession(session,questions)||!Number.isFinite(session.startedAt)||session.startedAt<0||!session.answers||Array.isArray(session.answers))throw Error('測驗紀錄格式不正確。');
  const c=session.config;
  if(typeof c.range!=='string'||!['string','number'].includes(typeof c.count)||!['string','number'].includes(typeof c.minutes)||typeof c.shuffleQuestions!=='boolean'||typeof c.shuffleOptions!=='boolean'||(c.includeMastered!==undefined&&typeof c.includeMastered!=='boolean'))throw Error('測驗設定格式不正確。');
  parseRange(c.range,questions);
  if((session.deadline!==null&&session.deadline<session.startedAt)||(session.finishedAt!==null&&session.finishedAt<session.startedAt)||!session.flags.every(id=>session.items.some(item=>item.id===id))||Object.keys(session.answers).some(id=>!session.items.some(item=>String(item.id)===id)))throw Error('測驗題號或時間不正確。');
 }
 const notes=parseBackup(JSON.stringify({format:'ctia-handwriting-backup',version:1,bank:'ctia-88',notes:data.notes}),ids);
 return {format:'ctia-portable-backup',version:1,bank:'ctia-88',exportedAt:typeof data.exportedAt==='string'?data.exportedAt:'',state:{session:session===null?null:structuredClone(session),reading:{language:reading.language,range:reading.range},readMastered:mastered(state.readMastered),examMastered:mastered(state.examMastered),translationEnabled:state.translationEnabled},notes};
}
export function parsePortableBackup(text,questions){
 if(new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)throw Error('備份超過 25 MB，無法匯入。');
 let data;try{data=JSON.parse(text);}catch{throw Error('無法讀取備份，請選擇完整紀錄 JSON 檔。');}
 return validatePortableBackup(data,questions);
}
export function makePortableBackup(state,notes,questions){
 return parsePortableBackup(JSON.stringify({format:'ctia-portable-backup',version:1,bank:'ctia-88',exportedAt:new Date().toISOString(),state,notes}),questions);
}
