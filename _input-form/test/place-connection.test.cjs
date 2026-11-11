const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../betweenusfriends/index.html'),'utf8');
const source=html.slice(html.indexOf('    function bindPlaces(lib)'),html.indexOf('    function initPlaces(key)'));

class Element {
  constructor(){this.value='';this.hidden=false;this.readOnly=false;this.children=[];this.listeners={};this.attrs={};}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  dispatchEvent(event){(this.listeners[event.type]||[]).forEach(fn=>fn(event));}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];}
  appendChild(child){this.children.push(child);}
  replaceChildren(){this.children=[];}
  contains(node){return this===node||this.children.includes(node);}
  focus(){this.focused=true;}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  const fields=Object.fromEntries(['place','maps','city','area','place-list','place-status','place-connection','maps-field','selected-maps','change-place','form'].map(id=>[id,new Element()]));
  const timers=new Map();let next=0,queries=0,detailResolve;
  const context={
    $:id=>fields[id],place:fields.place,form:fields.form,Event,console,
    document:{createElement:()=>new Element(),addEventListener(){}},
    window:{setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}},
    NoBallPlaces:{search:async()=>{queries++;return [{placePrediction:{}}];},suggestionLabel:()=>({main:'Selected place',secondary:'New York'}),readPlace:()=>new Promise(resolve=>{detailResolve=resolve;})},
    lib:{AutocompleteSessionToken:function(){}}
  };
  vm.runInNewContext(source+'\nbindPlaces(lib);',context);
  const fire=(node,type)=>node.dispatchEvent(new Event(type));
  const type=(text)=>{fields.place.value=text;fire(fields.place,'input');};
  const tick=async()=>{const todo=[...timers.values()];timers.clear();todo.forEach(fn=>fn());await settle();};
  const choose=async()=>{type('Selected');await tick();fire(fields['place-list'].children[0],'click');};
  return {fields,context,fire,type,tick,choose,resolve:values=>detailResolve(values),queries:()=>queries};
}
const selection={name:'Time Again',maps:'https://maps.google.com/?cid=123',city:'NYC',area:'Lower East Side'};

test('Google selection owns the Maps URL, without reopening suggestions',async()=>{
  const s=setup();await s.choose();s.resolve(selection);await settle();await s.tick();
  assert.equal(s.fields.maps.value,selection.maps);
  assert.equal(s.fields.maps.readOnly,true);
  assert.equal(s.fields['maps-field'].hidden,true);
  assert.equal(s.fields['place-connection'].hidden,false);
  assert.equal(s.fields['selected-maps'].href,selection.maps);
  assert.equal(s.fields['place-list'].hidden,true);
  assert.equal(s.queries(),1);
});
test('editing a selected name releases its URL and generated location, preserving custom neighborhood edits',async()=>{
  const s=setup();await s.choose();s.resolve(selection);await settle();
  s.fields.area.value='Chinatown';s.type('Another place');
  assert.equal(s.fields.maps.value,'');assert.equal(s.fields.maps.readOnly,false);
  assert.equal(s.fields['maps-field'].hidden,false);assert.equal(s.fields['place-connection'].hidden,true);
  assert.equal(s.fields.city.value,'');assert.equal(s.fields.area.value,'Chinatown');
});
test('Change place clears the connection and focuses the place search',async()=>{
  const s=setup();await s.choose();s.resolve(selection);await settle();s.fire(s.fields['change-place'],'click');
  assert.equal(s.fields.place.value,'');assert.equal(s.fields.place.focused,true);
  assert.equal(s.fields.maps.value,'');assert.equal(s.fields.area.value,'');
});
test('late place details cannot overwrite a newer search',async()=>{
  const s=setup();await s.choose();s.type('New search');s.resolve(selection);await settle();
  assert.equal(s.fields.place.value,'New search');assert.equal(s.fields.maps.value,'');assert.equal(s.fields.maps.readOnly,false);
});
test('reset releases the URL and rejects in-flight details',async()=>{
  const s=setup();await s.choose();s.fire(s.fields.form,'reset');s.resolve(selection);await settle();
  assert.equal(s.fields.maps.value,'');assert.equal(s.fields.maps.readOnly,false);assert.equal(s.fields['place-connection'].hidden,true);
});
test('stale search suggestions do not reopen after the input changes',async()=>{
  const s=setup();let finishSearch;s.context.NoBallPlaces.search=()=>new Promise(resolve=>{finishSearch=resolve;});
  s.type('Old query');await s.tick();s.type('New query');finishSearch([{placePrediction:{}}]);await settle();
  assert.equal(s.fields['place-list'].hidden,true);assert.equal(s.fields['place-list'].children.length,0);
});
