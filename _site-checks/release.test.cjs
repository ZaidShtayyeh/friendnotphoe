const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const before=cp.execFileSync('git',['show','2e2b3a0:index.html'],{cwd:root,encoding:'utf8'});
const original=name=>JSON.parse(JSON.stringify(vm.runInNewContext(before.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n        \\]);'))[1])));
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/site-v3/data.js'),'utf8'),context);
const data=JSON.parse(JSON.stringify(context.window.FNP_DATA));
test('every existing live card and its metadata survive, with real HD files and thumbnails',()=>{
  const originals=original('restaurantCards').filter(c=>c.image),ids=new Set(originals.map(c=>c.id));
  assert.deepEqual(data.cards.filter(c=>ids.has(c.id)).map(({thumb,...c})=>c),originals);
  for(const c of data.cards){assert.ok(fs.existsSync(path.join(root,c.image)));assert.ok(fs.existsSync(path.join(root,c.thumb)));}
});
test('the twenty new tracker cards have unique links, correct categories and valid city locations',()=>{
  const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'new-cards-2026-11-15.json'),'utf8'));
  assert.equal(data.cards.length,77+expected.length);
  assert.equal(new Set(data.cards.map(c=>c.id)).size,data.cards.length);
  const slug=c=>c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  assert.equal(new Set(data.cards.map(slug)).size,data.cards.length);
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/site-v3/search-data.js'),'utf8'),ctx);
  const bounds={NYC:[40,41,-75,-73],Boston:[42,43,-72,-70],London:[51,52,-1,1]};
  for(const e of expected){
    const c=data.cards.find(c=>c.id===e.id);assert.ok(c,e.name);
    assert.deepEqual([c.name,c.city,c.hp,c.vibes[0]],[e.name,e.city,e.hp,e.type]);
    assert.equal(c.image,'assets/cards-finish-v12/'+e.key+'.webp');assert.equal(c.thumb,'assets/cards-finish-v12/'+e.key+'-750.webp');
    const [south,north,west,east]=bounds[c.city];assert.ok(c.lat>south&&c.lat<north&&c.lng>west&&c.lng<east,e.name);
    for(const field of ['area','vibes','moves'])assert.ok(ctx.window.FNP_SEARCH[c.id][field],e.name+' '+field);
  }
  assert.deepEqual(Object.fromEntries(['NYC','Boston','London'].map(city=>[city,data.cards.filter(c=>c.city===city).length])),{NYC:80,Boston:8,London:9});
});
test('the homepage entrance lands in the first four positions in both layouts',()=>{
  const source=fs.readFileSync(path.join(root,'assets/site-v3/app.js'),'utf8');
  const declaration=source.match(/function getFeaturedCards\(\)\{([^}]+)\}/)[0];
  const newest=[...data.cards].reverse();
  for(const groupByCity of [true,false]){
    const ctx={newest,state:{groupByCity}};
    vm.runInNewContext(declaration+';this.featured=getFeaturedCards()',ctx);
    const firstGroup=newest.filter(c=>c.city===newest[0].city);
    assert.deepEqual(ctx.featured.map(c=>c.id),(groupByCity?firstGroup:newest).slice(0,4).map(c=>c.id));
  }
});
test('published stories survive exactly and drafts stay private',()=>{
  assert.deepEqual(data.posts,original('blogPosts').filter(p=>p.status==='live'));
});
test('the creator uses its existing live integration settings',()=>{
  const old=cp.execFileSync('git',['show','2e2b3a0:betweenusfriends/index.html'],{cwd:root,encoding:'utf8'});
  const form=fs.readFileSync(path.join(root,'betweenusfriends/index.html'),'utf8');
  for(const name of ['FORM_ENDPOINT','MAPS_API_KEY']){
    const re=new RegExp('var '+name+' = ([^;]+);');assert.equal(form.match(re)[1],old.match(re)[1]);
  }
  assert.ok(!form.includes('Design preview'));assert.ok(!form.includes('Nothing is sent'));
  assert.ok(form.includes('See your card as you build'));assert.match(form, /<textarea id="vibes"[^>]+placeholder="inspo&#10;&#10;/);
});
test('grid and detail glints retain the live count and limits',()=>{
  const source=fs.readFileSync(path.join(root,'assets/site-v3/app.js'),'utf8');
  const ctx={};vm.runInNewContext(source.slice(source.indexOf('function stars('),source.indexOf('const visibleCards='))+';this.stars=stars',ctx);
  for(const c of data.cards)for(const count of [6,7]){
    const values=[...ctx.stars(c.id,count).matchAll(/left:([\d.]+)%;top:([\d.]+)%;font-size:([\d.]+)px;--tw-dur:([\d.]+)s/g)].map(m=>m.slice(1).map(Number));
    assert.equal(values.length,count);assert.ok(values.filter(([x,y])=>x>8&&x<92&&y>9&&y<49).length<=2);
    for(const [x,y,size,duration] of values){assert.ok(size>=10&&size<=16);assert.ok(duration>=2.6&&duration<=4.8);}
  }
});
test('release entry points do not depend on local study directories',()=>{
  for(const file of ['index.html','assets/site-v3/app.js','assets/site-v3/heart.js','assets/site-v3/logo-letters.js','assets/site-v3/globe.js','assets/site-v3/card-actions.js','betweenusfriends/index.html']){
    const text=fs.readFileSync(path.join(root,file),'utf8');assert.ok(!text.includes('output/web/'),file);assert.ok(!text.includes('../../../'),file);
  }
});
