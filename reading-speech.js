export const READING_SPEECH_RATE=.7;
export function createReadingSpeech({engine=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,onState=()=>{}}={}){
 const supported=!!engine&&typeof engine.speak==='function'&&typeof engine.cancel==='function'&&typeof Utterance==='function';
 let current=null,generation=0;
 function stop(){
  generation++;const wasActive=current!==null;current=null;
  if(wasActive){try{engine.cancel();}catch{}}
  onState({playing:false,error:''});
 }
 function play(text){
  stop();if(!supported){onState({playing:false,error:'此瀏覽器暫不支援朗讀，請使用支援語音朗讀的瀏覽器。'});return;}
  if(!text?.trim())return;
  const token=generation;
  try{
   const utterance=new Utterance(text);utterance.lang='en-US';utterance.rate=READING_SPEECH_RATE;utterance.pitch=1;utterance.volume=1;
   const voices=engine.getVoices?.()||[],voice=voices.find(v=>/^en[-_]US$/i.test(v.lang))||voices.find(v=>/^en(?:[-_]|$)/i.test(v.lang));if(voice)utterance.voice=voice;
   utterance.onend=()=>{if(token!==generation)return;current=null;onState({playing:false,error:''});};
   utterance.onerror=event=>{if(token!==generation)return;current=null;onState({playing:false,error:['canceled','interrupted'].includes(event.error)?'':'英文語音暫時無法播放，請稍後再試或改用其他瀏覽器。'});};
   // Keep a reference until completion; only speak from the user's button click.
   current=utterance;onState({playing:true,error:''});engine.speak(utterance);
  }catch{current=null;onState({playing:false,error:'無法啟動朗讀，請再點一次播放。'});}
 }
 return {supported,stop,play,get playing(){return current!==null;}};
}
