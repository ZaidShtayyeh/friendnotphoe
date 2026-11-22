(() => {
 const dialog=document.querySelector('#filter-picker'),options=document.querySelector('#filter-picker-options');
 const creator=document.querySelector('#creator-filter'),sort=document.querySelector('#sort'),group=document.querySelector('#group-by-city');
 const creators={all:'Everyone',zaid:'Z',friends:'Friends'},sorts={random:'Randoo',hp:'Highest HP',name:'A–Z'};
 let trigger=null;
 function sync(){
  document.querySelector('#creator-picker-value').textContent=creators[creator.value];
  document.querySelector('#sort-picker-value').textContent=sorts[sort.value];
  document.querySelectorAll('[data-arrange]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.arrange==='city')===group.checked)));
 }
 function open(select,button,title){
  trigger=button;options.replaceChildren();document.querySelector('#filter-picker-title').textContent=title;
  for(const option of select.options){
   const b=document.createElement('button');b.className='choice-option';b.dataset.value=option.value;b.setAttribute('aria-pressed',String(option.selected));
   const copy=document.createElement('span');copy.className='choice-copy';const name=document.createElement('span');name.className='choice-name';name.textContent=option.textContent;copy.append(name);
   if(select===creator){const n=window.FNP_DATA.cards.filter(c=>option.value==='all'||(option.value==='friends'?c.creator?.kind==='friend':c.creator?.kind!=='friend')).length;const note=document.createElement('span');note.className='choice-note';note.textContent=n+' cards';copy.append(note);}
   b.append(copy);b.insertAdjacentHTML('beforeend','<span class="choice-tick" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7"/></svg></span>');
   b.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();dialog.close()});options.append(b);
  }
  button.setAttribute('aria-expanded','true');dialog.showModal();options.querySelector('[aria-pressed=true]').focus({preventScroll:true});
 }
 document.querySelector('#creator-picker').addEventListener('click',e=>open(creator,e.currentTarget,'From'));
 document.querySelector('#sort-picker').addEventListener('click',e=>open(sort,e.currentTarget,'Sort cards'));
 document.querySelector('.choice-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 dialog.addEventListener('close',()=>{trigger?.setAttribute('aria-expanded','false');trigger?.focus({preventScroll:true})});
 options.addEventListener('keydown',e=>{const buttons=[...options.children],i=buttons.indexOf(document.activeElement);let next;if(e.key==='ArrowDown')next=(i+1)%buttons.length;if(e.key==='ArrowUp')next=(i-1+buttons.length)%buttons.length;if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;if(next!==undefined){e.preventDefault();buttons[next].focus()}});
 document.querySelectorAll('[data-arrange]').forEach(b=>b.addEventListener('click',()=>{const checked=b.dataset.arrange==='city';if(group.checked!==checked){group.checked=checked;group.dispatchEvent(new Event('change',{bubbles:true}))}sync()}));
 window.FnpExploreControls={sync};sync();
})();
