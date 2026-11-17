/* Same paper layer for shared image files as for cards on screen. */
(() => {
  'use strict';
  const src=new URL('front-surface.svg',document.currentScript.src).href;
  let surface;
  function load(){
    if(!surface)surface=new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>{surface=null;resolve(null);};
      image.src=src;
    });
    return surface;
  }
  window.FnpCardFinish={async paint(ctx){
    const image=await load();
    if(!image)return false;
    ctx.save();
    // Restrict compositing to the paper region; rounded card edges are outside the finish.
    ctx.beginPath();
    ctx.rect(ctx.canvas.width*98/1500,ctx.canvas.height*98/2100,ctx.canvas.width*1304/1500,ctx.canvas.height*1898/2100);
    ctx.clip();
    ctx.globalCompositeOperation='multiply';
    ctx.drawImage(image,0,0,ctx.canvas.width,ctx.canvas.height);
    ctx.restore();
    return true;
  }};
})();
