"""Reimport English questions while retaining reviewed translations by original ID.
Usage: python scripts/import_docx.py /path/to/source.docx
Requires: pip install python-docx
Always review wording changes and translations before committing.
"""
import json, re, sys
from pathlib import Path
from docx import Document
root=Path(__file__).resolve().parent.parent
source='\n'.join(p.text for p in Document(sys.argv[1]).paragraphs)
old={q['id']:q for q in json.loads((root/'questions.json').read_text())}
result=[]
for m in re.finditer(r'QUESTION\s+(\d+)\s*\n(.*?)(?=\nQUESTION\s+\d+|\Z)',source,re.S):
    n,body=m.groups();n=int(n)
    answer=re.search(r'Correct Answer:\s*([A-Z, &]+)',body)
    if not answer:raise ValueError(f'Missing answer: {n}')
    content=body[:answer.start()].strip()
    options=list(re.finditer(r'^([A-Z])\.\s*(.*?)(?=\n[A-Z]\.\s|\Z)',content,re.M|re.S))
    if not options:raise ValueError(f'Missing options: {n}')
    previous=old.get(n,{})
    english=content[:options[0].start()].strip()
    unchanged=previous.get('en')==english and [(o['id'],o['en']) for o in previous.get('options',[])]==[(o[1],o[2].strip()) for o in options]
    prevopts={o['id']:o for o in previous.get('options',[])}
    q={'id':n,'en':english,'zh':previous.get('zh','') if unchanged else '',
       'options':[{'id':o[1],'en':o[2].strip(),'zh':prevopts.get(o[1],{}).get('zh','') if unchanged else ''} for o in options],
       'answers':re.findall(r'[A-Z]',answer[1]),'note':previous.get('note','') if unchanged else '原文已變更，中文翻譯待更新。',
       'lockOptions':previous.get('lockOptions',False)}
    assert set(q['answers'])<=set(o['id'] for o in q['options'])
    result.append(q)
assert result and len(set(q['id'] for q in result))==len(result)
(root/'questions.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'Imported {len(result)} questions. Run npm run check after completing translations.')
