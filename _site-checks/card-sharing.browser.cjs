const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {chromium}=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sharp=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/qa/card-sharing-2026-11-21');fs.mkdirSync(out,{recursive:true});
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/card-share/manifest.js'),'utf8'),ctx);
const shares=ctx.window.FNP_CARD_SHARES,origin=process.env.FNP_SHARE_TEST_URL||'http://127.0.0.1:8877/';
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{window.__shared={url:d.url,file:d.files?.[0]?.name,bytes:d.files?.[0]?Array.from(new Uint8Array(await d.files[0].arrayBuffer())):null}}});
 });
 await page.goto(origin+'#card/camino');await page.waitForSelector('#detail-image img');
 for(let i=0;i<30;i++){await page.locator('#share-card').click();if(await page.evaluate(()=>!!window.__shared?.bytes))break;await page.waitForTimeout(100)}
 const shared=await page.evaluate(()=>window.__shared);assert.equal(shared.url,shares[101].url);assert.equal(shared.file,'camino.jpg');
 const bytes=Buffer.from(shared.bytes),expected=fs.readFileSync(path.join(root,shares[101].image));assert.ok(bytes.equals(expected),'native file is the correct pre-rendered JPEG');
 fs.writeFileSync(path.join(out,'native-camino.jpg'),bytes);
 const stat=await sharp(bytes).stats();assert.ok(stat.channels.every(c=>c.mean>40),'JPEG is not black');
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});window.__shared=null});
 await page.locator('#share-card').click();assert.deepEqual(await page.evaluate(()=>({url:window.__shared.url,file:window.__shared.file||null})),{url:shares[101].url,file:null});
 await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>window.__copied=t}})});
 await page.locator('#share-card').click();assert.equal(await page.evaluate(()=>window.__copied),shares[101].url);
 await page.goto(shares[101].url.replace('https://friendnotphoe.com/',origin));await page.waitForSelector('#detail-image img');assert.equal(await page.locator('#card-dialog').getAttribute('data-card-id'),'101');
 await page.screenshot({path:path.join(out,'shared-card-phone.png')});
 await page.keyboard.press('Escape');assert.deepEqual(await page.locator('#creator-filter option').allTextContents(),['Everyone','Z','Friends']);
 assert.deepEqual(errors,[]);
 const crawler=await browser.newPage({javaScriptEnabled:false,userAgent:'WhatsApp/2.0'});
 await crawler.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await crawler.goto(shares[101].url.replace('https://friendnotphoe.com/',origin));
 assert.equal(await crawler.locator('meta[property="og:image"]').getAttribute('content'),'https://friendnotphoe.com/'+shares[101].preview);
 assert.equal(await crawler.locator('meta[property="og:image:width"]').getAttribute('content'),'1200');
 assert.ok(crawler.url().includes('/cards/camino/'));
 assert.match(await crawler.title(),/Camino/);
 const response=await crawler.request.get(origin+shares[101].preview);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/image\/jpeg/);
 fs.writeFileSync(path.join(out,origin.startsWith('https:')?'production.json':'browser.json'),JSON.stringify({origin,nativeAttachment:true,jpegNotBlack:true,directLinkReady:true,linkOnly:true,clipboard:true,crawlerMetadata:true,redirect:true,labels:['Everyone','Z','Friends'],errors},null,2));
 console.log('PASS sharing: direct-link HD JPEG, non-black image, link-only and clipboard URLs, crawler metadata/image, visitor opens correct card, Everyone/Z/Friends');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
