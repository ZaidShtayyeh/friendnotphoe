const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../betweenusfriends/index.html'),'utf8');
const validate=require('../../betweenusfriends/validate.js');
const valid={submittedBy:'A friend',restaurant:'A spot',city:'NYC',area:'Chinatown',maps:'',hp:'270',category:'Food first',vibes:'Good food with friends.',move1:'Pasta',move2:'Salad',move3:'Cake',food:'80',drink:'0',scene:'75',photoData:'AAAA',photoType:'image/jpeg',photoName:'photo.jpg',startedAt:Date.now()-10000};
const progressSource=html.slice(html.indexOf('    function sectionProgress('),html.indexOf('    function updateProgress('));
const progressContext={NoBallValidate:validate,CARD:{vibes:{maxLines:4},moves:{maxLines:2}}};
vm.runInNewContext(progressSource,progressContext);
const progress=(body=valid,photo=true,fit)=>JSON.parse(JSON.stringify(progressContext.sectionProgress(body,photo,fit)));

test('section progress requires valid fields, including a loaded photo and three stats',()=>{
 assert.deepEqual(progress(),{'the-spot':true,'the-card':true,'the-moves':true,'the-stats':true});
 const incomplete={...valid,area:'',hp:'301',move2:'',drink:''};
 assert.deepEqual(progress(incomplete,false),{'the-spot':false,'the-card':false,'the-moves':false,'the-stats':false});
 assert.equal(progress(valid,false)['the-card'],false);
 assert.equal(progress({...valid,submittedBy:''})['the-spot'],true); // Author is separate from the spot.
});
test('progress rejects text that does not fit the printed card',()=>{
 assert.deepEqual(progress(valid,true,{name:false,vibes:5,moves:[1,3,1]}),{'the-spot':false,'the-card':false,'the-moves':false,'the-stats':true});
 assert.equal(progress({...valid,food:'0'})['the-stats'],true);
});
const finishSource=html.slice(html.indexOf('    function finish(body)'),html.indexOf("    form.addEventListener('submit'"));
function setup(response){
 let confirmed=0,requests=0;const messages=[];
 const context={NoBallValidate:validate,fitErrors:e=>e,showErrors(){},showStatus:(message,kind)=>messages.push({message,kind}),showSubmitted:()=>confirmed++,friendlyServer:s=>s,FORM_ENDPOINT:'https://local-test.invalid/submit',COPY:{fixIt:'fix',notConnected:'disconnected',unsure:'unconfirmed',offline:'offline'},Date,Promise,
 fetch:async()=>{requests++;if(response instanceof Error)throw response;return {type:'cors',status:200,text:async()=>JSON.stringify({ok:true}),...response};}};
 vm.runInNewContext(finishSource,context);
 return {run:body=>context.finish(body),confirmed:()=>confirmed,requests:()=>requests,messages};
}
test('only a confirmed successful response shows the submitted card',async()=>{
 const s=setup({});await s.run(valid);assert.equal(s.confirmed(),1);assert.equal(s.requests(),1);assert.equal(s.messages.length,0);
});
for(const [name,response,expected] of [
 ['opaque',{type:'opaque',status:0},'unconfirmed'],
 ['rejected',{text:async()=>JSON.stringify({ok:false,error:'Rejected'})},'Rejected'],
 ['network failure',new Error('offline'),'offline']
])test(name+' never shows success or clears the card',async()=>{const s=setup(response);await s.run(valid);assert.equal(s.confirmed(),0);assert.equal(s.messages[0].message,expected);});
test('invalid cards are not sent',async()=>{const s=setup({});await s.run({...valid,restaurant:''});assert.equal(s.requests(),0);assert.equal(s.confirmed(),0);});
