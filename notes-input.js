// Block native gestures without fixing/repositioning the document. Repositioning the
// body at every pen-down can change Safari's viewport coordinates during a stroke.
export function createStrokeScrollGuard(doc=document){
 let releaseCurrent=null;
 return {
  get active(){return releaseCurrent!==null;},
  lock(){
   if(releaseCurrent)return null;
   const options={passive:false,capture:true},events=['touchmove','wheel','gesturestart','gesturechange'];
   const prevent=e=>{if(e.cancelable)e.preventDefault();};
   for(const name of events)doc.addEventListener(name,prevent,options);
   let released=false;
   const release=()=>{if(released)return;released=true;for(const name of events)doc.removeEventListener(name,prevent,true);releaseCurrent=null;};
   releaseCurrent=release;return release;
  },
  release(){releaseCurrent?.();}
 };
}
function copyRect(rect){return {left:rect.left,top:rect.top,width:rect.width,height:rect.height};}
function within(event,rect){return Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&rect.width>0&&rect.height>0&&event.clientX>=rect.left&&event.clientX<=rect.left+rect.width&&event.clientY>=rect.top&&event.clientY<=rect.top+rect.height;}
// One coordinate frame per contact. Invalid transitions end the contact; never
// clamp a displaced point to the canvas edge or join across a viewport jump.
export function createStrokeSampler(event,rect){
 const frame=copyRect(rect),startTime=event.timeStamp,pointerId=event.pointerId;
 if(!within(event,frame))return null;
 let last={x:event.clientX,y:event.clientY,time:event.timeStamp},ended=false;
 const point=e=>[(e.clientX-frame.left)/frame.width,(e.clientY-frame.top)/frame.height];
 return {
  first:point(event),
  sample(e,currentRect){
   if(ended)return {stop:true};
   if(e.pointerId!==pointerId||e.timeStamp<startTime||e.timeStamp<last.time)return {skip:true};
   const moved=Object.keys(frame).some(key=>!Number.isFinite(currentRect[key])||Math.abs(currentRect[key]-frame[key])>1);
   if(moved||!within(e,frame)||Math.hypot(e.clientX-last.x,e.clientY-last.y)>96){ended=true;return {stop:true};}
   last={x:e.clientX,y:e.clientY,time:e.timeStamp};return {point:point(e)};
  }
 };
}
