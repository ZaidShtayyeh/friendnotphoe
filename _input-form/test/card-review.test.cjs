const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../betweenusfriends/index.html'),'utf8');
const validate=require('../../betweenusfriends/validate.js');
const source=html.slice(html.indexOf('    function cardSignature()'),html.indexOf("    form.addEventListener('submit', function (event)"));
const valid={submittedBy:'A friend',restaurant:'A spot',maps:'',city:'NYC',area:'Chinatown',hp:'270',category:'Food first',vibes:'Good food.',move1:'Pasta',move2:'',move3:'',food:'80',drink:'0',scene:'70',photoData:'AAAA',photoType:'image/jpeg',photoName:'photo.jpg'};
function setup(){
 const els={};const element=()=>({textContent:'',disabled:false,focus(){}});const c={Promise,JSON,Object,NoBallValidate:validate,submissionComplete:false,photoBusy:false,reviewSending:false,reviewBody:null,reviewSignature:'',photo:{url:'photo'},photoState:{data:'AAAA',name:'photo.jpg',type:'image/jpeg'},sendBtn:element(),reviewSubmit:element(),$:(id)=>els[id]??=(element()),COPY:{sending:'Sending',squishing:'Loading',fixIt:'Fix fields'},body:{...valid},crop:{sx:0,sy:0,sw:200,sh:100},errors:null,status:'',exports:0,posts:0,
  payload(){return {...c.body,photoData:c.photoState.data,photoName:c.photoState.name,photoType:c.photoState.type};},cropRect:()=>c.crop,clearStatus(){c.status='';},clearFieldErrors(){c.errors=null;},showStatus(m){c.status=m;},showErrors(e){c.errors=e;},fitErrors:e=>e,renderCard(){},setStage(){},holoReset(){},setBusy(b){c.sendBtn.disabled=b;},exportShot:async()=>{c.exports++;return c.photoState;},finish:async body=>{c.posts++;c.sent=body;}};
 c.reviewDialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
 c.stage={insertBefore(w){w.parentNode=this;}};c.wrap={parentNode:c.stage};c.$('review-card-mount').appendChild=w=>w.parentNode=c.$('review-card-mount');
 vm.runInNewContext(source,c);return c;
}
test('first submit reviews a complete one-move card; only explicit confirmation posts',async()=>{
 const c=setup();await c.confirmReview();assert.equal(c.posts,0);
 await c.requestReview();assert.equal(c.reviewDialog.open,true);assert.equal(c.exports,1);assert.equal(c.posts,0);
 await c.confirmReview();assert.equal(c.posts,1);assert.equal(c.sent.move2,'');assert.equal(c.sent.move3,'');
});
test('every required field must be complete before review or any upload',async()=>{
 for(const key of ['submittedBy','restaurant','city','area','hp','category','vibes','move1','food','drink','scene']){
  const c=setup();c.body[key]='';await c.requestReview();assert.equal(c.reviewDialog.open,false,key);assert.ok(c.errors[key],key);assert.equal(c.exports,0);assert.equal(c.posts,0);
 }
 const c=setup();c.photo=null;await c.requestReview();assert.ok(c.errors.photo);assert.equal(c.exports,0);
});
test('loading photos and text that does not fit cannot reach review',async()=>{
 const c=setup();c.photoBusy=true;await c.requestReview();assert.equal(c.exports,0);assert.equal(c.status,'Loading');
 c.photoBusy=false;c.fitErrors=()=>({vibes:'fit'});await c.requestReview();assert.equal(c.reviewDialog.open,false);assert.equal(c.exports,0);
});
test('editing or dismissing review requires another review and preserves the card',async()=>{
 const c=setup();await c.requestReview();c.closeReview();await c.confirmReview();assert.equal(c.posts,0);assert.equal(c.wrap.parentNode,c.stage);assert.equal(c.body.restaurant,'A spot');
 await c.requestReview();assert.equal(c.reviewDialog.open,true);
});
test('a changed crop or field invalidates the reviewed card',async()=>{
 for(const change of [c=>c.body.vibes='Changed',c=>c.crop.sy=10,c=>c.photo.url='replacement']){
  const c=setup();await c.requestReview();change(c);await c.confirmReview();assert.equal(c.posts,0);assert.equal(c.reviewDialog.open,false);assert.match(c.status,/changed/);
 }
});
test('editing during export cannot open a stale review',async()=>{
 const c=setup();let resolve;c.exportShot=()=>new Promise(r=>resolve=r);const opening=c.requestReview();c.body.restaurant='Changed';resolve(c.photoState);await opening;assert.equal(c.reviewDialog.open,false);assert.match(c.status,/changed/);assert.equal(c.sendBtn.disabled,false);
});
test('repeated confirmation cannot double-submit and a failure can be retried',async()=>{
 const c=setup();let resolve;c.finish=()=>{c.posts++;return new Promise(r=>resolve=r);};await c.requestReview();const sending=c.confirmReview();await c.confirmReview();assert.equal(c.posts,1);assert.equal(c.reviewSubmit.disabled,true);resolve();await sending;assert.equal(c.reviewSubmit.disabled,false);assert.equal(c.reviewDialog.open,true);
});
