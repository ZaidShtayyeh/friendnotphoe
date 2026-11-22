// Regenerate after changing a card or the approved front surface.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let sharp;try{sharp=require('sharp')}catch{sharp=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'assets/card-share');
await fs.mkdir(dir,{recursive:true});
const context={window:{}};
for(const name of ['data','search-data'])vm.runInNewContext(await fs.readFile(path.join(root,'assets/site-v3/'+name+'.js'),'utf8'),context);
const cards=context.window.FNP_DATA.cards,search=context.window.FNP_SEARCH;
const rawSurface=await fs.readFile(path.join(root,'assets/card-finish-v1/front-surface.svg'));
const surface=await sharp(rawSurface).png().toBuffer();
const slug=c=>c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const checksum=(image,c)=>crypto.createHash('sha256').update('share-v1').update(image).update(rawSurface).update(JSON.stringify([c.name,c.city,c.hp,c.creator?.name||'',search[c.id]?.vibes||''])).digest('hex').slice(0,12);
const shares={};let next=0;
async function build(c){
 const name=slug(c),base='/cards/'+name+'/',source=await fs.readFile(path.join(root,c.image.split('?')[0])),version=checksum(source,c);
 const full='assets/card-share/'+name+'-'+version+'.jpg',preview='assets/card-share/'+name+'-'+version+'-preview.jpg';
 const url='https://friendnotphoe.com'+base+'?v='+version;
 try{await fs.access(path.join(root,full));await fs.access(path.join(root,preview))}catch{
  const printed=await sharp(source).composite([{input:surface,blend:'multiply'}]).png().toBuffer();
  await sharp(printed).flatten({background:'#f2f0e7'}).jpeg({quality:92,chromaSubsampling:'4:4:4',progressive:true}).toFile(path.join(root,full));
  const card=await sharp(printed).resize(420,588).png().toBuffer();
  const shadow=Buffer.from('<svg width="1200" height="630"><defs><filter id="s"><feGaussianBlur stdDeviation="5"/></filter></defs><rect x="390" y="26" width="420" height="588" rx="15" fill="#263125" opacity=".16" filter="url(#s)"/></svg>');
  await sharp({create:{width:1200,height:630,channels:3,background:'#f2f0e7'}}).composite([{input:shadow},{input:card,left:390,top:21}]).jpeg({quality:90,chromaSubsampling:'4:4:4',progressive:true}).toFile(path.join(root,preview));
 }
 const city=c.city==='NYC'?'New York':c.city,by=c.creator?.name?' · By '+c.creator.name:'',description=`${city} · ${c.hp} HP${by}. ${search[c.id]?.vibes||''}`;
 const title=c.name+' — Friend Not Phoe',alt=c.name+' collectible card, '+c.hp+' HP';
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="https://friendnotphoe.com${base}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Friend Not Phoe"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="https://friendnotphoe.com/${preview}"><meta property="og:image:secure_url" content="https://friendnotphoe.com/${preview}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="https://friendnotphoe.com/${preview}"><meta name="twitter:image:alt" content="${esc(alt)}">
<style>body{margin:0;background:#f2f0e7;color:#263125;font:16px Georgia,serif}main{min-height:100svh;display:flex;flex-direction:column;gap:18px;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}img{display:block;max-width:86vw;max-height:78svh;width:auto;height:auto;border-radius:12px}a{color:inherit;text-underline-offset:4px}p{margin:0}</style><script defer src="/assets/card-share/open.js" data-card="${name}"></script></head><body><main><a href="/#card/${name}" aria-label="Open ${esc(c.name)} card"><img src="/${full}" alt="${esc(alt)}" width="1500" height="2100"></a><p><a href="/#card/${name}">Open ${esc(c.name)} on Friend Not Phoe ↗</a></p></main></body></html>\n`;
 const folder=path.join(root,base);await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,'index.html'),html);
 shares[c.id]={url,image:full,preview,version};
}
await Promise.all(Array.from({length:3},async()=>{while(next<cards.length)await build(cards[next++])}));
const ordered=Object.fromEntries(cards.map(c=>[c.id,shares[c.id]]));
await fs.writeFile(path.join(dir,'manifest.js'),'window.FNP_CARD_SHARES = '+JSON.stringify(ordered)+';\n');
await fs.writeFile(path.join(dir,'open.js'),"// Crawlers read this page's static metadata; visitors open the existing card viewer.\n(()=>{const slug=document.currentScript?.dataset.card;if(slug&&/^[a-z0-9-]+$/.test(slug))location.replace('/#card/'+slug);})();\n");
const logo=await sharp(path.join(root,'assets/logo-lockup.webp')).resize({width:660,height:470,fit:'inside'}).png().toBuffer();
const homeImage=await sharp({create:{width:1200,height:630,channels:3,background:'#f2f0e7'}}).composite([{input:logo,gravity:'centre'}]).png().toBuffer();
await fs.writeFile(path.join(root,'og-image.png'),homeImage); // Support already-cached homepage metadata too.
await sharp(homeImage).jpeg({quality:92,chromaSubsampling:'4:4:4'}).toFile(path.join(root,'og-image.jpg'));
const manifestHash=crypto.createHash('sha256').update(JSON.stringify(ordered)).digest('hex').slice(0,12);
const entry=path.join(root,'index.html');let html=await fs.readFile(entry,'utf8');
const script='<script defer src="assets/card-share/manifest.js?v='+manifestHash+'"></script>';
if(/<script defer src="assets\/card-share\/manifest\.js[^>]*><\/script>/.test(html))html=html.replace(/<script defer src="assets\/card-share\/manifest\.js[^>]*><\/script>/,script);
else html=html.replace('<script defer src="assets/site-v3/card-actions.js',script+'<script defer src="assets/site-v3/card-actions.js');
await fs.writeFile(entry,html);
console.log('Built crawler-readable share pages, HD JPEGs and 1200×630 previews for '+cards.length+' cards.');
