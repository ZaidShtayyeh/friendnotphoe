const refresh=require('./tracker-refresh-2026-11-22.json');
const types={blue:'drink',green:'food',gold:'special'};
function approvedExisting(card){
 const update=refresh.updated.find(c=>c.id===card.id);
 if(!update)return card;
 const next={...card,hp:update.hp,vibes:[types[update.color]],image:'assets/cards-finish-v12/'+update.key+'.webp?v='+refresh.version};
 if(card.thumb)next.thumb='assets/cards-finish-v12/'+update.key+'-750.webp?v='+refresh.version;
 return next;
}
module.exports={refresh,approvedExisting};
