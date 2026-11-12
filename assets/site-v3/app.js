(() => {
'use strict';
history.scrollRestoration='manual';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const {cards,posts}=window.FNP_DATA, root='./';
let activePost=posts[0],lastRoutedURL='';
const cardSlug=c=>c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const asset=p=>/^(data:|https?:)/.test(p)?p:root+p;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={food:'Food',drink:'Vibes',special:'Legendary'},cityNames={NYC:'New York'};
const query=new URLSearchParams(location.search),motion=matchMedia('(prefers-reduced-motion: reduce)');
const state={page:'home',palette:query.get('palette')==='original'?'original':'forest',city:query.get('city')||'all',category:query.get('category')||'all',search:query.get('q')||'',sort:query.get('sort')||'recent',view:['map','globe'].includes(query.get('view'))?query.get('view'):'cards',motionOff:motion.matches};
if(state.city!=='all'&&!cards.some(c=>c.city===state.city))state.city='all';
if(!['all','food','drink','special'].includes(state.category))state.category='all';
if(!['recent','hp','name'].includes(state.sort))state.sort='recent';
let filtered=[],inView=[],map=null,markers=[],selectedId=null,detailDeck=[],detailId=null,detailToken=0,returnFocus=null,frame=0,lastTime=0,phase=0,mapReady=false,journeyDistance=0,journeyFinishStarted=0,journeyFinishFrom=0;
let journeyGeometry=null,journeyProgress=0;
const newest=[...cards].reverse(),addedOrder=new Map(cards.map((c,i)=>[c.id,i]));
const featured=newest.slice(0,4);
const picture=c=>`<img src="${esc(asset(c.thumb))}" alt="${esc(c.name)} collectible card, ${c.hp} HP" loading="lazy" decoding="async" width="1500" height="2100">`;
function syncURL(){const q=new URLSearchParams();q.set('palette',state.palette);if(query.get('lettering'))q.set('lettering',query.get('lettering'));if(query.get('focus')==='heart')q.set('focus','heart');if(state.city!=='all')q.set('city',state.city);if(state.category!=='all')q.set('category',state.category);if(state.search)q.set('q',state.search);if(state.sort!=='recent')q.set('sort',state.sort);if(state.view!=='cards')q.set('view',state.view);history.replaceState(history.state,'',location.pathname+(q.size?'?'+q:'')+location.hash);}
function navigate(page,{push=true,y=0}={}){
 if(!['home','explore','adventures','article'].includes(page))page='home';
 if(push){history.replaceState({page:state.page,y:scrollY},'');history.pushState({page,y:0},'',location.pathname+location.search+'#'+page);}
 state.page=page;if(page==='home'){journeyDistance=0;journeyGeometry=null;journeyProgress=0;journeyFinishStarted=0;state.city='all';state.category='all';state.search='';state.sort='recent';state.view='cards';$('#search').value='';$('#sort').value='recent';}if(!['home','explore'].includes(page))window.FnpGlobe?.hide();document.body.dataset.page=page;$('#explore-page').classList.toggle('from-home',page==='home');$('#journey-cards').hidden=page!=='home';
 for(const el of $$('.page'))el.hidden=el.id!==page+'-page'&&!(page==='home'&&el.id==='explore-page');
 $('.page-dock').hidden=page==='home';
 for(const a of $$('.page-dock a'))a.setAttribute('aria-current',a.hash==='#'+page?'page':'false');
 $('.masthead-note').textContent=page==='home'?'':page==='article'?'ADVENTURES':page.toUpperCase();
 if($('#menu-dialog').open)$('#menu-dialog').close();$('#open-menu').setAttribute('aria-expanded','false');
 window.FnpSoftHeart?.setActive(page==='home');
 document.title='Friend Not Phoe — '+({home:'Home',explore:'Explore',adventures:'Adventures',article:activePost.title})[page];
 if(page==='home'||page==='explore'){renderCollection(false);if(state.view==='map')requestAnimationFrame(()=>map?.invalidateSize());}
 if(page==='adventures'||page==='article')requestAnimationFrame(fitRings);
 lastRoutedURL=location.href;
 requestAnimationFrame(()=>{window.scrollTo({top:y,behavior:'instant'});updateScene(performance.now());});
}
function toAnchor(id){
 if(id==='collection'&&state.page==='home'){
  if(state.motionOff){navigate('explore');return;}
  if(!journeyGeometry)measureJourney();
  window.scrollTo({top:journeyDistance*.94,behavior:'smooth'});return;
 }
 const page=id==='collection'?'explore':'adventures';
 if(state.page!==page)navigate(page,{push:true});
 requestAnimationFrame(()=>$('#'+id).scrollIntoView({behavior:state.motionOff?'instant':'smooth',block:'start'}));
}
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const dest=a.getAttribute('href').slice(1);if(dest==='main-content')return;e.preventDefault();if(dest==='collection'||dest==='stories'){toAnchor(dest);return;}navigate(dest==='exploration'?'explore':dest);});
function routeLocation(){
 if(lastRoutedURL===location.href)return;
 lastRoutedURL=location.href;
 const hash=location.hash.slice(1),cardMatch=hash.match(/^card\/(.+)$/),postMatch=hash.match(/^post-(\d+)$/);
 if(cardMatch){
  const shared=cards.find(c=>cardSlug(c)===cardMatch[1]);
  navigate('explore',{push:false});
  if(shared)openCard(shared.id,cards);
  return;
 }
 if($('#card-dialog').open)$('#card-dialog').close();
 if(postMatch){const story=posts.find(p=>p.id===Number(postMatch[1]));if(story){setArticle(story);navigate('article',{push:false,y:history.state?.y||0});return;}}
 let page=hash.split('/')[0]||'home';
 if(page==='exploration'||page==='collection')page='explore';
 if(page==='stories')page='adventures';
 if(page==='article')setArticle(activePost);
 navigate(page,{push:false,y:history.state?.y||0});
}
addEventListener('popstate',routeLocation);addEventListener('hashchange',routeLocation);
$('#open-menu').addEventListener('click',()=>{$('#menu-dialog').showModal();$('#open-menu').setAttribute('aria-expanded','true');});
$('.menu-close').addEventListener('click',()=>$('#menu-dialog').close());$('#menu-dialog').addEventListener('close',()=>{$('#open-menu').setAttribute('aria-expanded','false');$('#open-menu').focus({preventScroll:true});});
function setMotion(off){state.motionOff=off;document.documentElement.classList.toggle('motion-off',off);for(const b of $$('.motion-toggle')){b.textContent=off?'Motion off':'Motion on';b.setAttribute('aria-pressed',off);}window.FnpSoftHeart?.setMotion(off);window.FnpGlobe?.motion(off);updateScene(performance.now());}
$$('.motion-toggle').forEach(b=>b.addEventListener('click',()=>setMotion(!state.motionOff)));motion.addEventListener('change',()=>setMotion(motion.matches));
function setPalette(palette){state.palette=palette;document.body.dataset.palette=palette;for(const b of $$('[data-palette]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',b.dataset.palette===palette);syncURL();}
$$('button[data-palette]').forEach(b=>b.addEventListener('click',()=>setPalette(b.dataset.palette)));
const backs={all:'gold',food:'green',drink:'blue',special:'gold'};
for(const b of $$('.category')){const src=root+`assets/site-v3/backs/${backs[b.dataset.category]}.webp`;b.querySelector('.mini-deck').innerHTML=`<img src="${src}" alt="" loading="lazy"><img src="${src}" alt="" loading="lazy">`;b.addEventListener('click',()=>{state.category=b.dataset.category;renderCollection(true);});}
$('#all-count').textContent=cards.length+' places & counting';
const cities=[...new Set(cards.map(c=>c.city))];
$('#city-options').innerHTML=[{id:'all',name:'DUNYA',caption:'Everywhere'},...cities.map(c=>({id:c,name:cityNames[c]||c,caption:c}))].map(c=>`<button class="city-option" data-city="${c.id}"><span><strong>${c.name}</strong><small>${c.caption}</small></span><span>${cards.filter(card=>c.id==='all'||card.city===c.id).length} cards <b>↗</b></span></button>`).join('');
$('#city-count').textContent=cards.length+' cards & counting.';
$('#city-picker').addEventListener('click',()=>$('#city-dialog').showModal());
$('.city-close').addEventListener('click',()=>$('#city-dialog').close());
$('#city-options').addEventListener('click',e=>{const b=e.target.closest('[data-city]');if(!b)return;state.city=b.dataset.city;renderCollection(true);if(state.view==='map')fitAll();if(state.view==='globe')window.FnpGlobe?.reset();$('#city-dialog').close();});
$('#city-dialog').addEventListener('close',()=>$('#city-picker').focus({preventScroll:true}));
$('#search').value=state.search;$('#sort').value=state.sort;
$('#search').addEventListener('input',e=>{state.search=e.target.value;renderCollection(true);});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;renderCollection(false);});
for(const b of $$('[data-view]'))b.addEventListener('click',()=>{state.view=b.dataset.view;renderCollection(false);});
function resetFilters(){state.category='all';state.search='';state.sort='recent';$('#search').value='';$('#sort').value='recent';renderCollection(true);}
$('#reset-filters').addEventListener('click',resetFilters);
$('#empty-reset').addEventListener('click',()=>{if(!filtered.length)resetFilters();if(state.view==='map')fitAll();else resetFilters();});
$('#map-reset').addEventListener('click',fitAll);
$('#surprise').addEventListener('click',()=>{const list=state.view==='map'?inView:filtered;if(list.length)openCard(list[Math.floor(Math.random()*list.length)].id,list);});
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const searchAliases={family:['family','fam','parents','mama','mum','mom'],solo:['solo','alone','your own','by yourself'],date:['date','romantic'],outdoor:['outside','outdoor'],tags:[]};
function searchMatches(c,q){const data=window.FNP_SEARCH[c.id]||{};const hay=normalize([c.name,c.place,data.area,data.vibes,data.moves,...c.vibes.map(v=>types[v])].join(' '));return normalize(q).split(/\s+/).filter(w=>w&&!['a','the','for','good','spot','spots','place','places','with'].includes(w)).every(w=>searchAliases[w]?searchAliases[w].some(term=>new RegExp('\\b'+term+'\\b').test(hay)):hay.includes(w));}
function getFiltered(){const q=state.search.trim();let list=cards.filter(c=>(state.city==='all'||c.city===state.city)&&(state.category==='all'||c.vibes.includes(state.category))&&(!q||searchMatches(c,q)));if(state.sort==='recent')list.sort((a,b)=>addedOrder.get(b.id)-addedOrder.get(a.id));if(state.sort==='hp')list.sort((a,b)=>b.hp-a.hp||a.name.localeCompare(b.name));if(state.sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));return list;}
function stars(seed,count=6){let html='',photos=0;let n=seed*9301+49297;const rand=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};for(let i=0;i<count;i++){let x=3+rand()*94,y=2+rand()*95;if(x>8&&x<92&&y>9&&y<49){if(photos>=2)y=52+rand()*38;else photos++;}html+=`<span class="twinkle" aria-hidden="true" style="left:${x}%;top:${y}%;font-size:${10+rand()*6}px;--tw-dur:${2.6+rand()*2.2}s;--tw-delay:${rand()*4}s">${rand()>.5?'✦':'✧'}</span>`;}return html;}
const visibleCards=new Set(),effectObserver=new IntersectionObserver(entries=>{for(const entry of entries){entry.target.classList.toggle('effects-visible',entry.isIntersecting);if(entry.isIntersecting)visibleCards.add(entry.target);else visibleCards.delete(entry.target);}},{rootMargin:'50px'});
function renderCollection(markersChanged){
 filtered=getFiltered();
 $('#city-heading').textContent=state.city==='all'?'DUNYA':cityNames[state.city]||state.city;
 $('#city-picker').setAttribute('aria-label',(state.city==='all'?'DUNYA':cityNames[state.city]||state.city)+' — choose a city');
 for(const b of $$('.city-option'))b.setAttribute('aria-pressed',b.dataset.city===state.city);
 $('#map-reset').textContent='Show all places ↗';
 for(const b of $$('.category')){const active=b.dataset.category===state.category;b.classList.toggle('is-active',active);b.setAttribute('aria-pressed',active);}
 for(const b of $$('[data-view]'))b.setAttribute('aria-pressed',b.dataset.view===state.view);
 $('#reset-filters').hidden=state.category==='all'&&!state.search&&state.sort==='recent';
 $('.collection-content').classList.toggle('is-map',state.view!=='cards');$('.map-wrap').hidden=state.view!=='map';$('.globe-wrap').hidden=state.view!=='globe';if(state.view!=='globe')window.FnpGlobe?.hide();
 if(state.view==='map'){ensureMap();if(markersChanged||!markers.length)rebuildMarkers();requestAnimationFrame(()=>{map?.invalidateSize();if(!mapReady){fitAll();mapReady=true;}else syncMapCards();});}else{renderList(filtered);if(state.view==='globe')window.FnpGlobe.show(filtered,c=>{state.city=c.city;state.view='map';renderCollection(true);requestAnimationFrame(()=>{map?.setView([c.lat,c.lng],13);syncMapCards();});},state.motionOff);}
 syncURL();
}
function cardMarkup(c){return `<div class="card-item${selectedId===c.id?' map-selected':''}" data-id="${c.id}"><button class="card-button" data-card="${c.id}" aria-label="Open ${esc(c.name)} card, ${c.hp} HP"><span class="card-art">${picture(c)}<span class="card-foil" aria-hidden="true"></span>${stars(c.id)}</span>${c.wasta?'<span class="wasta-glow" aria-label="WASTAAAAA"></span>':''}</button></div>`;}
function renderList(list){journeyGeometry=null;effectObserver.disconnect();visibleCards.clear();inView=list;const groups=[...new Set(list.map(c=>c.city))];$('#cards').innerHTML=groups.map((city,i)=>{const group=list.filter(c=>c.city===city);return `<section class="city-group" aria-label="${esc(cityNames[city]||city)} collection">${state.city==='all'?`<header class="city-group-heading"><div><span class="eyebrow">${String(i+1).padStart(2,'0')} / ${esc(city)}</span><h3>${esc(cityNames[city]||city)}</h3></div><span>${group.length} ${group.length===1?'card':'cards'}</span></header>`:''}<div class="cards-grid">${group.map(cardMarkup).join('')}</div></section>`;}).join('');
 for(const el of $$('#cards .card-item'))effectObserver.observe(el);
 $('#result-count').textContent=state.view==='map'?`${list.length} in this view / ${filtered.length} matching places`:`${list.length} ${list.length===1?'card':'cards'}${state.category==='all'?'':' in '+types[state.category]}`;
 $('#collection-total').textContent=state.view==='map'?`${list.length} cards in this map view.`:`${list.length} places${state.search||state.category!=='all'?' match your filters':''}.`;
 $('#empty').hidden=!!list.length;$('#empty-copy').textContent=state.view==='map'&&filtered.length?'Pan or zoom out to find more places.':'Try a different name or clear the filters.';$('#surprise').disabled=!list.length;
}
function ensureMap(){if(map||!window.L)return;map=L.map('map',{scrollWheelZoom:true,zoomControl:true}).setView([40.728,-73.985],12);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',{attribution:'Map &copy; Esri',maxNativeZoom:16,maxZoom:19}).addTo(map).on('tileerror',()=>$('#map-help').textContent='Map tiles unavailable. The place markers still work.');map.on('moveend',()=>{if(state.view==='map'&&['home','explore'].includes(state.page))syncMapCards();});}
function rebuildMarkers(){if(!map){$('#map-error').hidden=false;return;}markers.forEach(m=>map.removeLayer(m));markers=[];for(const c of filtered){const marker=L.marker([c.lat,c.lng],{title:c.name,alt:c.name+' card',icon:L.divIcon({className:'map-point '+c.vibes[0],iconSize:[13,13],iconAnchor:[6,6]})}).addTo(map);const b=document.createElement('button');b.className='map-popup';b.setAttribute('aria-label','Open '+c.name+' from map');b.innerHTML=picture(c)+`<strong>${esc(c.name)}</strong><span>${c.hp} HP · Open card ↗</span>`;b.addEventListener('click',()=>openCard(c.id,inView));marker.bindPopup(b,{maxWidth:150,minWidth:120});marker.on('click',()=>{selectedId=c.id;$$('.card-item').forEach(el=>el.classList.toggle('map-selected',Number(el.dataset.id)===c.id));const el=$(`#cards [data-id="${c.id}"]`);if(el){const panel=$('.cards-column');panel.scrollTo({top:panel.scrollTop+el.getBoundingClientRect().top-panel.getBoundingClientRect().top,behavior:state.motionOff?'instant':'smooth'});}});markers.push(marker);}}
function fitAll(){if(!map||!filtered.length)return;const points=filtered.map(c=>[c.lat,c.lng]);map.invalidateSize();map.fitBounds(points,{padding:[35,35],maxZoom:15,animate:!state.motionOff});syncMapCards();}
function syncMapCards(){if(!map)return;const bounds=map.getBounds();renderList(filtered.filter(c=>bounds.contains([c.lat,c.lng])));$('.cards-column').scrollTop=0;}
$('#cards').addEventListener('click',e=>{const cityButton=e.target.closest('[data-group-city]');if(cityButton){state.city=cityButton.dataset.groupCity;renderCollection(true);if(state.view==='map')fitAll();$('#city-picker').scrollIntoView({behavior:state.motionOff?'instant':'smooth',block:'center'});return;}const b=e.target.closest('[data-card]');if(b)openCard(Number(b.dataset.card),inView);});
$('#journey-cards').innerHTML=featured.map(c=>`<div class="flight-card effects-visible" data-flight="${c.id}"><span class="card-art"><img src="${esc(asset(c.thumb))}" alt="">${stars(c.id)}</span></div>`).join('');
// Decode the four entrance images before they are needed; keep their pixels identical to the grid.
const flightNodes=featured.map(c=>$(`[data-flight="${c.id}"]`));
for(const flight of flightNodes)flight.querySelector('img').decode().catch(()=>{});
function measureJourney(){
 // All layout reads happen together. Only scrolling offsets these cached grid positions.
 const entries=featured.map((c,i)=>{
  const target=$(`#cards [data-card="${c.id}"]`);
  if(!target)return null;
  const r=target.getBoundingClientRect();
  return {target,flight:flightNodes[i],left:r.left,top:r.top+scrollY,width:r.width,height:r.height};
 });
 journeyGeometry=entries;
 const first=entries.find(Boolean);
 journeyDistance=Math.max(innerHeight*1.4,(first?.top||$('.home-journey').offsetHeight)-innerHeight*.24);
 for(const entry of entries)if(entry)entry.target.classList.toggle('awaiting-landing',!state.motionOff);
}
function openCard(id,list=cards){const c=cards.find(c=>c.id===id);if(!c)return;const dialog=$('#card-dialog'),token=++detailToken;if(!dialog.open){returnFocus=document.activeElement;detailDeck=list.length?list:[c];dialog.showModal();}detailId=id;dialog.dataset.cardId=String(id);dialog.setAttribute('aria-label',c.name+' card');const wrap=$('#detail-image');wrap.replaceChildren();wrap.textContent='Opening card…';wrap.setAttribute('aria-busy','true');const img=new Image();img.alt=c.name+' collectible card, '+c.hp+' HP';img.src=asset(c.image);img.decode().then(()=>{if(token!==detailToken)return;const art=document.createElement('div');art.className='card-art inspect-art effects-visible';art.append(img);art.insertAdjacentHTML('beforeend','<span class="card-foil" aria-hidden="true"></span>'+stars(c.id,7));wrap.replaceChildren(art);wrap.setAttribute('aria-busy','false');}).catch(()=>{if(token===detailToken){wrap.textContent='Unable to open this card. Please try again.';wrap.setAttribute('aria-busy','false');}});}
$('.dialog-close').addEventListener('click',()=>$('#card-dialog').close());$('#card-dialog').addEventListener('click',e=>{if(e.target===$('#card-dialog')||e.target===$('#detail-image'))$('#card-dialog').close();});$('#card-dialog').addEventListener('close',()=>{detailToken++;if(location.hash.startsWith('#card/')){history.replaceState(history.state,'',location.pathname+location.search+'#explore');lastRoutedURL=location.href;}returnFocus?.focus({preventScroll:true});});$('#card-dialog').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)&&detailDeck.length>1){e.preventDefault();let i=detailDeck.findIndex(c=>c.id===detailId);i=(i+(e.key==='ArrowLeft'?-1:1)+detailDeck.length)%detailDeck.length;openCard(detailDeck[i].id,detailDeck);}});
$('#cards').addEventListener('pointermove',e=>{if(state.motionOff||e.pointerType==='touch')return;const b=e.target.closest('.card-button');if(!b)return;const r=b.getBoundingClientRect();b.style.setProperty('--cx',((e.clientX-r.left)/r.width-.5)*14+'deg');b.style.setProperty('--cy',-((e.clientY-r.top)/r.height-.5)*14+'deg');b.style.setProperty('--mx',(e.clientX-r.left)/r.width*100+'%');b.style.setProperty('--my',(e.clientY-r.top)/r.height*100+'%');});$('#cards').addEventListener('pointerout',e=>{const b=e.target.closest('.card-button');if(b&&!b.contains(e.relatedTarget)){b.style.setProperty('--cx','0deg');b.style.setProperty('--cy','0deg');}});
$('#detail-image').addEventListener('pointermove',e=>{if(state.motionOff||e.pointerType!=='mouse')return;const art=e.currentTarget.querySelector('.inspect-art');if(!art)return;const r=art.getBoundingClientRect();art.style.setProperty('--mx',(e.clientX-r.left)/r.width*100+'%');art.style.setProperty('--my',(e.clientY-r.top)/r.height*100+'%');art.style.setProperty('--cx',((e.clientX-r.left)/r.width-.5)*8+'deg');art.style.setProperty('--cy',-((e.clientY-r.top)/r.height-.5)*8+'deg');});$('#detail-image').addEventListener('pointerleave',()=>{const art=$('.inspect-art');if(art){art.style.setProperty('--cx','0deg');art.style.setProperty('--cy','0deg');}});
const post=posts[0];$('#story-preview').textContent=post.preview;$('#story-count').textContent=String(posts.length).padStart(2,'0')+' '+(posts.length===1?'STORY':'STORIES')+' & COUNTING';$('#story-list').innerHTML=posts.map((p,i)=>`<button class="story-index-row" data-post="${p.id}"><span>${String(i+1).padStart(2,'0')}</span><span class="story-index-title">${esc(p.title)}</span><span class="story-index-date">${esc(p.date)}</span><span class="story-index-arrow">↗</span></button>`).join('');
function setArticle(p){activePost=p;$('#article-meta').textContent=p.city+' / '+p.date;$('#article-title').textContent=p.title;$('#article-body').innerHTML=p.content;for(const img of $$('#article-body img'))if(img.getAttribute('src')?.startsWith('assets/'))img.src=asset(img.getAttribute('src'));}
function openStory(p=post){setArticle(p);navigate('article');history.replaceState(history.state,'',location.pathname+location.search+'#post-'+p.id);lastRoutedURL=location.href;}
$('#open-story').addEventListener('click',()=>openStory());$('#journal-art').addEventListener('click',()=>openStory());$('#story-list').addEventListener('click',e=>{const b=e.target.closest('[data-post]');if(b)openStory(posts.find(p=>p.id===Number(b.dataset.post)));});
// Keep the original moving letter artwork, including its typeface and colours.
const rings=[];
document.fonts.load("140px 'Luckiest Guy'").then(()=>{const ctx=document.createElement('canvas').getContext('2d');ctx.font="140px 'Luckiest Guy'";const phrase='FOR US AMONGST FRIENDS  '.repeat(2),glyphs=[...phrase],widths=glyphs.map(ch=>ctx.measureText(ch).width),total=widths.reduce((a,b)=>a+b,0);for(const art of $$('.sbuf-art')){const track=art.querySelector('.sbuf-track');let sum=0;glyphs.forEach((ch,i)=>{if(ch!==' '){const el=document.createElement('span');el.className='sbuf-ch';el.textContent=ch;el.style.animationDelay='-'+((sum+widths[i]/2)/total*50)+'s';track.appendChild(el);}sum+=widths[i];});rings.push({art,track,total,letters:[...track.children],lastW:0,lastH:0});new ResizeObserver(fitRings).observe(art);}fitRings();});
function fitRings(){for(const r of rings){const w=r.art.clientWidth,h=r.art.clientHeight;if(!w||!h||(w===r.lastW&&h===r.lastH))continue;r.lastW=w;r.lastH=h;const vh=h/w*1000,pad=74,rr=30,right=1000-pad,bottom=vh-pad;const perimeter=2*((1000-pad*2)+(vh-pad*2)-4*rr)+2*Math.PI*rr;const k=perimeter/r.total;const d=`path('M ${pad+rr} ${pad} H ${right-rr} A ${rr} ${rr} 0 0 1 ${right} ${pad+rr} V ${bottom-rr} A ${rr} ${rr} 0 0 1 ${right-rr} ${bottom} H ${pad+rr} A ${rr} ${rr} 0 0 1 ${pad} ${bottom-rr} V ${pad+rr} A ${rr} ${rr} 0 0 1 ${pad+rr} ${pad} Z')`;r.track.style.height=vh+'px';r.track.style.transform=`scale(${w/1000})`;for(const el of r.letters){el.style.offsetPath=d;el.style.fontSize=140*k+'px';el.style.webkitTextStrokeWidth=4*k+'px';}}}
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v)),mix=(a,b,t)=>a+(b-a)*t;const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
// The entrance is consumed once. Keep the grid at exactly the same screen position
// while removing Home's scroll runway, then route to Explore without re-rendering it.
function completeJourney(){
 if(state.page!=='home')return;
 const anchor=$('#cards .card-button')||$('#collection'),before=anchor.getBoundingClientRect().top;
 state.page='explore';document.body.dataset.page='explore';$('#home-page').hidden=true;$('#explore-page').classList.remove('from-home');$('#explore-page').inert=false;$('.home-sticky').inert=false;
 $('#journey-cards').hidden=true;for(const el of $$('.awaiting-landing'))el.classList.remove('awaiting-landing');
 document.body.classList.remove('journey-in-collection');document.body.style.removeProperty('--home-alpha');document.body.style.removeProperty('--collection-alpha');
 $('.page-dock').hidden=false;$('.page-dock a[href="#explore"]').setAttribute('aria-current','page');$('.masthead-note').textContent='EXPLORE';
 const destination=Math.max(0,scrollY+anchor.getBoundingClientRect().top-before);
 window.scrollTo({top:destination,behavior:'instant'});previousScroll=destination;scrollSpeed=0;window.FnpSoftHeart?.setActive(false);
 history.replaceState({page:'home',y:0},'');history.pushState({page:'explore',y:destination},'',location.pathname+location.search+'#explore');lastRoutedURL=location.href;
 document.title='Friend Not Phoe — Explore';
}
let previousScroll=scrollY,scrollSpeed=0;
function updateScene(time){const dt=Math.min((time-lastTime)/1000,.05)||0;lastTime=time;if(!state.motionOff)phase+=dt*.3;scrollSpeed=mix(scrollSpeed,Math.max(-2.2,Math.min(2.2,(scrollY-previousScroll)*.08)),.12);previousScroll=scrollY;
 for(const el of visibleCards)el.style.setProperty('--scroll-tilt',state.motionOff?'0deg':scrollSpeed.toFixed(3)+'deg');
 if(state.page==='home'){
  const mobile=innerWidth<700;window.FnpLettering?.update(phase);
  if(!journeyGeometry)measureJourney();
  const rawProgress=clamp(scrollY/(state.motionOff?innerHeight:journeyDistance));
  // A short, frame-rate independent catch-up takes the edge off wheel increments.
  // The document itself always follows native scroll; only the card transforms are eased.
  journeyProgress=state.motionOff?rawProgress:mix(journeyProgress,rawProgress,1-Math.exp(-Math.max(dt,.001)/.065));
  if(Math.abs(journeyProgress-rawProgress)<.0001)journeyProgress=rawProgress;
  const p=journeyProgress,fade=1-smooth(.04,.32,p),scrollLanding=smooth(.30,1,p);
  const collectionAlpha=state.motionOff?1:smooth(.28,.74,p);
  document.body.style.setProperty('--home-alpha',fade);
  document.body.style.setProperty('--home-lift',-p*innerHeight*.14+'px');
  document.body.style.setProperty('--collection-alpha',collectionAlpha);
  document.body.classList.toggle('journey-in-collection',p>.66);
  $('#explore-page').inert=p<.62;$('.home-sticky').inert=p>.35;
  $('.page-dock').hidden=p<.7;
  $('.page-dock a[href="#explore"]').setAttribute('aria-current',p>.7?'page':'false');
  $('.masthead-note').textContent=p>.7?'EXPLORE':'';
  window.FnpSoftHeart?.setActive(p<.4);
  if(p>=.84&&!journeyFinishStarted){journeyFinishStarted=time;journeyFinishFrom=scrollLanding;}
  const settle=journeyFinishStarted?clamp((time-journeyFinishStarted)/320):0;
  const landing=Math.max(scrollLanding,mix(journeyFinishFrom,1,1-Math.pow(1-settle,3)));
  const overlay=$('#journey-cards');overlay.style.visibility=!state.motionOff&&p>.075?'visible':'hidden';
  journeyGeometry.forEach((entry,i)=>{
   if(!entry){flightNodes[i].hidden=true;return;}
   const {target,flight,left,top,width,height}=entry;
   const angle=i/4*Math.PI*2+phase,size=mobile?105:Math.min(innerWidth*.15,200),enter=smooth(.075,.24,p);
   const x=innerWidth/2+Math.sin(angle)*innerWidth*(mobile?.27:.24),y=innerHeight*.48+Math.cos(angle)*innerHeight*.12;
   const scale=mix(size,width,landing)/180*mix(.32,1,enter);
   flight.hidden=false;flight.style.opacity=String(enter);
   flight.style.transform=`translate3d(${mix(x,left+width/2,landing)}px,${mix(y,top-scrollY+height/2,landing)}px,0) translate(-50%,-50%) rotateY(${mix(-Math.sin(angle)*32,0,landing)}deg) rotateZ(${mix(Math.sin(angle)*12,0,landing)}deg) scale(${scale})`;
   flight.style.zIndex=String(10+Math.round(Math.cos(angle)*5));
  });
  if(document.body.dataset.focus!=='heart'&&((state.motionOff&&rawProgress>=.999)||settle===1))completeJourney();
 }else{document.body.style.removeProperty('--home-alpha');$('#explore-page').inert=false;$('.home-sticky').inert=false;for(const el of $$('.awaiting-landing'))el.classList.remove('awaiting-landing');document.body.classList.remove('journey-in-collection');}
 if(state.page==='adventures'){
  const area=$('.journal-pullback'),stage=$('.journal-stage'),rect=area.getBoundingClientRect();const header=innerWidth<700?76:90;const p=clamp((-rect.top+header)/(area.offsetHeight-stage.offsetHeight));const t=p*p*(3-2*p),mobile=innerWidth<700,H=stage.clientHeight,W=innerWidth;const art=$('#journal-art');const endW=mobile?W*.65:Math.min(W*.43,H*.78);const endH=endW;const startH=H*.92;art.style.setProperty('--art-left',mix(W*.02,mobile?W*.175:W*.055,t)+'px');art.style.setProperty('--art-top',mix(H*.02,mobile?H*.025:(H-endH)/2,t)+'px');art.style.setProperty('--art-width',mix(W*.96,endW,t)+'px');art.style.setProperty('--art-height',mix(startH,endH,t)+'px');stage.style.setProperty('--opening-opacity',1-clamp(p/.38));stage.style.setProperty('--info-opacity',clamp((p-.47)/.35));stage.style.setProperty('--info-y',mix(25,0,clamp((p-.47)/.4))+'px');stage.style.setProperty('--info-top',(endH+H*.08)+'px');$('.journal-story-info').inert=p<.68;$('.journal-scroll').style.pointerEvents=p>.3?'none':'auto';
 }

}
new ResizeObserver(()=>{journeyGeometry=null;journeyDistance=0;}).observe($('#collection'));
addEventListener('resize',()=>{journeyDistance=0;journeyGeometry=null;fitRings();});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);window.FnpSoftHeart?.setActive(false);}else{lastTime=performance.now();frame=requestAnimationFrame(tick);window.FnpSoftHeart?.setActive(state.page==='home');}});
function tick(time){updateScene(time);frame=requestAnimationFrame(tick);}
frame=requestAnimationFrame(tick);
setPalette(state.palette);setMotion(state.motionOff);routeLocation();
})();
