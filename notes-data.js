export const NOTES_BANK='ctia-88';
export const NOTES_VERSION=1;
export const CANVAS_WIDTH=1000;
export const CANVAS_HEIGHT=640;
export const INK_COLORS=['#174e48','#2459bc','#b14343'];
export const MAX_BACKUP_BYTES=25*1024*1024;
export function blankNote(questionId){return {questionId,bank:NOTES_BANK,version:NOTES_VERSION,updatedAt:Date.now(),strokes:[]};}
export function validateNote(note,allowedIds){
 if(!note||note.bank!==NOTES_BANK||note.version!==NOTES_VERSION||!Number.isInteger(note.questionId)||!allowedIds.includes(note.questionId)||!Number.isFinite(note.updatedAt)||note.updatedAt<0||!Array.isArray(note.strokes)||note.strokes.length>5000)throw new Error('筆記格式或題號不正確。');
 let pointCount=0;
 for(const stroke of note.strokes){
  if(!stroke||!['pen','eraser'].includes(stroke.tool)||!INK_COLORS.includes(stroke.color)||!Number.isFinite(stroke.width)||stroke.width<1||stroke.width>50||!Array.isArray(stroke.points)||stroke.points.length<1||stroke.points.length>20000)throw new Error('筆畫格式不正確。');
  if(stroke.surface!==undefined&&(stroke.surface!=='question'||typeof stroke.target!=='string'||!/^[-a-zA-Z0-9]{1,80}$/.test(stroke.target)))throw new Error('筆畫位置不正確。');
  pointCount+=stroke.points.length;
  for(const point of stroke.points)if(!Array.isArray(point)||point.length!==2||!point.every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new Error('筆畫座標不正確。');
 }
 if(pointCount>150000)throw new Error('單題筆記資料過大，請減少筆畫。');
 return {questionId:note.questionId,bank:NOTES_BANK,version:NOTES_VERSION,updatedAt:note.updatedAt,strokes:note.strokes.map(s=>({...(s.surface?{surface:s.surface,target:s.target}:{}),tool:s.tool,color:s.color,width:s.width,points:s.points.map(p=>[...p])}))};
}
export function parseBackup(text,allowedIds){
 if(new TextEncoder().encode(text).length>MAX_BACKUP_BYTES)throw new Error('備份檔案超過 25 MB，無法匯入。');
 let data;try{data=JSON.parse(text);}catch{throw new Error('無法讀取備份，請選擇本網站匯出的 JSON 檔。');}
 if(data?.format!=='ctia-handwriting-backup'||data.version!==NOTES_VERSION||data.bank!==NOTES_BANK||!Array.isArray(data.notes)||data.notes.length>allowedIds.length)throw new Error('這不是相容的 CTIA 手寫筆記備份。');
 const notes=data.notes.map(n=>validateNote(n,allowedIds));
 if(new Set(notes.map(n=>n.questionId)).size!==notes.length)throw new Error('備份中有重複題號，未匯入任何資料。');
 if(notes.reduce((sum,n)=>sum+n.strokes.reduce((s,t)=>s+t.points.length,0),0)>600000)throw new Error('備份筆畫資料過多，無法匯入。');
 return notes;
}
export function makeBackup(notes,allowedIds){return {format:'ctia-handwriting-backup',version:NOTES_VERSION,bank:NOTES_BANK,exportedAt:new Date().toISOString(),canvas:{width:CANVAS_WIDTH,height:CANVAS_HEIGHT},notes:notes.filter(n=>n.strokes.length).map(n=>validateNote(n,allowedIds))};}
export function normalizedPoint(clientX,clientY,rect){return [Math.min(1,Math.max(0,(clientX-rect.left)/rect.width)),Math.min(1,Math.max(0,(clientY-rect.top)/rect.height))];}
export function drawStroke(ctx,stroke,width,height){
 if(!stroke.points.length)return;
 ctx.save();ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width*width/CANVAS_WIDTH;
 const [first,...rest]=stroke.points;
 if(!rest.length){ctx.beginPath();ctx.arc(first[0]*width,first[1]*height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
 else{ctx.beginPath();ctx.moveTo(first[0]*width,first[1]*height);for(const p of rest)ctx.lineTo(p[0]*width,p[1]*height);ctx.stroke();}
 ctx.restore();
}
