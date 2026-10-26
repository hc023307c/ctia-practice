import {createMasteryStore,practiceIds,makePracticeSession} from './mastery.js?v=20261026-mastery';
import {createReadingNotes} from './reading-notes.js?v=20261026-ink-stability';
import {createReadingTranslator} from './reading-translation.js?v=20261026-speech';
import {parseRange,isCorrect,grade,validSession} from './core.js';
const $=s=>document.querySelector(s), app=$('#app'), KEY='ctia-practice-session', PREF='ctia-practice-reading';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let questions=[],session=null,reading={language:'bilingual',range:''}, storageOK=true,timer=null,reviewFilter='all';
function readStore(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function save(){try{if(session)localStorage.setItem(KEY,JSON.stringify(session));else localStorage.removeItem(KEY);}catch{storageOK=false;toast('瀏覽器無法儲存進度，關閉或重新整理可能遺失作答。');}}
function toast(message){const t=$('#toast');t.textContent=message;t.hidden=false;clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>t.hidden=true,5000);}
function go(route){if(location.hash==='#'+route)render();else location.hash=route;}
let lastRoute='',readingMasteredAtEntry=new Set(),showReadingMastered=false;
const mastery=createMasteryStore({questionIds:()=>questions.map(q=>q.id)});
const qFor=id=>questions.find(q=>q.id===id);
const readingTranslator=createReadingTranslator({root:app,isReading:()=>location.hash==='#read',questionFor:qFor});
const readingNotes=createReadingNotes({root:app,questionIds:()=>questions.map(q=>q.id),notify:toast,confirmAction,closeTranslation:()=>readingTranslator.reset()});
function masteryToggle(mode,id){
 const checked=mastery.ids(mode).has(id);
 return `<label class="check-row mastery-toggle"><input type="checkbox" data-mastery="${mode}" data-question-id="${id}" aria-label="${mode==='read'?'閱讀':'考試'}第 ${id} 題已讀熟，下次略過" ${checked?'checked':''}><span>已讀熟，下次略過</span></label>`;
}
function masterySummary(mode){return `<span data-mastery-summary="${mode}"></span>`;}
function updateMasterySummary(){
 if($('[data-mastered-list-summary]'))$('[data-mastered-list-summary]').textContent=`查看與恢復考試已熟題（${mastery.ids('exam').size} 題）`;
 if($('#retry-wrong')&&session?.finishedAt){const mastered=mastery.ids('exam'),count=session.items.filter(i=>!isCorrect(qFor(i.id),session.answers[i.id]||[])&&(session.config.includeMastered===true||!mastered.has(i.id))).length;$('#retry-wrong').textContent=`錯題重考（${count} 題）`;$('#retry-wrong').disabled=!count;}
 app.querySelectorAll('[data-mastery-summary]').forEach(el=>{const count=mastery.ids(el.dataset.masterySummary).size;el.textContent=`${el.dataset.masterySummary==='read'?'閱讀':'考試'}：已熟 ${count} 題 · 未熟 ${questions.length-count} 題`;});
}
function bindMastery(){
 updateMasterySummary();
 app.querySelectorAll('[data-mastery]').forEach(input=>input.onchange=()=>{
  const mode=input.dataset.mastery,id=Number(input.dataset.questionId),checked=input.checked;
  if(!mastery.set(mode,id,checked)){input.checked=!checked;toast('已熟標記未儲存，請確認瀏覽器允許儲存網站資料。');return;}
  if(mode==='read'&&!checked)readingMasteredAtEntry.delete(id);
  app.querySelectorAll(`[data-mastery="${mode}"][data-question-id="${id}"]`).forEach(other=>other.checked=checked);
  if(mode==='exam'&&!checked&&$('#setup-form')){input.closest('.mastery-row')?.remove();if(!app.querySelector('.mastery-row'))$('.mastery-list').insertAdjacentHTML('beforeend','<p class="note">目前沒有考試已熟題。</p>');}
  updateMasterySummary();if(mode==='exam'&&$('#setup-form'))updateSetupRange();
  toast(checked?`已記錄${mode==='read'?'閱讀':'考試'}第 ${id} 題已熟；${mode==='read'?'下次進入閱讀時略過，本次仍保留。':'下次建立測驗時略過，本次題目與計分不變。'}`:`已恢復${mode==='read'?'閱讀':'考試'}第 ${id} 題。`);
 });
}
function updateSetupRange(){
 $('#setup-error').textContent='';
 try{const all=parseRange($('#range').value,questions),ids=practiceIds(questions,$('#range').value,mastery.ids('exam'),$('#include-mastered').checked);$('#range-hint').textContent=`範圍 ${all.length} 題 · 本次可出 ${ids.length} 題${$('#include-mastered').checked?'（包含已熟題）':` · 略過已熟 ${all.length-ids.length} 題`}`;$('#count').max=ids.length;}
 catch(error){$('#range-hint').textContent=error.message;}
}
function note(q){return q.note?`<div class="review-note"><span>待核對</span> · ${esc(q.note)}<br>本網站依原題庫答案計分。</div>`:'';}
function qBody(q,bilingual=false){return `<p class="qtext" lang="en">${esc(q.en)}</p>${bilingual?`<p class="zh">${esc(q.zh)}</p>`:''}`;}
function optionHTML(o,letter,bilingual=false,extra=''){return `<div class="option ${extra}"><span class="option-letter">${letter}</span><div><p lang="en">${esc(o.en)}</p>${bilingual?`<p class="zh">${esc(o.zh)}</p>`:''}</div></div>`;}
function answerText(q,order,bilingual=false){return q.answers.map(id=>{const o=q.options.find(o=>o.id===id);return `${letters[order.indexOf(id)]}. ${esc(o.en)}${bilingual?'／'+esc(o.zh):''}`;}).join('；');}
function explanationHTML(q){
 const e=q.explanation;if(!e)return '';
 const refs=(e.references||[]).filter(r=>/^https:\/\//.test(r.url));
 return `<section class="explanation" aria-label="第 ${q.id} 題中文解析"><h3>中文解析</h3><p><strong>選答理由與觀念</strong><br>${esc(e.reason)}</p><p><strong>其他選項比較</strong><br>${esc(e.distractors)}</p><p class="takeaway"><strong>記憶重點：</strong>${esc(e.takeaway)}</p>${refs.length?`<div class="explanation-sources"><span>觀念參考（非本題官方解答）</span><ul>${refs.map(r=>`<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)} ↗</a></li>`).join('')}</ul></div>`:''}</section>`;
}
function head(title,sub,extra=''){return `<div class="page-head"><div><div class="eyebrow">CTIA STUDY LAB</div><h1>${title}</h1><p>${sub}</p></div>${extra}</div>`;}
function home(){
 const completed=session?.finishedAt;
 app.innerHTML=`<section class="hero"><div><div class="eyebrow">CYBER THREAT INTELLIGENCE</div><h1>理解每一道題，<br>穩穩累積你的實力。</h1><p class="lead">從中英對照閱讀到全英文模擬測驗，<br>用自己的節奏，掌握 CTIA 的關鍵概念。</p><div class="actions"><button data-go="read">開始閱讀 →</button><button class="secondary" data-go="setup">進入模擬測驗</button></div></div><div class="hero-visual"><div class="visual-heading">YOUR QUESTION BANK</div><div class="visual-number">${questions.length}<span>道練習題</span></div><p>讀懂觀念，再用測驗確認理解。</p><div class="visual-list"><span>✓ 中英對照</span><span>✓ 英文測驗</span><span>✓ 錯題重練</span></div></div></section>
 ${session?`<section class="card resume"><div><h3>${completed?'上次測驗已完成':'你有一份尚未完成的測驗'}</h3><p>${session.items.length} 題 · ${Object.values(session.answers).filter(a=>a.length).length} 題已作答${completed?' · '+grade(session,questions).score+' 分':''}</p></div><button data-go="${completed?'results':'exam'}">${completed?'查看測驗結果':'繼續作答 →'}</button></section>`:''}
 <div class="section-line"><h2>選擇你的練習方式</h2><span class="muted">閱讀 → 練習 → 檢討</span></div><div class="cards"><section class="card mode-card"><span class="mode-number">01 / READ & UNDERSTAND</span><h2>閱讀版</h2><span class="badge">英文原版 · 中英對照</span><p>依題號閱讀，每題下方直接顯示正確答案。適合建立觀念、複習與對照專業術語。</p><button class="secondary" data-go="read">開啟閱讀題庫 ↗</button></section><section class="card mode-card"><span class="mode-number">02 / PRACTICE & REVIEW</span><h2>考試版</h2><span class="badge">全英文題目 · 自訂出題</span><p>選擇作答範圍、題數與時間，也能打亂題目及選項順序。交卷後逐題檢討，再練錯題。</p><button class="secondary" data-go="setup">設定模擬測驗 ↗</button></section></div><p class="note notice">題目與計分答案依上傳題庫保留。${questions.filter(q=>q.note).length} 題有待核對標註，可在閱讀與交卷檢討時查看。</p>`;
}
function readPage(){
 readingNotes.unmount();
 let ids;try{ids=parseRange(reading.range,questions);}catch{reading.range='';ids=questions.map(q=>q.id);}
 const bi=reading.language==='bilingual',rangeCount=ids.length;
 if(!showReadingMastered)ids=ids.filter(id=>!readingMasteredAtEntry.has(id));
 app.innerHTML=head('閱讀題庫','每題下方都有答案；中英對照模式另附中文解析。',`<a class="top-link" href="#home">返回首頁 ↗</a>`)+`<section class="card toolbar"><div class="field"><label>顯示方式</label><div class="segmented"><button data-language="english" class="${bi?'':'active'}" aria-pressed="${!bi}">英文原版</button><button data-language="bilingual" class="${bi?'active':''}" aria-pressed="${bi}">中英對照</button></div></div><form id="reading-form" class="field"><label for="read-range">題號範圍</label><div style="display:flex;gap:8px"><input id="read-range" value="${esc(reading.range)}" placeholder="全部，或 1-20、2,5,8-15"><button class="small">套用</button></div></form><form id="jump-form" class="field compact"><label for="jump">跳至題號</label><div style="display:flex;gap:8px"><input id="jump" type="number" min="1" max="${questions.length}" placeholder="題號" required><button class="small">前往</button></div></form></section><div class="reading-tools"><label class="check-row"><input id="translate-toggle" type="checkbox" ${readingTranslator.enabled()?'checked':''}>選字即時翻譯</label><span>長按或反白英文，即可翻譯單字、片語與句子。選取內容會送至 MyMemory。</span></div><div class="notes-management"><div class="note-tool-group"><button type="button" class="secondary small" data-notes-export>匯出全部筆記 ↓</button><button type="button" class="secondary small" data-notes-import>匯入筆記 ↑</button><input type="file" data-notes-file accept=".json,application/json" hidden aria-label="選擇筆記備份檔案"></div><span data-notes-message>正在開啟本機筆記儲存……</span></div><div class="mastery-tools"><div>${masterySummary('read')}<p>已熟標記只用於閱讀，不影響考試。新勾選的題目本次會保留。</p></div><label class="check-row"><input id="read-show-mastered" type="checkbox" ${showReadingMastered?'checked':''}>顯示已熟題</label></div><p class="note">目前顯示 ${ids.length} 題 · 範圍內略過已熟 ${rangeCount-ids.length} 題 · 答案依原始題庫保留</p>${!ids.length?'<div class="card empty">這個範圍的題目都已讀熟！勾選「顯示已熟題」即可複習或取消標記。</div>':''}<div id="read-questions">${ids.map(id=>{const q=qFor(id);return `<article class="card question" id="q-${id}"><div class="question-top"><div class="note-question-heading"><label class="check-row note-toggle"><input id="note-toggle-${id}" type="checkbox" data-note-toggle="${id}" aria-label="第 ${id} 題手寫筆記" disabled>手寫畫線</label><span class="qtag">QUESTION ${String(id).padStart(2,'0')}</span><span class="note-indicator" data-note-indicator></span></div><div class="question-right">${masteryToggle('read',id)}<span class="badge">${q.answers.length>1?'複選題':'單選題'}</span></div></div>${`<div class="note-slot" id="note-slot-${id}" hidden></div><div class="note-content">${qBody(q,bi)}<div class="options">${q.options.map((o,i)=>`<div class="ink-block" data-ink-target="option-${o.id}-${bi?'bi':'en'}">${optionHTML(o,letters[i],bi)}</div>`).join('')}</div><div class="answer ink-block" data-ink-target="answer-${bi?'bi':'en'}"><strong>正確答案：</strong>${answerText(q,q.options.map(o=>o.id),bi)}</div>${bi?explanationHTML(q):''}${note(q)}</div>`}</article>`;}).join('')}</div><a href="#read" class="top-link" id="back-top">回到頁面頂端 ↑</a>`;
 app.querySelectorAll('.note-content').forEach(content=>{
  for(const [selector,prefix] of [[':scope > .qtext','question-en'],[':scope > .zh','question-zh'],['.explanation > h3, .explanation > p','explanation'],['.review-note','review']])content.querySelectorAll(selector).forEach((block,i)=>{block.classList.add('ink-block');block.dataset.inkTarget=prefix+'-'+i;});
 });
 readingNotes.mount();
 bindMastery();
 $('#read-show-mastered').onchange=e=>{showReadingMastered=e.target.checked;render(false);};
 $('#translate-toggle').onchange=e=>readingTranslator.setEnabled(e.target.checked);
 $('#reading-form').onsubmit=e=>{e.preventDefault();const value=$('#read-range').value;try{parseRange(value,questions);reading.range=value;saveReading();render(false);}catch(err){toast(err.message);}};
 $('#jump-form').onsubmit=e=>{e.preventDefault();const id=Number($('#jump').value);if(!qFor(id))return toast('找不到這個題號。');if(!ids.includes(id)){reading.range='';if(readingMasteredAtEntry.has(id))showReadingMastered=true;saveReading();readPage();bindCommon();}document.getElementById('q-'+id).scrollIntoView({behavior:'smooth'});};
 document.querySelectorAll('[data-language]').forEach(b=>b.onclick=()=>{reading.language=b.dataset.language;saveReading();render(false);});
 $('#back-top').onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});};
}
function saveReading(){try{localStorage.setItem(PREF,JSON.stringify(reading));}catch{}}
function setup(){
 const mastered=[...mastery.ids('exam')].sort((a,b)=>a-b);
 app.innerHTML=head('設定模擬測驗','依你的進度，安排一份剛剛好的練習。',`<a class="top-link" href="#home">返回首頁 ↗</a>`)+`<div class="setup-grid"><section class="card"><form id="setup-form"><div class="mastery-tools"><div>${masterySummary('exam')}<p>建立新測驗時略過已熟題；閱讀標記獨立保存。</p></div><label class="check-row"><input id="include-mastered" type="checkbox" name="includeMastered">包含已熟題出題</label></div><details class="mastery-list"><summary data-mastered-list-summary>查看與恢復考試已熟題（${mastered.length} 題）</summary><p class="note">取消勾選即可恢復出題，不影響現有測驗。</p>${mastered.length?mastered.map(id=>`<div class="mastery-row"><div>${masteryToggle('exam',id)}<strong>原始題號 ${id}</strong></div><p lang="en">${esc(qFor(id).en)}</p></div>`).join(''):'<p class="note">目前沒有考試已熟題。</p>'}</details><div class="form-grid"><div class="field full"><label for="range">作答範圍</label><input id="range" name="range" placeholder="留白代表全部，例如 1-20 或 2,5,8-15"><p class="form-hint" id="range-hint">已選 ${questions.length} 題</p></div><div class="field"><label for="count">出題數量</label><input id="count" name="count" type="number" min="1" max="${questions.length}" placeholder="留白代表全部"><p class="form-hint">少於所選題數時，會從範圍內隨機抽題。</p></div><div class="field"><label for="minutes">作答時間（分鐘）</label><input id="minutes" name="minutes" type="number" min="0" max="1440" value="0"><p class="form-hint">0 代表不限時。</p></div><fieldset class="full"><legend>排列方式</legend><label class="check-row"><input type="checkbox" name="shuffleQuestions">打亂題目順序</label><label class="check-row" style="margin-top:12px"><input type="checkbox" name="shuffleOptions">打亂答案選項順序</label><p class="form-hint" style="margin-top:12px">兩項都不勾選，即維持原版順序。涉及選項代號的特殊題會保留選項順序。</p></fieldset></div><p class="error" id="setup-error" role="alert"></p><div class="actions"><button type="submit">開始測驗 →</button><button type="button" class="quiet" data-go="read">先閱讀題庫</button></div></form></section><aside class="card"><span class="badge">ENGLISH ONLY</span><h3 style="margin-top:18px">把每次練習，變成進步。</h3><ul class="aside-list"><li>題目與選項只顯示英文，交卷前不顯示答案。</li><li>可以跳題、標記，最後再回來思考。</li><li>交卷後顯示成績與逐題答案，支援錯題重考。</li><li>目前瀏覽器會保留測驗進度與上次結果。</li></ul>${session&&!session.finishedAt?'<button class="secondary" data-go="exam">繼續未完成測驗</button>':''}</aside></div>`;
 bindMastery();updateSetupRange();
 $('#range').oninput=updateSetupRange;$('#include-mastered').onchange=updateSetupRange;
 $('#setup-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const config={range:f.get('range'),count:f.get('count'),minutes:f.get('minutes'),shuffleQuestions:f.has('shuffleQuestions'),shuffleOptions:f.has('shuffleOptions'),includeMastered:f.has('includeMastered')};try{const next=makePracticeSession(questions,config,mastery.ids('exam'));if(session&&!session.finishedAt&&!await confirmAction('開始新的測驗？','目前未完成的作答進度會被新測驗取代。'))return;session=next;save();go('exam');}catch(err){$('#setup-error').textContent=err.message;}};
}
function remaining(){return session.deadline===null?null:Math.max(0,session.deadline-Date.now());}
function duration(ms){const seconds=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function expired(){if(session&&!session.finishedAt&&remaining()!==null&&remaining()<=0){finish(true);return true;}return false;}
function exam(){
 if(!session)return go('setup');if(session.finishedAt)return go('results');if(expired())return;
 const item=session.items[session.index],q=qFor(item.id),selected=session.answers[q.id]||[],done=Object.values(session.answers).filter(a=>a.length).length;
 app.innerHTML=head('模擬測驗','專注作答，答案將於交卷後顯示。')+`<div class="exam-layout"><section><div class="exam-status"><span>第 <strong>${session.index+1}</strong> / ${session.items.length} 題</span><span id="clock" role="timer">${session.deadline===null?'不限時間':'剩餘 '+duration(remaining())}</span></div><div class="progress" aria-label="作答進度"><div style="width:${done/session.items.length*100}%"></div></div><article class="card"><div class="question-top"><span class="qtag">QUESTION ${String(session.index+1).padStart(2,'0')}</span><div class="question-right">${masteryToggle('exam',q.id)}<span class="badge">${q.answers.length>1?'複選題 · 請選出所有正確選項':'單選題'}</span></div></div>${qBody(q)}<fieldset><legend class="note">選擇你的答案</legend><div class="options">${item.options.map((id,i)=>{const o=q.options.find(o=>o.id===id);return `<label class="option answer-option"><input type="${q.answers.length>1?'checkbox':'radio'}" name="answer" value="${id}" ${selected.includes(id)?'checked':''}><span class="option-letter">${letters[i]}</span><div lang="en">${esc(o.en)}</div></label>`;}).join('')}</div></fieldset><button id="clear-answer" class="quiet small" style="margin-top:12px">清除本題答案</button></article><div class="exam-nav"><button id="prev" class="secondary" ${session.index===0?'disabled':''}>← 上一題</button><button id="flag" class="secondary flag ${session.flags.includes(q.id)?'active':''}" aria-pressed="${session.flags.includes(q.id)}">${session.flags.includes(q.id)?'已標記 ★':'標記稍後作答 ☆'}</button><button id="next" ${session.index===session.items.length-1?'disabled':''}>下一題 →</button></div></section><aside class="card sticky"><h3>作答進度</h3><p class="note">${masterySummary('exam')}<br>已熟標記於下次建立測驗時生效，本次仍照常計分。</p><p class="note" id="done-count">已答 ${done} 題 · 未答 ${session.items.length-done} 題</p><div class="number-grid">${session.items.map((it,i)=>`<button data-index="${i}" class="${(session.answers[it.id]||[]).length?'done':''} ${i===session.index?'current':''} ${session.flags.includes(it.id)?'flagged':''}" aria-label="第 ${i+1} 題${(session.answers[it.id]||[]).length?'，已答':'，未答'}${session.flags.includes(it.id)?'，已標記':''}" ${i===session.index?'aria-current="step"':''}>${i+1}</button>`).join('')}</div><p class="form-hint">綠底：已答　圓點：已標記</p><button id="submit" style="width:100%;margin-top:20px">交卷並查看結果</button><button class="quiet small" style="width:100%;margin-top:8px" data-go="home">儲存並回首頁</button><p class="form-hint">${storageOK?'重新整理後可繼續本次測驗。':'目前無法儲存，請勿關閉頁面。'}</p></aside></div>`;
 bindMastery();
 document.querySelectorAll('input[name=answer]').forEach(input=>input.onchange=()=>{if(expired())return;session.answers[q.id]=[...document.querySelectorAll('input[name=answer]:checked')].map(i=>i.value);save();updateProgress();});
 $('#clear-answer').onclick=()=>{if(expired())return;delete session.answers[q.id];save();render(false);};
 $('#prev').onclick=()=>move(session.index-1);$('#next').onclick=()=>move(session.index+1);
 $('#flag').onclick=()=>{if(expired())return;session.flags=session.flags.includes(q.id)?session.flags.filter(id=>id!==q.id):[...session.flags,q.id];save();render(false);};
 document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>move(Number(b.dataset.index)));
 $('#submit').onclick=async()=>{if(expired())return;const unanswered=session.items.filter(i=>!(session.answers[i.id]||[]).length).length;if(await confirmAction('確認交卷',unanswered?`還有 ${unanswered} 題未作答，未答題目會計為答錯。確定交卷？`:'所有題目都已作答，確定交卷並查看答案？'))finish();};
 timer=setInterval(()=>{if(expired())return;const clock=$('#clock');if(clock)clock.textContent=session.deadline===null?'不限時間':'剩餘 '+duration(remaining());},1000);
}
function updateProgress(){const done=Object.values(session.answers).filter(a=>a.length).length;$('#done-count').textContent=`已答 ${done} 題 · 未答 ${session.items.length-done} 題`;$('.progress>div').style.width=done/session.items.length*100+'%';document.querySelectorAll('[data-index]').forEach(b=>{const i=Number(b.dataset.index),answered=!!session.answers[session.items[i].id]?.length;b.classList.toggle('done',answered);b.setAttribute('aria-label',`第 ${i+1} 題，${answered?'已答':'未答'}${session.flags.includes(session.items[i].id)?'，已標記':''}`);});}
function move(index){if(expired())return;session.index=Math.max(0,Math.min(index,session.items.length-1));save();render();}
function finish(auto=false){if(!session||session.finishedAt)return;const dialog=$('#confirm-dialog');if(dialog.open)dialog.close('cancel');session.finishedAt=auto&&session.deadline?session.deadline:Date.now();save();reviewFilter='all';go('results');if(auto)toast('時間已到，已自動交卷。');}
function results(){
 if(!session)return go('setup');if(!session.finishedAt)return go('exam');
 const g=grade(session,questions),wrongItems=session.items.filter(i=>!isCorrect(qFor(i.id),session.answers[i.id]||[]));
 const items=reviewFilter==='wrong'?wrongItems:session.items;
 app.innerHTML=head('測驗結果','把錯題讀懂，下一次更有把握。',`<a class="top-link" href="#home">返回首頁 ↗</a>`)+`<div class="mastery-tools"><div>${masterySummary('exam')}<p>檢討時也可標記已熟；再次測驗與錯題重考會依設定略過已熟題。</p></div><a class="top-link" href="#setup">查看與恢復已熟題 ↗</a></div><section class="card score-panel"><div class="score-ring"><strong>${g.score}</strong><span>分 / 100</span></div><div><div class="stats"><div><strong>${g.total}</strong><span>總題數</span></div><div><strong>${g.correct}</strong><span>答對</span></div><div><strong>${g.wrong}</strong><span>答錯</span></div><div><strong>${g.unanswered}</strong><span>未作答</span></div></div><p class="note">正確率 ${Math.round(g.correct/g.total*1000)/10}% · 作答時間 ${duration(session.finishedAt-session.startedAt)}</p></div></section><div class="actions" style="margin:0 0 30px"><button id="retry-wrong" ${wrongItems.length?'':'disabled'}>錯題重考（${wrongItems.length} 題）</button><button id="retry" class="secondary">相同設定再考一次</button><button class="quiet" data-go="setup">重新設定測驗</button></div><div class="section-line"><h2>逐題檢討</h2><div class="segmented"><button data-filter="all" class="${reviewFilter==='all'?'active':''}">全部題目</button><button data-filter="wrong" class="${reviewFilter==='wrong'?'active':''}">答錯與未答</button></div></div>${items.length?items.map(item=>{const q=qFor(item.id),a=session.answers[q.id]||[],ok=isCorrect(q,a),index=session.items.indexOf(item);return `<article class="card question"><div class="question-top"><span class="qtag">第 ${index+1} 題 · 原始題號 ${q.id}</span><div class="question-right">${masteryToggle('exam',q.id)}<span class="review-result ${ok?'':'wrong'}">${ok?'✓ 答對':a.length?'✕ 答錯':'— 未作答'}</span></div></div>${qBody(q)}<div class="options">${item.options.map((id,i)=>optionHTML(q.options.find(o=>o.id===id),letters[i],false,q.answers.includes(id)?'right':a.includes(id)?'wrong':'')).join('')}</div><div class="answer"><div>你的答案：${a.length?a.map(id=>letters[item.options.indexOf(id)]+'. '+esc(q.options.find(o=>o.id===id).en)).join('；'):'未作答'}</div><strong>正確答案：</strong>${answerText(q,item.options)}</div>${note(q)}</article>`;}).join(''):'<div class="card empty">這次沒有錯題，全部答對！</div>'}`;
 bindMastery();
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{reviewFilter=b.dataset.filter;render(false);});
 $('#retry').onclick=()=>restart(session.config);$('#retry-wrong').onclick=()=>restart({...session.config,range:wrongItems.map(i=>i.id).join(','),count:''});
}
function restart(config){try{session=makePracticeSession(questions,config,mastery.ids('exam'));save();go('exam');}catch(err){toast(err.message);}}
function confirmAction(title,message){return new Promise(resolve=>{const d=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-text').textContent=message;d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true});d.returnValue='cancel';d.showModal();});}
function bindCommon(){document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));}
function render(scroll=true){readingNotes.unmount();readingTranslator.reset();clearInterval(timer);const route=location.hash.slice(1)||'home';if(route==='read'&&lastRoute!=='read'){readingMasteredAtEntry=mastery.ids('read');showReadingMastered=false;}lastRoute=route;({home,read:readPage,setup,exam,results}[route]||home)();bindCommon();if(scroll)window.scrollTo(0,0);}
window.addEventListener('hashchange',()=>render());
window.addEventListener('visibilitychange',()=>{if(!document.hidden)expired();});
window.addEventListener('storage',e=>{if(e.key===null||['ctia-mastery-read-v1','ctia-mastery-exam-v1'].includes(e.key)){app.querySelectorAll('[data-mastery]').forEach(input=>input.checked=mastery.ids(input.dataset.mastery).has(Number(input.dataset.questionId)));updateMasterySummary();if($('#setup-form'))updateSetupRange();}if(e.key!==KEY)return;const s=readStore(KEY);if(validSession(s,questions)){session=s;render(false);toast('已同步另一個分頁的測驗進度。');}});
try{
 const response=await fetch('./questions.json?v=20261026-explanations');if(!response.ok)throw new Error('HTTP '+response.status);questions=await response.json();
 const saved=readStore(KEY);if(validSession(saved,questions))session=saved;
 const pref=readStore(PREF);if(pref&&['english','bilingual'].includes(pref.language)&&typeof pref.range==='string')reading=pref;
 try{localStorage.setItem('ctia-storage-check','1');localStorage.removeItem('ctia-storage-check');}catch{storageOK=false;}
 render();
}catch(err){app.innerHTML='<section class="card"><h1>題庫載入失敗</h1><p>請確認網路連線後重新整理頁面。</p><button id="reload">重新載入</button></section>';$('#reload').onclick=()=>location.reload();console.error(err);}
