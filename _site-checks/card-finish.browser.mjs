import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'output/qa/card-finish-v1');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.json':'application/json'};
const server=http.createServer((req,res)=>{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';
  const file=path.join(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
  browser=await chromium.launch({headless:true,...(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'})});
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url());});
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin+'/#explore');await page.waitForFunction(()=>document.querySelectorAll('#cards .card-item').length===window.FNP_DATA.cards.length);
  const expectedCount=await page.evaluate(()=>window.FNP_DATA.cards.length);
  assert.equal(await page.locator('#cards .front-print').count(),expectedCount);
  assert.equal(await page.locator('#cards .twinkle').count(),expectedCount*6);
  assert.equal(await page.locator('.category .mini-deck img').count(),8);
  const source=await page.evaluate(()=>window.FNP_DATA.cards);
  const slug=c=>c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  for(const type of ['drink','food','special']){
    const card=source.find(c=>c.vibes[0]===type);
    await page.goto(origin+'/#card/'+slug(card));
    await page.waitForSelector('#card-dialog[open] .front-print img');
    assert.equal(await page.locator('#card-dialog .twinkle').count(),7);
    assert.deepEqual(await page.locator('#card-dialog img').evaluate(img=>[img.naturalWidth,img.naturalHeight]),[1500,2100]);
    assert.equal(await page.locator('#card-dialog .front-print').evaluate(el=>getComputedStyle(el,'::after').mixBlendMode),'multiply');
    await page.locator('#card-dialog .front-print').screenshot({path:path.join(out,type+'-front.png')});
    await page.keyboard.press('Escape');
  }
  const pixels=await page.evaluate(async()=>{
    const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});
    const base=await load('assets/cards-finish-v12/theyork.webp');
    const canvas=document.createElement('canvas');canvas.width=1500;canvas.height=2100;const ctx=canvas.getContext('2d');ctx.drawImage(base,0,0);
    const before=ctx.getImageData(0,0,1500,2100).data;
    const applied=await window.FnpCardFinish.paint(ctx),after=ctx.getImageData(0,0,1500,2100).data;
    const changed=(x0,y0,x1,y1,circle=false,opaque=false)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(circle&&(x-1309.3)**2+(y-170.8)**2>41**2)continue;const i=(y*1500+x)*4;if(opaque&&before[i+3]!==255)continue;for(let ch=0;ch<4;ch++)if(before[i+ch]!==after[i+ch]){n++;break;}}return n;};
    const edge=[];for(let y=0;y<90;y++)for(let x=0;x<1500;x++){const i=(y*1500+x)*4;if(before.slice(i,i+4).some((v,ch)=>v!==after[i+ch]))edge.push([x,y,[...before.slice(i,i+4)],[...after.slice(i,i+4)]]);}
    return {edge,applied,photo:changed(176,246,1324,996),icon:changed(1261,123,1357,219,true),tatreez:changed(0,0,1500,90,false,true),paper:changed(160,1150,1340,1400)};
  });
  // Canvas readback can round semi-transparent corner RGB by one; alpha must stay exact.
  assert.ok(pixels.edge.every(([, ,a,b])=>a[3]===b[3]&&a.every((v,i)=>Math.abs(v-b[i])<=1)));assert.ok(pixels.applied);assert.equal(pixels.photo,0);assert.equal(pixels.icon,0);assert.equal(pixels.tatreez,0);assert.ok(pixels.paper>1000);
  for(const color of ['blue','green','gold']){
    const dims=await page.evaluate(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve([i.naturalWidth,i.naturalHeight]);i.onerror=reject;i.src=src;}),'assets/card-finish-v1/backs/'+color+'.webp');
    assert.deepEqual(dims,[1500,2100]);
  }
  await page.goto(origin+'/#explore');await page.waitForSelector('#cards .card-button');
  await page.selectOption('#sort','hp');
  assert.equal(await page.locator('#cards .card-button').first().getAttribute('data-card'),String([...source].sort((a,b)=>b.hp-a.hp||a.name.localeCompare(b.name))[0].id));
  await page.locator('#group-by-city').uncheck();assert.equal(await page.locator('#cards .front-print').count(),expectedCount);
  await page.locator('#cards .card-button').first().click();await page.waitForSelector('#card-dialog .front-print img');
  await page.keyboard.press('ArrowRight');await page.waitForSelector('#card-dialog[aria-label]:not([aria-busy="true"]) .front-print img');await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{if(data.files?.[0]){const f=data.files[0],im=await createImageBitmap(f);window.__sharedCard={name:f.name,width:im.width,height:im.height};im.close();}}});
  });
  await page.locator('#cards .card-button').nth(2).click();await page.waitForSelector('#detail-image img');
  for(let i=0;i<30;i++){await page.locator('#share-card').click();if(await page.evaluate(()=>!!window.__sharedCard))break;await page.waitForTimeout(100);}
  const shared=await page.evaluate(()=>window.__sharedCard);assert.equal(shared.width,1500);assert.equal(shared.height,2100);assert.ok(shared.name.endsWith('.jpg'));await page.keyboard.press('Escape');
  await page.locator('[data-view="map"]').click();await page.waitForSelector('.leaflet-marker-icon');
  await page.evaluate(()=>document.querySelector('.leaflet-marker-icon').click());await page.waitForSelector('.map-popup .front-print');
  assert.equal(Math.round((await page.locator('.map-popup .front-print').boundingBox()).width),92);
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/#explore');await page.waitForSelector('#cards .front-print');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(out,'phone-explore.png')});
  await page.locator('#cards .card-button').first().click();await page.waitForSelector('#card-dialog .front-print img');
  const box=await page.locator('#card-dialog .front-print').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);assert.ok(Math.abs(box.height/box.width-1.4)<.01);
  await page.screenshot({path:path.join(out,'phone-card.png')});
  await page.goto(origin+'/betweenusfriends/');await page.waitForSelector('.approved-front-surface',{state:'attached'});
  assert.equal(await page.locator('.approved-front-surface').count(),1);
  await page.locator('#stageTab').click();
  await page.locator('[data-inspo]').first().click();await page.waitForSelector('#inspo[open]');
  const inspo=await page.locator('#inspoCard').boundingBox();assert.ok(inspo.width>100&&inspo.x>=0&&inspo.x+inspo.width<=390);
  assert.equal(await page.locator('#inspoCard').evaluate(el=>getComputedStyle(el,'::after').mixBlendMode),'multiply');
  await page.screenshot({path:path.join(out,'phone-creator-inspiration.png')});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(origin+'/#home');
  await page.waitForFunction(()=>[...document.querySelectorAll('.flight-card img')].length===4&&[...document.querySelectorAll('.flight-card img')].every(img=>img.complete&&img.naturalWidth===750&&img.loading==='eager'));
  await page.evaluate(()=>window.scrollTo(0,document.querySelector('.home-journey').offsetHeight));
  await page.waitForFunction(()=>document.body.dataset.page==='explore');assert.equal(await page.locator('.awaiting-landing').count(),0);
  assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({cards:expectedCount,glints:{grid:6,detail:7},protectedPixelChanges:pixels,missing,errors},null,2));
  console.log('PASS: all published cards, 3 colors, HD sources, unchanged photos/icons/tatreez, textured JPEG sharing, map popups, sort/group controls, entrance landing, desktop/phone layout, creator surface, no script errors or missing local assets.');
}finally{await browser?.close();server.close();}
