#!/usr/bin/env python3
"""Package existing GitHub Pages sources into one script-enabled portable HTML."""
import argparse,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
IMPORT=re.compile(r"^import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",re.M)
def build(output):
    modules={};order=[]
    def add(name):
        if name in modules:return
        source=(ROOT/name).read_text();modules[name]=source
        for match in IMPORT.finditer(source):
            dep=str((Path(name).parent/match[2].split('?')[0]).as_posix());dep=str(Path(__import__('os').path.normpath(dep)))
            add(dep)
        order.append(name)
    for name in ['portable/runtime.js','portable/backup.js','app.js']:add(name)
    chunks=['const __modules=Object.create(null);let __portableUI=null;']
    for name in order:
        source=modules[name]
        def imported(m):
            dep=__import__('os').path.normpath(str(Path(name).parent/m[2].split('?')[0]));return f'const {{{m[1]}}}=__modules[{json.dumps(dep)}];'
        source=IMPORT.sub(imported,source)
        exports=re.findall(r'^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)',source,re.M)
        source=re.sub(r'^export\s+','',source,flags=re.M)
        # Adapt browser storage only in the portable build. Source website stays intact.
        if name not in ['portable/runtime.js','portable/backup.js']:
            source=source.replace('globalThis.localStorage','__portable.storage')
            source=re.sub(r'\blocalStorage\b','__portable.storage',source)
        if name=='notes-store.js':
            source=source.replace(' return {readAll,putMany};', ''' async function replaceAll(notes){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes');tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('筆記保存失敗'));try{store.clear();for(const note of notes)store.put(note);}catch(error){tx.abort();reject(error);}});}
 return {readAll,putMany,replaceAll};''')
            result='{createNotesStore:()=>__portable.wrapNotesStore(()=>createNotesStore())}'
        else:result='{'+','.join(exports)+'}'
        if name=='reading-notes.js':
            source=source.replace(' return {mount,unmount,flush};', ''' return {mount,unmount,flush,async replaceAllRecords(notes){await load();await flush();unmount();await store.replaceAll(notes);records.clear();for(const note of notes)records.set(note.questionId,validateNote(note,allowed()));dirty.clear();errors.clear();revisions.clear();ready=true;storageError='';}};''')
            source=source.replace('已儲存於此裝置','筆記已更新（保存方式見頁面上方）').replace('筆記只儲存在此裝置的瀏覽器，請定期匯出備份。','請查看頁面上方保存狀態，並定期匯出全部紀錄。')
        if name=='app.js':
            source=re.sub(r" const response=await fetch\([^\n]+questions=await response.json\(\);", " questions=JSON.parse(document.querySelector('#portable-bank').textContent);", source)
            source=source.replace("storageOK?'重新整理後可繼續本次測驗。'", "(__portable.persistent&&storageOK)?'重新整理後可繼續本次測驗。'")
            source=source.replace('runtime:progressRuntime','runtime:__portable').replace('progressTools=attachPortableUI','__portableUI=progressTools=attachPortableUI')
            chunks.append('(async()=>{'+source+'\n})().catch(error=>console.error(error));')
        else:
            chunks.append('__modules['+json.dumps(name)+']=(function(){\n'+source+'\nreturn '+result+';})();')
        if name=='portable/runtime.js':
            chunks.append("const __portable=__modules['portable/runtime.js'].createPortableRuntime({onChange:()=>__portableUI?.refresh()});")
    script='\n'.join(chunks)
    if 'fetch(\'./questions.json' in script or re.search(r'^import\s',script,re.M):raise ValueError('Unbundled dependencies')
    # Safe for script-element parsing, including bank strings with HTML-looking text.
    script=re.sub(r'</script',r'<\\/script',script,flags=re.I)
    bank=json.dumps(json.loads((ROOT/'questions.json').read_text()),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<section id="device-tools"[\s\S]*?</section>','',html)
    html=re.sub(r'<link rel="(?:manifest|apple-touch-icon|icon)"[^>]*>','',html)
    html=re.sub(r'<link rel="stylesheet"[^>]+>',lambda _: '<style>'+ (ROOT/'styles.css').read_text()+'''\n.portable-controls{max-width:1088px;margin:0 auto 8px;padding:16px;background:#edf4e9;border:1px solid #dce4dc;border-radius:12px}.portable-controls h2{font-size:18px;margin:0 0 8px}.portable-controls p{font-size:12px;line-height:1.8;margin:6px 0}.portable-controls .actions{margin-top:10px}.portable-warning{color:#a34535;font-weight:700}@media(max-width:760px){.portable-controls{margin:0 16px 8px}}@media print{.portable-controls{display:none}}
</style>''',html)
    banner='''<section class="portable-controls" aria-label="可攜版完整紀錄"><h2>CTIA 可攜版 · 2026-10-28</h2><p id="portable-status" role="status">請用可執行 JavaScript 的瀏覽器開啟；啟動後此處會顯示保存狀態。</p><p id="portable-notice">此檔案需用可執行 JavaScript 的瀏覽器開啟；檔案預覽器可能無法操作。</p><div class="actions"><button id="portable-export" type="button">匯出全部紀錄 ↓</button><button id="portable-import" type="button" class="secondary">匯入全部紀錄 ↑</button><input id="portable-file" type="file" accept=".json,application/json" hidden aria-label="選擇完整紀錄備份"></div><p>給別人：只傳此 HTML，個人紀錄不會附帶。換裝置：另帶完整紀錄 JSON 備份。舊手寫備份仍可由閱讀頁匯入。</p></section>'''
    html=html.replace('</header>','</header>'+banner)
    html=re.sub(r'<script type="module"[^>]+></script>',lambda _: '<script id="portable-bank" type="application/json">'+bank+'</script>\n<script>\n'+script+'\n</script>',html)
    html=html.replace('<title>CTIA 題庫練習</title>','<title>CTIA 題庫練習 · 單檔可攜版</title>')
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(html)
    # Separate extracted code for node syntax validation; not a deliverable dependency.
    output.with_suffix('.check.js').write_text(script)
    print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'questions':88,'modules':len(order)}))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('output',type=Path);args=parser.parse_args();build(args.output.resolve())
