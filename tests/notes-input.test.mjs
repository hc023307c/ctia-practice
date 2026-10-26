import test from 'node:test';
import assert from 'node:assert/strict';
import {createStrokeScrollGuard} from '../notes-input.js';
function environment(){
 function element(){const styles=new Map();return {style:{getPropertyValue:n=>styles.get(n)?.[0]||'',getPropertyPriority:n=>styles.get(n)?.[1]||'',setProperty:(n,v,p='')=>styles.set(n,[v,p]),removeProperty:n=>styles.delete(n)},getBoundingClientRect:()=>({width:980})};}
 const doc={body:element(),documentElement:element()},calls=[];
 const view={scrollX:12,scrollY:785,scrollTo:(x,y)=>{calls.push([x,y]);assert.equal(doc.body.style.getPropertyValue('position'),'');assert.equal(doc.documentElement.style.getPropertyValue('scroll-behavior'),'auto');}};
 return {doc,view,calls};
}
test('stroke pins current viewport without changing the content width and restores scroll exactly once',()=>{
 const {doc,view,calls}=environment(),guard=createStrokeScrollGuard(view,doc),release=guard.lock();
 assert.equal(guard.active,true);assert.equal(doc.body.style.getPropertyValue('position'),'fixed');assert.equal(doc.body.style.getPropertyValue('top'),'-785px');assert.equal(doc.body.style.getPropertyValue('left'),'-12px');assert.equal(doc.body.style.getPropertyValue('width'),'980px');
 release();release();assert.equal(guard.active,false);assert.deepEqual(calls,[[12,785]]);assert.equal(doc.body.style.getPropertyValue('width'),'');assert.equal(doc.documentElement.style.getPropertyValue('overflow'),'');
});
test('stroke release preserves existing inline values and priorities including smooth scrolling',()=>{
 const {doc,view}=environment();doc.body.style.setProperty('width','90%','important');doc.body.style.setProperty('overflow','clip');doc.documentElement.style.setProperty('scroll-behavior','smooth');doc.documentElement.style.setProperty('overscroll-behavior','contain');
 const guard=createStrokeScrollGuard(view,doc);guard.lock();guard.release();
 assert.equal(doc.body.style.getPropertyValue('width'),'90%');assert.equal(doc.body.style.getPropertyPriority('width'),'important');assert.equal(doc.body.style.getPropertyValue('overflow'),'clip');assert.equal(doc.documentElement.style.getPropertyValue('scroll-behavior'),'smooth');assert.equal(doc.documentElement.style.getPropertyValue('overscroll-behavior'),'contain');
});
test('second finger cannot replace an active lock and cancellation allows the next stroke',()=>{
 const {doc,view,calls}=environment(),guard=createStrokeScrollGuard(view,doc);const first=guard.lock();assert.equal(guard.lock(),null);guard.release();first();const next=guard.lock();assert.equal(typeof next,'function');next();guard.release();assert.equal(guard.active,false);assert.equal(calls.length,2);
});
