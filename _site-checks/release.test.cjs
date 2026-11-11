const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const before=cp.execFileSync('git',['show','2e2b3a0:index.html'],{cwd:root,encoding:'utf8'});
const original=name=>JSON.parse(JSON.stringify(vm.runInNewContext(before.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n        \\]);'))[1])));
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/site-v3/data.js'),'utf8'),context);
const data=JSON.parse(JSON.stringify(context.window.FNP_DATA));
test('every existing live card and its metadata survive, with real HD files and thumbnails',()=>{
  assert.equal(data.cards.length,77);
  assert.deepEqual(data.cards.map(({thumb,...c})=>c),original('restaurantCards').filter(c=>c.image));
  for(const c of data.cards){assert.ok(fs.existsSync(path.join(root,c.image)));assert.ok(fs.existsSync(path.join(root,c.thumb)));}
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
