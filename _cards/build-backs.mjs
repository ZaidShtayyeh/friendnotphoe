import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {renderBack} from './back-design.mjs';
const require=createRequire(import.meta.url);
let sharp;
try{sharp=require('sharp');}catch{sharp=require('/Users/zaidshtayyeh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');}
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'..');
const dest=path.join(root,'assets/card-finish-v1/backs');
await fs.mkdir(dest,{recursive:true});
const uri=async file=>'data:image/png;base64,'+(await sharp(file).png().toBuffer()).toString('base64');
const assets={logo:await uri(path.join(root,'assets/logo-lockup.webp'))};
for(const color of ['blue','green','gold']){
  assets[color]={back:await uri(path.join(dir,'sources',color+'-back.webp'))};
  const svg=renderBack(color,assets);
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(png).webp({quality:96,alphaQuality:100,effort:6}).toFile(path.join(dest,color+'.webp'));
  await sharp(png).resize(180,252).webp({quality:90,alphaQuality:100,effort:6}).toFile(path.join(dest,color+'-180.webp'));
  console.log(color+': decorated back, 1500 × 2100 and 180 × 252');
}
