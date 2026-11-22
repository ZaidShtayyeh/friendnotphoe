const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),c={window:{}};
for(const file of ['assets/site-v3/data.js','assets/site-v3/search-data.js','assets/card-share/manifest.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),c);
const cards=c.window.FNP_DATA.cards,search=c.window.FNP_SEARCH,shares=c.window.FNP_CARD_SHARES;
const surface=fs.readFileSync(path.join(root,'assets/card-finish-v1/front-surface.svg'));
let sharp;try{sharp=require('sharp')}catch{sharp=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('every live card has current, static share metadata and a unique non-fragment URL',async()=>{
 assert.equal(Object.keys(shares).length,cards.length);
 assert.equal(new Set(Object.values(shares).map(s=>s.url)).size,cards.length);
 for(const card of cards){
  const share=shares[card.id],url=new URL(share.url);assert.equal(url.origin,'https://friendnotphoe.com');assert.equal(url.hash,'');
  const html=fs.readFileSync(path.join(root,url.pathname,'index.html'),'utf8');
  assert.ok(html.includes('property="og:url" content="'+share.url+'"'));
  assert.ok(html.includes('property="og:title" content="'+esc(card.name)+' — Friend Not Phoe"'));
  assert.ok(html.includes('property="og:image" content="https://friendnotphoe.com/'+share.preview+'"'));
  assert.ok(!html.includes('http-equiv="refresh"'));
  const source=fs.readFileSync(path.join(root,card.image.split('?')[0]));
  const version=crypto.createHash('sha256').update('share-v1').update(source).update(surface).update(JSON.stringify([card.name,card.city,card.hp,card.creator?.name||'',search[card.id]?.vibes||''])).digest('hex').slice(0,12);
  assert.equal(share.version,version,'Rebuild share assets after editing '+card.name);
  assert.equal(url.searchParams.get('v'),version);
  const full=await sharp(path.join(root,share.image)).metadata(),preview=await sharp(path.join(root,share.preview)).metadata();
  assert.deepEqual([full.width,full.height,full.format,full.hasAlpha],[1500,2100,'jpeg',false]);
  assert.deepEqual([preview.width,preview.height,preview.format,preview.hasAlpha],[1200,630,'jpeg',false]);
 }
});
test('homepage preview image exists and is an opaque standard-size JPEG',async()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('content="https://friendnotphoe.com/og-image.jpg"'));
 assert.ok(!html.includes('og-image.png'));
 const image=await sharp(path.join(root,'og-image.jpg')).metadata();assert.deepEqual([image.width,image.height,image.hasAlpha],[1200,630,false]);
});
