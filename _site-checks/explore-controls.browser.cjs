const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=(process.env.FNP_TEST_ORIGIN||'http://127.0.0.1:8877/').replace(/\/$/,''),url=origin+'/?palette=forest#explore';
const output=path.resolve(__dirname,'../output/qa/explore-controls-2026-11-22',origin.startsWith('https:')?'live':'local');fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});const errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url())});
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const settleImages=()=>page.evaluate(()=>Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.top<innerHeight&&r.bottom>0}).map(i=>i.decode().catch(()=>{}))));
 const ids=()=>page.locator('#cards .card-button').evaluateAll(es=>es.map(e=>+e.dataset.card));
 await page.goto(url);assert.equal(await page.locator('#surprise').count(),0);await page.waitForFunction(()=>document.querySelectorAll('#cards .card-button').length===120);
 assert.equal(await page.locator('#creator-picker-value').textContent(),'Everyone');assert.equal(await page.locator('#sort-picker-value').textContent(),'Randoo');
 await settleImages();await page.screenshot({path:path.join(output,'desktop.png')});
 await page.locator('#creator-picker').click();await page.waitForSelector('#filter-picker[open]');
 assert.deepEqual(await page.locator('.choice-name').allTextContents(),['Everyone','Z','Friends']);assert.deepEqual(await page.locator('.choice-note').allTextContents(),['120 cards','113 cards','7 cards']);
 await settleImages();await page.screenshot({path:path.join(output,'desktop-picker.png')});
 await page.locator('.choice-option[data-value="friends"]').click();assert.equal((await ids()).length,7);assert.equal(await page.locator('#creator-picker-value').textContent(),'Friends');assert.equal(await page.locator('#creator-picker').evaluate(e=>e===document.activeElement),true);
 await page.locator('#reset-filters').click();assert.equal(await page.locator('#creator-picker-value').textContent(),'Everyone');assert.equal((await ids()).length,120);
 await page.locator('[data-arrange="all"]').click();assert.equal(await page.locator('#cards .city-group').count(),0);assert.equal(await page.locator('#group-by-city').isChecked(),false);
 const random=await ids();
 await page.locator('#sort-picker').click();await page.locator('.choice-option[data-value="hp"]').click();assert.equal(await page.locator('#sort-picker-value').textContent(),'Highest HP');
 const expected=await page.evaluate(()=>[...window.FNP_DATA.cards].sort((a,b)=>b.hp-a.hp||a.name.localeCompare(b.name)).map(c=>c.id));assert.deepEqual(await ids(),expected);
 await page.locator('#sort-picker').click();await page.locator('.choice-option[data-value="random"]').click();assert.deepEqual(await ids(),random);
 await page.locator('[data-arrange="city"]').click();assert.equal(await page.locator('#cards .city-group').count(),13);assert.equal(await page.locator('[data-arrange="city"]').getAttribute('aria-pressed'),'true');
 for(const width of [320,390,430,768,1440]){
  await page.setViewportSize({width,height:width<700?844:1100});await page.goto(url);await page.waitForSelector('#cards .card-button');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
  const layout=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {meta:rect('.results-meta'),group:rect('.arrange-control'),picker:rect('#creator-picker'),views:rect('.browse-tools .view-switch'),labelSize:getComputedStyle(document.querySelector('.category>span:last-child')).fontSize,pickerSize:getComputedStyle(document.querySelector('.word-picker')).fontSize}});
  assert.ok(layout.meta.x+layout.meta.w<=layout.group.x,'group on right '+width);assert.ok(Math.abs(layout.meta.y+layout.meta.h/2-layout.group.y-layout.group.h/2)<1,'count and group share row '+width);
  if(width<700){assert.equal(layout.labelSize,layout.pickerSize);assert.ok(layout.group.w<130);assert.ok(Math.abs(layout.picker.y-layout.views.y)<1);}
  if(width===390){
   await settleImages();await page.screenshot({path:path.join(output,'phone.png')});
   await page.locator('#creator-picker').click();await settleImages();await page.screenshot({path:path.join(output,'phone-from.png')});
   const box=await page.locator('#filter-picker').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);assert.ok(Math.abs(box.y+box.height-844)<2);
   await page.keyboard.press('Escape');assert.ok(!await page.locator('#filter-picker').evaluate(e=>e.open));
   await page.locator('#sort-picker').click();await settleImages();await page.screenshot({path:path.join(output,'phone-sort.png')});
   await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.dataset.value),'hp');await page.keyboard.press('Enter');assert.equal(await page.locator('#sort-picker-value').textContent(),'Highest HP');
   await page.locator('#reset-filters').click();assert.equal(await page.locator('#sort-picker-value').textContent(),'Randoo');
   await page.locator('[data-arrange="all"]').click();assert.equal(await page.locator('#cards .city-group').count(),0);await settleImages();await page.screenshot({path:path.join(output,'phone-all-together.png')});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 fs.writeFileSync(path.join(output,'validation.json'),JSON.stringify({cards:120,creatorCounts:[120,113,7],sort:true,grouping:true,keyboard:true,focusReturn:true,phoneSheet:true,widths:[320,390,430,768,1440],removedSurprise:true,compactGrouping:true,errors,missing},null,2));
 console.log('PASS Explore controls:',origin,'word pickers, grouping, reset, keyboard/focus, phone panels, compact 320–1440px layouts; surprise removed.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
