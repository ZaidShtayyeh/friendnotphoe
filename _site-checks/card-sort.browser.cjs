const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.FNP_TEST_ORIGIN||'http://127.0.0.1:8877/';
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const order=()=>page.locator('#cards .card-button').evaluateAll(es=>es.map(e=>+e.dataset.card));
 const selectCity=async city=>{await page.locator('#city-picker').click();await page.locator('[data-city="'+city+'"]').click()};
 await page.goto(origin+'#explore');await page.waitForSelector('#cards .card-button');
 const cards=await page.evaluate(()=>window.FNP_DATA.cards);
 assert.equal(await page.locator('#sort').inputValue(),'random');
 assert.deepEqual(await page.locator('#sort option').allTextContents(),['Randoo','Highest HP first','Name: A–Z']);
 await page.locator('#group-by-city').uncheck();
 const random=await order();assert.equal(random.length,cards.length);
 assert.deepEqual([...random].sort((a,b)=>a-b),cards.map(c=>c.id).sort((a,b)=>a-b));
 const hp=[...cards].sort((a,b)=>b.hp-a.hp||a.name.localeCompare(b.name)).map(c=>c.id);
 await page.selectOption('#sort','hp');assert.deepEqual(await order(),hp);
 assert.equal(new URL(page.url()).searchParams.get('sort'),'hp');
 await page.selectOption('#sort','name');assert.deepEqual(await order(),[...cards].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.id));
 await page.selectOption('#sort','random');assert.deepEqual(await order(),random);
 assert.equal(new URL(page.url()).searchParams.get('sort'),null);
 await page.locator('[data-category="food"]').click();
 assert.deepEqual(await order(),random.filter(id=>cards.find(c=>c.id===id).vibes.includes('food')));
 await page.locator('#reset-filters').click();assert.equal(await page.locator('#sort').inputValue(),'random');assert.deepEqual(await order(),random);
 await selectCity('Montreal');
 const montreal=random.filter(id=>cards.find(c=>c.id===id).city==='Montreal');assert.deepEqual(await order(),montreal);
 await page.locator('[data-view="map"]').click();await page.waitForSelector('.leaflet-marker-icon');
 await page.waitForFunction(n=>document.querySelectorAll('#cards .card-button').length===n,montreal.length);assert.deepEqual(await order(),montreal);
 await page.locator('[data-view="cards"]').click();await selectCity('all');
 await page.locator('#cards .card-button').first().click();await page.waitForSelector('#detail-image img');await page.keyboard.press('Escape');assert.deepEqual(await order(),random);
 await page.selectOption('#creator-filter','friends');assert.deepEqual(await order(),random.filter(id=>cards.find(c=>c.id===id).creator?.kind==='friend'));
 await page.selectOption('#creator-filter','all');assert.deepEqual(await order(),random);
 await page.reload();await page.waitForSelector('#cards .card-button');assert.equal(await page.locator('#sort').inputValue(),'random');assert.notDeepEqual(await order(),random);
 // Old bookmarks normalize to the new default; explicit HP links still work.
 await page.goto(origin+'?sort=recent#explore');await page.waitForSelector('#cards .card-button');assert.equal(await page.locator('#sort').inputValue(),'random');assert.equal(new URL(page.url()).searchParams.get('sort'),null);
 await page.goto(origin+'?sort=hp&group=none#explore');await page.waitForSelector('#cards .card-button');assert.equal(await page.locator('#sort').inputValue(),'hp');assert.deepEqual(await order(),hp);
 for(const query of ['', '?group=none']){
  await page.goto(origin+query+'#home');await page.waitForSelector('[data-flight]',{state:'attached'});
  const flights=await page.locator('[data-flight]').evaluateAll(es=>es.map(e=>+e.dataset.flight));assert.deepEqual(flights,(await order()).slice(0,4));
 }
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'#explore');await page.waitForSelector('#cards .card-button');
 assert.equal(await page.locator('#sort').inputValue(),'random');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(await page.evaluate(()=>window.FNP_DATA.cards.map(c=>c.id)),cards.map(c=>c.id));assert.deepEqual(errors,[]);
 const out=path.resolve(__dirname,'../output/qa/randoo-2026-11-22');fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:path.join(out,(origin.startsWith('https:')?'live':'local')+'-phone.png')});
 fs.writeFileSync(path.join(out,(origin.startsWith('https:')?'production':'browser')+'.json'),JSON.stringify({origin,total:cards.length,randomDefault:true,stableAcrossFilters:true,refreshShuffles:true,hp:true,alphabetical:true,cityGrouping:true,map:true,entranceMatches:true,legacyLinks:true,mobileOverflow:false,errors},null,2));
 console.log('PASS Randoo: default shuffle, stable filters/map/detail order, new order on reload, HP/A–Z, legacy links, matched entrance cards, mobile layout.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
