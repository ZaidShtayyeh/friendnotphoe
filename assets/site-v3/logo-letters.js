/* Original logo artwork, clipped with SVG view boxes. */
(() => {
const source='assets/home-heart-v2/letter-sprites.png';
const glyphs=[{"name": "F", "source": [29, 360, 104, 191]}, {"name": "R", "source": [151, 363, 126, 204]}, {"name": "I", "source": [293, 362, 75, 213]}, {"name": "E", "source": [389, 357, 109, 212]}, {"name": "N", "source": [512, 358, 127, 219]}, {"name": "D", "source": [664, 355, 128, 222]}, {"name": "N", "source": [825, 360, 117, 214]}, {"name": "O", "source": [961, 360, 121, 209]}, {"name": "T", "source": [1089, 359, 106, 214]}, {"name": "P", "source": [1224, 334, 151, 260]}, {"name": "H", "source": [1374, 360, 124, 216]}, {"name": "O", "source": [1505, 357, 122, 211]}, {"name": "E", "source": [1635, 354, 114, 214]}];
const mode=new URLSearchParams(location.search).get('lettering')==='orbit'?'orbit':'ring';
document.body.dataset.lettering=mode;
const stage=document.querySelector('.home-stage');
function svg(box){return `<svg viewBox="${box.join(' ')}" aria-hidden="true"><image href="${source}" width="1774" height="887"/></svg>`;}
let items=[];
if(mode==='orbit'){
 const words=[{box:[28,334,768,260],name:'Friend'},{box:[824,334,375,260],name:'Not'},{box:[1222,334,530,260],name:'Phoe'}];
 items=words.map(w=>{const el=document.createElement('span');el.className='logo-word';el.setAttribute('aria-hidden','true');el.innerHTML=svg(w.box);stage.append(el);return {el,ratio:w.box[2]/w.box[3]};});
}else{
 let cursor=0;const sequence=[];
 for(let repeat=0;repeat<2;repeat++){
  glyphs.forEach((g,i)=>{const advance=g.source[2]/g.source[3]+.11;sequence.push({g,at:cursor+advance/2});cursor+=advance;if(i===5||i===8)cursor+=.5;});cursor+=.75;
 }
 items=sequence.map(({g,at})=>{const el=document.createElement('span');el.className='logo-ring-letter';el.setAttribute('aria-hidden','true');el.innerHTML=svg(g.source);stage.append(el);return {el,ratio:g.source[2]/g.source[3],angle:at/cursor*Math.PI*2};});
}
window.FnpLettering={update(phase){
 const W=stage.clientWidth,H=stage.clientHeight,mobile=innerWidth<700,focus=document.body.dataset.focus==='heart';
 const center=H*(focus?.5:mobile?.29:.43),tilt=-.18;
 if(mode==='orbit'){
  const rx=W*(focus?.32:mobile?.38:.25),ry=H*(focus?.24:.19),height=focus?Math.min(56,W*.1):Math.min(mobile?40:57,W*.055+18);
  items.forEach(({el,ratio},i)=>{const a=phase*.7+i*Math.PI*2/3,depth=Math.sin(a),x=Math.cos(a)*rx,y=depth*ry;
   el.style.width=height*ratio+'px';el.style.height=height+'px';el.style.left=W*.5+'px';el.style.top=center+'px';el.style.transform=`translate(-50%,-50%) translate(${x*Math.cos(tilt)-y*Math.sin(tilt)}px,${x*Math.sin(tilt)+y*Math.cos(tilt)}px) rotate(${tilt*180/Math.PI}deg) scale(${.9+.1*depth})`;el.style.zIndex=depth>0?'4':'1';
  });
 }else{
  const rx=W*(focus?.37:mobile?.40:.25),ry=Math.min(H*.16,rx*.32),height=Math.min(focus?68:mobile?50:72,rx*.32);
  items.forEach(({el,ratio,angle})=>{const a=angle+phase*.68,depth=Math.cos(a),x=Math.sin(a)*rx,y=depth*ry,scale=.92+.08*depth;
   el.style.width=height*ratio+'px';el.style.height=height+'px';el.style.left=W*.5+'px';el.style.top=center+'px';el.style.transform=`translate(-50%,-50%) translate(${x*Math.cos(tilt)-y*Math.sin(tilt)}px,${x*Math.sin(tilt)+y*Math.cos(tilt)}px) rotate(${tilt*180/Math.PI}deg) scale(${scale}) scaleX(${depth})`;el.style.zIndex=depth>0?'4':'1';
  });
 }
}};
})();
