// A stroke temporarily pins the document on iOS as well as desktop browsers.
// Keep the original viewport and inline styles so finishing/cancelling never jumps.
export function createStrokeScrollGuard(view=window,doc=document){
 let releaseCurrent=null;
 return {
  get active(){return releaseCurrent!==null;},
  lock(){
   if(releaseCurrent)return null;
   const x=view.scrollX,y=view.scrollY,body=doc.body,html=doc.documentElement;
   const bodyWidth=body.getBoundingClientRect().width,saved=[];
   function set(element,name,value){saved.push([element,name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)]);element.style.setProperty(name,value,'important');}
   set(html,'scroll-behavior','auto');set(html,'overscroll-behavior','none');set(html,'overflow','hidden');
   set(body,'position','fixed');set(body,'top',`${-y}px`);set(body,'left',`${-x}px`);set(body,'width',`${bodyWidth}px`);set(body,'overflow','hidden');
   let released=false;
   const release=()=>{
    if(released)return;released=true;
    // Restore scrolling only after removing the fixed body; restore smooth behavior last.
    for(const [element,name,value,priority] of saved.slice(1).reverse())if(value)element.style.setProperty(name,value,priority);else element.style.removeProperty(name);
    view.scrollTo(x,y);
    const [element,name,value,priority]=saved[0];if(value)element.style.setProperty(name,value,priority);else element.style.removeProperty(name);
    releaseCurrent=null;
   };
   releaseCurrent=release;return release;
  },
  release(){releaseCurrent?.();}
 };
}
