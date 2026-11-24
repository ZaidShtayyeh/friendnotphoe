const refresh=require('./tracker-refresh-2026-11-22.json');
const punctuation=require('./vibes-periods-2026-11-23.json');
const types={blue:'drink',green:'food',gold:'special'};
function approvedURL(id,url){
 if(!url)return url;
 if(punctuation.ids.includes(id))return url.split('?')[0]+'?v='+punctuation.version;
 if(id===45)return url.split('?')[0]+'?v=20261123-print';
 return url;
}
function approvedReview(id,record){
 const text=punctuation.previousCopyCorrections[id]??record.vibes;
 return {...record,vibes:/[.!?…]$/.test(text)?text:text+'.'};
}
function approvedExisting(card){
 const update=refresh.updated.find(c=>c.id===card.id);
 const next=update?{...card,hp:update.hp,vibes:[types[update.color]],image:'assets/cards-finish-v12/'+update.key+'.webp?v='+refresh.version}:{...card};
 if(update&&card.thumb)next.thumb='assets/cards-finish-v12/'+update.key+'-750.webp?v='+refresh.version;
 if(card.id===29)next.hp=260;
 if(card.id===45){next.hp=275;next.vibes=['special'];}
 if(next.image)next.image=approvedURL(card.id,next.image);
 if(next.thumb)next.thumb=approvedURL(card.id,next.thumb);
 return next;
}
module.exports={refresh,approvedExisting,approvedReview,approvedURL};
