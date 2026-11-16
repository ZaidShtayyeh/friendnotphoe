const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../../betweenusfriends/hold-submit.js');
function setup(){
 function target(){const handlers={};return{addEventListener(t,h){(handlers[t]??=[]).push(h);},removeEventListener(t,h){handlers[t]=handlers[t].filter(x=>x!==h);},fire(t,e={}){(handlers[t]||[]).forEach(h=>h({preventDefault(){},...e}));}};}
 const button=target(),doc=target(),win=target();let now=0,frames=new Map(),id=0,calls=0;
 Object.assign(button,{disabled:false,style:{setProperty(k,v){button.progress=Number(v);}},classList:{add(){},remove(){}},focus(){}});
 const hold=create(button,{document:doc,window:win,now:()=>now,requestFrame:f=>{frames.set(++id,f);return id;},cancelFrame:i=>frames.delete(i),onComplete:()=>{calls++;}});
 return{button,doc,win,hold,calls:()=>calls,tick(t){now=t;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f());},down(){button.fire('pointerdown',{button:0,isPrimary:true,pointerId:1});},up(){button.fire('pointerup',{pointerId:1});}};
}
test('a short click or canceled gesture never submits',()=>{
 for(const ending of ['pointerup','pointercancel','pointerleave']){const s=setup();s.down();s.tick(400);s.button.fire(ending,{pointerId:1});s.tick(2000);s.button.fire('click',{detail:1});assert.equal(s.calls(),0);assert.equal(s.button.progress,0);}
});
test('a full hold submits once and its generated click cannot submit twice',()=>{
 const s=setup();s.down();s.tick(500);assert.ok(s.button.progress>0 && s.button.progress<1);s.tick(1100);s.tick(2000);s.up();s.button.fire('click',{detail:1});assert.equal(s.calls(),1);
});
test('keyboard holds work and early key release cancels',()=>{
 const s=setup();s.button.fire('keydown',{key:' '});s.tick(100);s.button.fire('keyup',{key:' '});s.button.fire('click',{detail:0});assert.equal(s.calls(),0);
 s.button.fire('keydown',{key:'Enter'});s.tick(1200);s.button.fire('keyup',{key:'Enter'});s.button.fire('click',{detail:0});assert.equal(s.calls(),1);
});
test('backgrounding or disabling the button cancels an in-progress hold',()=>{
 for(const stop of [s=>s.win.fire('blur'),s=>{s.doc.hidden=true;s.doc.fire('visibilitychange');},s=>s.button.disabled=true]){const s=setup();s.down();stop(s);s.tick(2000);assert.equal(s.calls(),0);}
});
test('assistive technology can activate the reviewed card and retry after failure',()=>{
 const s=setup();s.button.fire('click',{detail:0});assert.equal(s.calls(),1);s.button.disabled=true;s.button.fire('click',{detail:0});assert.equal(s.calls(),1);s.button.disabled=false;s.hold.reset();s.button.fire('click',{detail:0});assert.equal(s.calls(),2);
});
test('secondary pointers and held-key repeat do not create extra submissions',()=>{
 const s=setup();s.button.fire('pointerdown',{button:2,isPrimary:true});s.tick(2000);assert.equal(s.calls(),0);s.button.fire('keydown',{key:'Enter'});s.tick(2500);s.button.fire('keydown',{key:'Enter',repeat:true});s.tick(3100);assert.equal(s.calls(),1);
});
