const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=source=>{const c={window:{}};vm.runInNewContext(source,c);return JSON.parse(JSON.stringify(c.window));};
const data=read(fs.readFileSync(path.join(root,'assets/site-v3/data.js'),'utf8')).FNP_DATA;
const search=read(fs.readFileSync(path.join(root,'assets/site-v3/search-data.js'),'utf8')).FNP_SEARCH;
const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'friend-cards-2026-11-21.json'),'utf8'));
test('publishing approved friends preserves all 97 original cards and stories exactly',()=>{
 const previous=read(cp.execFileSync('git',['show','2cde8d8:assets/site-v3/data.js'],{cwd:root,encoding:'utf8'})).FNP_DATA;
 assert.equal(previous.cards.length,97);assert.equal(data.cards.length,97+expected.length);
 assert.deepEqual(data.cards.slice(0,97),previous.cards);assert.deepEqual(data.posts,previous.posts);
});
test('friend names, final ratings, cities, and searchable copy match the approved cards',()=>{
 const bounds={Naples:[26,27,-82,-81],Paris:[48,49,2,3],Mallorca:[39,40,2,4],Ischia:[40,41,13,14],Chios:[38,39,25,27]};
 for(const e of expected){
  const c=data.cards.find(c=>c.id===e.id);assert.ok(c);
  assert.deepEqual([c.name,c.city,c.hp,c.vibes[0],c.creator],[e.name,e.city,e.hp,e.type,e.creator]);
  assert.equal(e.hp,e.stats.reduce((a,b)=>a+b,0)+e.boostPoints);if(!e.copyVerbatim)assert.equal(e.vibes.endsWith('.'),false);
  assert.deepEqual(search[c.id],{vibes:e.vibes,area:search[c.id].area,moves:e.moves.join(' ')});
  const [south,north,west,east]=bounds[c.city];assert.ok(c.lat>south&&c.lat<north&&c.lng>west&&c.lng<east,c.name);
  const version=e.assetVersion?'?v='+e.assetVersion:'';
  assert.equal(c.image,'assets/cards-finish-v12/'+e.key+'.webp'+version);assert.equal(c.thumb,'assets/cards-finish-v12/'+e.key+'-750.webp'+version);
 }
 assert.equal(expected.find(c=>c.key==='camino').badge,'PARII');
 assert.equal(expected.filter(c=>c.creator.name==='Cindy :)').length,3);
 assert.ok(!data.cards.some(c=>c.creator?.kind==='friend'&&/^(GT3|Oxomoco)$/i.test(c.name)));
});
test('creator filtering keeps all legacy cards and separates the credited friends',()=>{
 const source=fs.readFileSync(path.join(root,'assets/site-v3/app.js'),'utf8');
 const fn=source.slice(source.indexOf('function creatorMatches('),source.indexOf('function getFiltered('));
 const c={state:{creator:'all'}};vm.runInNewContext(fn+';this.matches=creatorMatches',c);
 assert.equal(data.cards.filter(c.matches).length,97+expected.length);
 c.state.creator='friends';assert.equal(data.cards.filter(c.matches).length,expected.length);
 c.state.creator='zaid';assert.equal(data.cards.filter(c.matches).length,97);
});
test('adding Mama preserves all 102 previously published cards and their searchable copy',()=>{
 const previous=read(cp.execFileSync('git',['show','f8c1a4d:assets/site-v3/data.js'],{cwd:root,encoding:'utf8'})).FNP_DATA;
 const previousSearch=read(cp.execFileSync('git',['show','f8c1a4d:assets/site-v3/search-data.js'],{cwd:root,encoding:'utf8'})).FNP_SEARCH;
 assert.equal(previous.cards.length,102);
 assert.deepEqual(data.cards.slice(0,102),previous.cards);
 for(const card of previous.cards)assert.deepEqual(search[card.id],previousSearch[card.id]);
 const mama=data.cards.filter(c=>c.creator?.name==='Mama');
 assert.equal(mama.length,1);assert.equal(mama[0].hp,235);assert.equal(mama[0].city,'Naples');
});
