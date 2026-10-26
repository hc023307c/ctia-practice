import {parseRange,makeSession} from './core.js';
const KEYS={read:'ctia-mastery-read-v1',exam:'ctia-mastery-exam-v1'};
export function createMasteryStore({getStorage=()=>localStorage,questionIds}){
 function key(mode){if(!Object.hasOwn(KEYS,mode))throw new Error('未知的練習模式。');return KEYS[mode];}
 function ids(mode){
  const name=key(mode);
  try{const data=JSON.parse(getStorage().getItem(name));if(data?.version!==1||!Array.isArray(data.ids))return new Set();return new Set(data.ids.filter(id=>Number.isInteger(id)&&questionIds().includes(id)));}catch{return new Set();}
 }
 function set(mode,id,mastered){
  if(!questionIds().includes(id))return false;
  const name=key(mode),next=ids(mode);if(mastered)next.add(id);else next.delete(id);
  try{getStorage().setItem(name,JSON.stringify({version:1,ids:[...next].sort((a,b)=>a-b)}));return true;}catch{return false;}
 }
 return {ids,set};
}
export function practiceIds(questions,range,mastered,includeMastered=false){
 const ids=parseRange(range,questions);return includeMastered?ids:ids.filter(id=>!mastered.has(id));
}
export function makePracticeSession(questions,config,mastered,now=Date.now(),random=Math.random){
 const ids=practiceIds(questions,config.range,mastered,config.includeMastered===true);
 if(!ids.length)throw new Error('這個範圍的題目都已讀熟。請在設定勾選「包含已熟題出題」，或取消已熟標記後再試。');
 const next=makeSession(questions,{...config,range:ids.join(',')},now,random);
 // Retain the user's original range, so a later retry filters against fresh mastery.
 next.config={...config};return next;
}
