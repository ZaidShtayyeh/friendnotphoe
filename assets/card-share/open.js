// Crawlers read this page's static metadata; visitors open the existing card viewer.
(()=>{const slug=document.currentScript?.dataset.card;if(slug&&/^[a-z0-9-]+$/.test(slug))location.replace('/#card/'+slug);})();
