const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {refresh,approvedExisting,approvedReview,approvedURL}=require('./approved-refresh.cjs');
const read=source=>{const c={window:{}};vm.runInNewContext(source,c);return JSON.parse(JSON.stringify(c.window));};
const data=read(fs.readFileSync(path.join(root,'assets/site-v3/data.js'),'utf8')).FNP_DATA;
const search=read(fs.readFileSync(path.join(root,'assets/site-v3/search-data.js'),'utf8')).FNP_SEARCH;
const expected=[...JSON.parse(fs.readFileSync(path.join(__dirname,'friend-cards-2026-11-21.json'),'utf8')),...refresh.added.filter(c=>c.creator)];
const ownerCount=97+refresh.added.filter(c=>!c.creator).length;
test('approved rating changes preserve the original cards and stories',()=>{
 const previous=read(cp.execFileSync('git',['show','2cde8d8:assets/site-v3/data.js'],{cwd:root,encoding:'utf8'})).FNP_DATA;
 assert.equal(previous.cards.length,97);assert.equal(data.cards.length,ownerCount+expected.length);
 assert.deepEqual(data.cards.slice(0,97),previous.cards.map(approvedExisting));assert.deepEqual(data.posts,previous.posts);
});
test('friend names, final ratings, cities, and searchable copy match the approved cards',()=>{
 const bounds={Naples:[26,27,-82,-81],Paris:[48,49,2,3],Mallorca:[39,40,2,4],Ischia:[40,41,13,14],Chios:[38,39,25,27],Cali:[3,4,-77,-76],Barcelona:[41,42,2,3]};
 for(const e of expected){
  const c=data.cards.find(c=>c.id===e.id);assert.ok(c);
  assert.deepEqual([c.name,c.city,c.hp,c.vibes[0],c.creator],[e.name,e.city,e.hp,e.type,e.creator]);
  assert.equal(e.hp,e.stats.reduce((a,b)=>a+b,0)+e.boostPoints);assert.match(search[c.id].vibes,/[.!?…]$/);
  assert.deepEqual(search[c.id],approvedReview(c.id,{vibes:e.vibes,area:search[c.id].area,moves:e.moves.join(' ')}));
  const [south,north,west,east]=bounds[c.city];assert.ok(c.lat>south&&c.lat<north&&c.lng>west&&c.lng<east,c.name);
  const version=e.assetVersion?'?v='+e.assetVersion:'';
  assert.equal(c.image,approvedURL(c.id,'assets/cards-finish-v12/'+e.key+'.webp'+version));assert.equal(c.thumb,approvedURL(c.id,'assets/cards-finish-v12/'+e.key+'-750.webp'+version));
 }
 assert.equal(expected.find(c=>c.key==='camino').badge,'PARII');
 assert.equal(expected.filter(c=>c.creator.name==='Cindy :)').length,4);
 assert.ok(!data.cards.some(c=>c.creator?.kind==='friend'&&/^(GT3|Oxomoco)$/i.test(c.name)));
});
test('creator filtering keeps all legacy cards and separates the credited friends',()=>{
 const source=fs.readFileSync(path.join(root,'assets/site-v3/app.js'),'utf8');
 const fn=source.slice(source.indexOf('function creatorMatches('),source.indexOf('function getFiltered('));
 const c={state:{creator:'all'}};vm.runInNewContext(fn+';this.matches=creatorMatches',c);
 assert.equal(data.cards.filter(c.matches).length,ownerCount+expected.length);
 c.state.creator='friends';assert.equal(data.cards.filter(c.matches).length,expected.length);
 c.state.creator='zaid';assert.equal(data.cards.filter(c.matches).length,ownerCount);
});
test('the refresh changes only approved ratings/colors and preserves every existing review',()=>{
 const previous=read(cp.execFileSync('git',['show',refresh.previousCommit+':assets/site-v3/data.js'],{cwd:root,encoding:'utf8'})).FNP_DATA;
 const previousSearch=read(cp.execFileSync('git',['show',refresh.previousCommit+':assets/site-v3/search-data.js'],{cwd:root,encoding:'utf8'})).FNP_SEARCH;
 assert.equal(previous.cards.length,refresh.previousTotal);assert.equal(data.cards.length,refresh.newTotal+expected.filter(c=>c.id>122).length);
 assert.deepEqual(data.cards.slice(0,previous.cards.length),previous.cards.map(approvedExisting));
 for(const card of previous.cards)assert.deepEqual(search[card.id],approvedReview(card.id,previousSearch[card.id]));
 const mama=data.cards.filter(c=>c.creator?.name==='Mama');
 assert.equal(mama.length,1);assert.equal(mama[0].hp,235);assert.equal(mama[0].city,'Naples');
});
test('adding Kage preserves all 120 previously published cards and their searchable copy',()=>{
 const previous=read(cp.execFileSync('git',['show','bd82d31:assets/site-v3/data.js'],{cwd:root,encoding:'utf8'})).FNP_DATA;
 const previousSearch=read(cp.execFileSync('git',['show','bd82d31:assets/site-v3/search-data.js'],{cwd:root,encoding:'utf8'})).FNP_SEARCH;
 assert.equal(previous.cards.length,120);assert.equal(data.cards.length,121);
 assert.deepEqual(data.cards.slice(0,120),previous.cards.map(approvedExisting));assert.deepEqual(data.posts,previous.posts);
 for(const card of previous.cards)assert.deepEqual(search[card.id],approvedReview(card.id,previousSearch[card.id]));
 assert.deepEqual(Object.keys(search).sort(),[...Object.keys(previousSearch),'123'].sort());
 const kage=data.cards.filter(c=>c.creator?.name==='Kage');
 assert.equal(kage.length,1);assert.deepEqual([kage[0].id,kage[0].name,kage[0].city,kage[0].hp,kage[0].vibes],[123,'Bar Cañete','Barcelona',193,['food']]);
 assert.equal(kage[0].mapsURL,'https://maps.google.com/?cid=2051304937619323747');
 assert.deepEqual(search[123],{area:'El Raval',vibes:expected.find(c=>c.id===123).vibes,moves:'Fried squid sandwich Croquetas Todos 💃💃'});
 assert.equal(fs.statSync(path.join(root,'assets/cards-finish-v12/bar-canete.webp')).size>0,true);
});
