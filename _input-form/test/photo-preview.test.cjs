const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../betweenusfriends/index.html'),'utf8');
function code(start,end){return html.slice(html.indexOf('    '+start),html.indexOf('    '+end));}
const sniff=code('function sniffType(','function blobToBase64(');
const native=code('function loadNativeBitmap(','var heicDecoderPromise');
const load=code('function loadBitmap(','function canvasBlob(');
const take=code('function takeFile(',"photoInput.addEventListener('change'");

test('Photos HEIC and HEIF files are recognized even without MIME metadata',()=>{
 const c={};vm.runInNewContext(sniff,c);
 for(const file of [{name:'IMG.HEIC'},{name:'IMG.HEIF'},{type:'image/heif'},{type:'application/octet-stream',name:'IMG.heic'}])assert.equal(c.sniffType(file),'image/heic');
 assert.equal(c.sniffType({type:'image/jpeg'}),'image/jpeg');
 assert.equal(c.sniffType({name:'document.pdf'}),'');
});
test('native bitmap failures fall back to the browser image element',async()=>{
 let attempts=0;const photo={width:3000,height:2000};
 const c={createImageBitmap:async()=>{attempts++;throw Error('unsupported');},loadImageElement:async()=>photo};
 vm.runInNewContext(native,c);assert.equal(await c.loadNativeBitmap({}),photo);assert.equal(attempts,2);
});
test('successful native HEIC decoding does not download the fallback decoder',async()=>{
 const photo={};let decodes=0;const c={loadNativeBitmap:async()=>photo,loadHeicBitmap:async()=>{decodes++;},sniffType:()=> 'image/heic'};
 vm.runInNewContext(load,c);assert.equal(await c.loadBitmap({}),photo);assert.equal(decodes,0);
});
test('only unsupported HEIC files use the fallback decoder',async()=>{
 const photo={};let decodes=0;const err=Error('native failed');
 const c={loadNativeBitmap:async()=>{throw err;},loadHeicBitmap:async()=>{decodes++;return photo;}};
 vm.runInNewContext(sniff+load,c);assert.equal(await c.loadBitmap({name:'IMG.HEIC'}),photo);
 await assert.rejects(c.loadBitmap({name:'bad.png'}),/native failed/);assert.equal(decodes,1);
});
function setup(){
 const elements={};const node=()=>({textContent:'',hidden:false,classList:{add(){},remove(){}}});
 const old={kind:'image',source:{},url:'old'};const revoked=[],closed=[];
 const c={shotToken:0,photoBusy:false,photo:old,$:id=>elements[id]??=(node()),photoStatus:m=>c.status=m,drop:node(),framer:node(),photoInput:{value:''},sniffType:()=> 'image/heic',shotError:()=> 'Could not open photo',displayUrl:async s=>'url-'+s.id,sourceSize:()=>({w:3000,h:2000}),releasePhoto(){c.released=true;},renderPhoto(){c.rendered=true;},popCard(){},updateProgress(){},mobileQuery:{matches:false},prefersReducedMotion:true,URL:{revokeObjectURL:u=>revoked.push(u)},Promise,Error};
 vm.runInNewContext(take,c);
 const source=id=>({id,close:()=>closed.push(id)});
 return {c,elements,old,revoked,closed,source,flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('decode errors keep the previous good photo and clear the loading state',async()=>{
 const t=setup();t.c.loadBitmap=async()=>{throw Error('bad HEIC');};t.c.takeFile({name:'bad.heic'});await t.flush();
 assert.equal(t.c.photo,t.old);assert.equal(t.c.photoBusy,false);assert.equal(t.c.status,'');assert.equal(t.elements['err-photo'].textContent,'Could not open photo');assert.equal(t.c.rendered,undefined);
});
test('replacing a photo while decoding keeps the newest one and frees the stale bitmap',async()=>{
 const t=setup();const pending={};t.c.loadBitmap=f=>new Promise(r=>pending[f.name]=r);
 t.c.takeFile({name:'first.heic'});t.c.takeFile({name:'second.heic'});
 pending['second.heic'](t.source('second'));await t.flush();pending['first.heic'](t.source('first'));await t.flush();
 assert.equal(t.c.photo.source.id,'second');assert.deepEqual(t.closed,['first']);assert.deepEqual(t.revoked,['url-first']);
});
test('a failed preview render frees the decoded source and preserves the old photo',async()=>{
 const t=setup();t.c.loadBitmap=async()=>t.source('bad');t.c.displayUrl=()=>{throw Error('canvas');};t.c.takeFile({name:'bad.heic'});await t.flush();
 assert.equal(t.c.photo,t.old);assert.deepEqual(t.closed,['bad']);assert.equal(t.c.photoBusy,false);
});
