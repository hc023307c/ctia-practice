import test from 'node:test';
import assert from 'node:assert/strict';
import {blankNote,validateNote,parseBackup,makeBackup,normalizedPoint,INK_COLORS} from '../notes-data.js';
const ids=Array.from({length:88},(_,i)=>i+1);
const stroke={tool:'pen',color:INK_COLORS[0],width:4,points:[[.1,.2],[.4,.5],[.8,.2]]};
const note=id=>({...blankNote(id),strokes:[structuredClone(stroke)]});
test('backup round trip preserves independent original question IDs and strokes',()=>{
 const notes=[note(1),note(20),note(88)];const restored=parseBackup(JSON.stringify(makeBackup(notes,ids)),ids);assert.deepEqual(restored,notes);assert.deepEqual(restored.map(n=>n.questionId),[1,20,88]);
 restored[0].strokes[0].points[0][0]=.9;assert.equal(notes[0].strokes[0].points[0][0],.1);
});
test('empty notes excluded from export without changing stored records',()=>{const empty=blankNote(2);const backup=makeBackup([note(1),empty],ids);assert.equal(backup.notes.length,1);assert.equal(empty.strokes.length,0);});
test('incompatible bank, version and unknown question IDs rejected',()=>{
 for(const change of [{bank:'other-bank'},{version:99},{questionId:89}])assert.throws(()=>validateNote({...note(1),...change},ids));
 assert.throws(()=>parseBackup(JSON.stringify({format:'other',notes:[]}),ids));
});
test('duplicate backup IDs rejected before applying anything',()=>{const b=makeBackup([note(1)],ids);b.notes.push(note(1));assert.throws(()=>parseBackup(JSON.stringify(b),ids),/重複題號/);});
test('invalid coordinates, tools, colors and widths rejected',()=>{
 for(const patch of [{points:[[null,.1]]},{points:[[1.1,.2]]},{points:[[-.1,.2]]},{points:[]},{tool:'script'},{color:'url(evil)'},{width:999}]){const n=note(1);Object.assign(n.strokes[0],patch);assert.throws(()=>validateNote(n,ids));}
});
test('entire invalid backup rejected, including when only last note is corrupt',()=>{const backup=makeBackup([note(1),note(2)],ids);backup.notes[1].strokes[0].points=[[10,10]];assert.throws(()=>parseBackup(JSON.stringify(backup),ids));});
test('coordinates remain equivalent after changing display size or orientation',()=>{
 assert.deepEqual(normalizedPoint(150,120,{left:50,top:40,width:200,height:160}),[.5,.5]);
 assert.deepEqual(normalizedPoint(550,340,{left:50,top:20,width:1000,height:640}),[.5,.5]);
 assert.deepEqual(normalizedPoint(-1,1000,{left:0,top:0,width:200,height:128}),[0,1]);
});
test('eraser strokes remain editable vector operations across backups',()=>{const n=note(1);n.strokes.push({...stroke,tool:'eraser',width:24});assert.deepEqual(parseBackup(JSON.stringify(makeBackup([n],ids)),ids)[0].strokes,n.strokes);});

test('question overlay anchors survive validation, export and import alongside legacy notes',()=>{
 const n=note(1);n.strokes.push({...structuredClone(stroke),surface:'question',target:'question-en-0'});
 const restored=parseBackup(JSON.stringify(makeBackup([n],ids)),ids)[0];
 assert.deepEqual(restored,n);assert.equal(restored.strokes[0].surface,undefined);assert.equal(restored.strokes[1].target,'question-en-0');
});
test('invalid question overlay anchors are rejected before importing',()=>{
 for(const patch of [{surface:'html',target:'question-en-0'},{surface:'question',target:'<script>'},{surface:'question',target:''},{surface:'question'}]){const n=note(1);Object.assign(n.strokes[0],patch);assert.throws(()=>validateNote(n,ids));}
});
