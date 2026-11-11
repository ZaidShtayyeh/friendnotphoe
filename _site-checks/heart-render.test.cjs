const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/site-v3/heart.js'),'utf8');
function setup(mode='good'){
 const callbacks=new Map(),frames=new Map(),classes=new Set();let image,sequence=0,uploads=[];
 const fixture=(w,h)=>{const out=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;out[i]=190;out[i+1]=30;out[i+2]=y%200;out[i+3]=x>w/4&&x<w*.75&&y>h/4&&y<h*.75?255:0;}return out;};
 const context2d={drawImage(){},getImageData(x,y,w,h){return {data:fixture(w,h)}}};
 const gl=new Proxy({
  getShaderParameter:()=>mode!=='compile-error',getProgramParameter:()=>true,getShaderInfoLog:()=> 'test compile failure',
  checkFramebufferStatus:()=> 'FRAMEBUFFER_COMPLETE',getError:()=>mode==='upload-error'?'INVALID_OPERATION':'NO_ERROR',
  getUniformLocation:(p,name)=>name,texImage2D(...args){uploads.push(args);},
  readPixels(x,y,w,h,format,type,out){const expected=fixture(w,h);for(let row=0;row<h;row++)for(let col=0;col<w;col++)for(let c=0;c<4;c++){const i=(row*w+col)*4,j=((h-1-row)*w+col)*4;out[j+c]=mode==='corrupt'?255:expected[i+c]*(c===3?1:expected[i+3]/255);}},
 },{get:(target,k)=> k in target?target[k]:/^[A-Z_0-9]+$/.test(k)?k:()=>({})});
 const canvas={width:900,height:630,dataset:{},getContext:()=>mode==='no-webgl'?null:gl,getBoundingClientRect:()=>({width:390,height:273}),addEventListener:(name,fn)=>callbacks.set(name,fn),hasPointerCapture:()=>false};
 const host={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v)}};
 const status={textContent:''};
 const document={hidden:false,querySelector:s=>s==='#soft-heart'?canvas:s==='.heart-object'?host:status,createElement:()=>({getContext:()=>context2d}),addEventListener:(name,fn)=>callbacks.set(name,fn)};
 const context={document,window:{},matchMedia:()=>({matches:false}),devicePixelRatio:3,performance:{now:()=>1000},Image:class{constructor(){image=this;this.naturalWidth=1511;this.naturalHeight=1041;}},requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},console:{warn(){}},Float32Array,Uint8Array};
 vm.runInNewContext(source,context);
 const load=()=>mode==='image-error'?image.onerror():image?.onload();
 return {canvas,host,status,document,callbacks,classes,frames,uploads,load};
}
test('a validated image is uploaded as explicit RGBA bytes before revealing animation',()=>{
 const s=setup();assert.equal(s.classes.has('is-ready'),false);s.load();
 assert.equal(s.canvas.dataset.renderCheck,'passed');assert.equal(s.canvas.dataset.renderer,'elastic-webgl');assert.equal(s.classes.has('is-ready'),true);
 const imageUpload=s.uploads.find(args=>args.length===9&&args[3]===1511);
 assert.ok(imageUpload);assert.equal(imageUpload[4],1041);assert.equal(imageUpload[8].length,1511*1041*4);
});
for(const mode of ['corrupt','upload-error','compile-error','no-webgl','image-error'])test(mode+' leaves the clean image visible and stops animation',()=>{
 const s=setup(mode);s.load();assert.equal(s.canvas.dataset.renderer,'static');assert.equal(s.classes.has('is-ready'),false);assert.equal(s.frames.size,0);
});
test('context loss switches to the clean image and restoration validates before resuming',()=>{
 const s=setup();s.load();s.callbacks.get('webglcontextlost')({preventDefault(){}});
 assert.equal(s.classes.has('is-ready'),false);assert.equal(s.frames.size,0);
 s.callbacks.get('webglcontextrestored')();assert.equal(s.classes.has('is-ready'),false);s.load();assert.equal(s.classes.has('is-ready'),true);
});
test('returning from a background mobile tab resumes one animation loop',()=>{
 const s=setup();s.load();s.document.hidden=true;s.callbacks.get('visibilitychange')();assert.equal(s.frames.size,0);
 s.document.hidden=false;s.callbacks.get('visibilitychange')();assert.equal(s.frames.size,1);
 s.callbacks.get('visibilitychange')();assert.equal(s.frames.size,1);
});
