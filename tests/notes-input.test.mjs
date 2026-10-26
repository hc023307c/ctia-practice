import test from 'node:test';
import assert from 'node:assert/strict';
import {createStrokeScrollGuard,createStrokeSampler} from '../notes-input.js';
function environment(){
 const listeners=new Map(),calls=[];
 const doc={addEventListener:(name,handler,options)=>{assert.equal(options.passive,false);assert.equal(options.capture,true);listeners.set(name,handler);},removeEventListener:(name,handler,capture)=>{assert.equal(capture,true);assert.equal(listeners.get(name),handler);listeners.delete(name);}};
 // Any layout/style/scroll access is a regression: there is no body on this stub.
 return {doc,listeners,calls};
}
test('active stroke blocks native scroll and pinch without repositioning document or viewport',()=>{
 const {doc,listeners}=environment(),guard=createStrokeScrollGuard(doc),release=guard.lock();assert.equal(guard.active,true);
 for(const name of ['touchmove','wheel','gesturestart','gesturechange']){let prevented=false;listeners.get(name)({cancelable:true,preventDefault:()=>prevented=true});assert.ok(prevented);}
 listeners.get('touchmove')({cancelable:false,preventDefault:()=>assert.fail('noncancelable event')});release();release();assert.equal(guard.active,false);assert.equal(listeners.size,0);
});
test('second contact cannot replace gesture guard and cancellation releases all handlers',()=>{
 const {doc,listeners}=environment(),guard=createStrokeScrollGuard(doc),first=guard.lock();assert.equal(guard.lock(),null);guard.release();first();assert.equal(listeners.size,0);const next=guard.lock();assert.equal(typeof next,'function');next();guard.release();assert.equal(guard.active,false);
});
const rect={left:20,top:300,width:400,height:500};
const event=(x,y,time=100,pointerId=1)=>({clientX:x,clientY:y,timeStamp:time,pointerId});
test('normal handwriting uses a fixed frame and keeps consecutive independent strokes separate',()=>{
 const first=createStrokeSampler(event(100,400),rect);assert.deepEqual(first.first,[.2,.2]);assert.deepEqual(first.sample(event(110,420,110),rect),{point:[.225,.24]});assert.deepEqual(first.sample(event(150,440,120),rect),{point:[.325,.28]});const second=createStrokeSampler(event(120,450,150),rect);assert.deepEqual(second.first,[.25,.3]);
});
test('Safari viewport jump ends stroke before connecting displaced points or a return point',()=>{
 const sampler=createStrokeSampler(event(100,400),rect);assert.deepEqual(sampler.sample(event(105,410,110),rect),{point:[.2125,.22]});assert.deepEqual(sampler.sample(event(110,700,120),rect),{stop:true});assert.deepEqual(sampler.sample(event(112,420,130),rect),{stop:true});
});
test('canvas movement or resizing ends stroke even when pointer coordinates barely change',()=>{
 for(const change of [{top:280},{left:40},{width:440},{height:550}]){const sampler=createStrokeSampler(event(100,400),rect);assert.deepEqual(sampler.sample(event(105,410,110),{...rect,...change}),{stop:true});}
});
test('out-of-canvas points stop the stroke instead of clamping to the bottom edge',()=>{
 const sampler=createStrokeSampler(event(100,780),rect);assert.deepEqual(sampler.sample(event(102,820,110),rect),{stop:true});assert.equal(createStrokeSampler(event(0,0),rect),null);assert.equal(createStrokeSampler(event(NaN,400),rect),null);
});
test('stale timestamps and another pointer never append or corrupt the active stroke',()=>{
 const sampler=createStrokeSampler(event(100,400),rect);assert.deepEqual(sampler.sample(event(300,700,90),rect),{skip:true});assert.deepEqual(sampler.sample(event(300,700,110,2),rect),{skip:true});assert.deepEqual(sampler.sample(event(110,410,120),rect),{point:[.225,.22]});assert.deepEqual(sampler.sample(event(300,700,115),rect),{skip:true});
});
