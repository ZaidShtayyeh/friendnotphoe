const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {refresh}=require('./approved-refresh.cjs');
const context={window:{}};
for(const name of ['data','search-data'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/site-v3',name+'.js'),'utf8'),context);
const {FNP_DATA:data,FNP_SEARCH:search}=JSON.parse(JSON.stringify(context.window));
test('all 17 new cards have their approved copy, categories, and distinct map locations',()=>{
 const bounds={Montreal:[45,46,-74,-73],'Mexico City':[19,20,-100,-99],Barcelona:[41,42,2,3],'Washington, DC':[38,39,-78,-76],Cali:[3,4,-77,-76]};
 assert.equal(refresh.added.length,17);
 for(const e of refresh.added){
  const c=data.cards.find(c=>c.id===e.id);assert.ok(c,e.name);
  assert.deepEqual([c.name,c.hp,c.city,c.vibes[0],c.creator||null],[e.name,e.hp,e.city,e.type,e.creator]);
  assert.deepEqual(search[c.id],{area:e.area,vibes:e.vibes,moves:e.moves.join(' ')});
  const [s,n,w,east]=bounds[c.city];assert.ok(c.lat>s&&c.lat<n&&c.lng>w&&c.lng<east,c.name);
  assert.match(c.mapsURL,/^https:\/\/maps.google.com\/\?cid=\d+$/);
  assert.ok(e.stats.every(x=>Number.isInteger(x)&&x>=0&&x<=100));
  assert.equal(c.image,'assets/cards-finish-v12/'+e.key+'.webp');
 }
 assert.deepEqual(Object.fromEntries(Object.keys(bounds).map(city=>[city,data.cards.filter(c=>c.city===city&&c.id<=122).length])),{Montreal:7,'Mexico City':6,Barcelona:1,'Washington, DC':2,Cali:1});
 assert.deepEqual(refresh.added.find(c=>c.name==='Los Parados').stats,[70,5,5]);
 assert.equal(refresh.added.find(c=>c.name==='Salle Climatisée').hp,280);
});
