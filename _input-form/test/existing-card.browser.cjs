const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.FNP_TEST_ORIGIN||'http://127.0.0.1:8877/';
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 // Exercise the real dropdown/details flow with Google responses stubbed; no live form submission.
 await page.addInitScript(()=>{window.google={maps:{importLibrary:async()=>({AutocompleteSessionToken:function(){},AutocompleteSuggestion:{fetchAutocompleteSuggestions:async({input})=>({suggestions:[{placePrediction:{mainText:input,secondaryText:'New York',toPlace:()=>({displayName:input,googleMapsURI:'https://maps.google.com/?cid=123',id:'ChIJtest',location:{lat:()=>40.7157276,lng:()=>-73.9940495},formattedAddress:'105 Canal St, New York',addressComponents:[{longText:'New York',types:['locality']},{longText:'Lower East Side',types:['neighborhood']}],fetchFields:async()=>{}})}}]})}})}}});
 await page.goto(origin+'betweenusfriends/');await page.waitForFunction(()=>document.getElementById('place').dataset.places==='on');
 await page.locator('#place').fill('Time Again');await page.locator('#place-opt-0').click();
 await page.waitForSelector('#existing-card:not([hidden])');
 assert.match(await page.locator('#existing-card').innerText(),/Oops, someone beat you to this one/);
 assert.equal(await page.locator('#existing-card-name').innerText(),'Time Again · New York');
 assert.equal(await page.locator('#existing-card-link').getAttribute('href'),'../#card/time-again');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#place').scrollIntoViewIfNeeded();
 const out=path.resolve('output/qa/existing-card-2026-11-22');fs.mkdirSync(out,{recursive:true});
 await page.screenshot({path:path.join(out,(origin.startsWith('https')?'live':'local')+'-phone.png')});
 await page.locator('#existing-card-change').click();assert.equal(await page.locator('#place').inputValue(),'');assert.equal(await page.locator('#maps').inputValue(),'');assert.equal(await page.locator('#existing-card').isVisible(),false);assert.equal(await page.locator('#place').evaluate(e=>e===document.activeElement),true);
 await page.locator('#place').fill('Brand new spot');await page.locator('#place-opt-0').click();assert.equal(await page.locator('#existing-card').isVisible(),false);
 await page.locator('#place').fill('Time Again');await page.locator('#place-opt-0').click();await page.waitForSelector('#existing-card:not([hidden])');
 await page.setViewportSize({width:1440,height:1050});await page.locator('#place').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,(origin.startsWith('https')?'live':'local')+'-desktop.png')});
 await page.evaluate(()=>document.getElementById('place').form.reset());assert.equal(await page.locator('#existing-card').isVisible(),false);
 await page.goto(origin+'#card/time-again');await page.waitForSelector('#card-dialog[open]');assert.equal(await page.locator('#card-dialog').getAttribute('data-card-id'),'23');
 assert.deepEqual(errors,[]);console.log('PASS duplicate selection, new place, clear/reset, responsive notice, actual card deep link; no submission sent.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
