/* Original heart material, with continuous elastic deformation and a liquid entrance. */
(() => {
'use strict';
const canvas=document.querySelector('#soft-heart'),host=document.querySelector('.heart-object'),status=document.querySelector('#heart-status');
const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,powerPreference:'low-power'});
let active=true,motionOff=matchMedia('(prefers-reduced-motion: reduce)').matches,frame=0,ready=false,started=0,last=0,hover=false,drag=false,pointer=[0,0],force=[0,0],target=[0,0],velocity=[0,0],pulse=0,holdStarted=0,pressOrigin=null,burstStarted=0,burstCount=0;
window.FnpSoftHeart={setActive(v){active=v;if(!v)resetEgg();if(v&&ready&&!frame){last=performance.now();frame=requestAnimationFrame(tick);}},setMotion(v){motionOff=v;if(v)resetEgg();target=[0,0];force=[0,0];velocity=[0,0];},pulse(){if(!motionOff){pulse=1;target=[.13,-.09];}}};
const vertex='attribute vec2 a; varying vec2 uv; void main(){uv=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
const fragment=`precision highp float; varying vec2 uv;
uniform sampler2D heart; uniform float aspect,time,intro,motion,pulse,burst,eggBlend,pressure; uniform vec2 point,force;
vec4 art(vec2 p){vec2 t=p/vec2(1.103,.76)+.5;if(t.x<0.||t.x>1.||t.y<0.||t.y>1.)return vec4(0.);return texture2D(heart,t);}
float smoothMin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float liquid(vec2 p,float t){float apart=1.-smoothstep(0.,.68,t);vec2 l=vec2(-.15-.26*apart,-.09-.04*apart),r=vec2(.15+.24*apart,-.09+.06*apart),b=vec2(.01,.16+.24*apart);float d1=length(p-l)-.18,d2=length(p-r)-.18,d3=length((p-b)*vec2(1.,.9))-.14;return smoothMin(smoothMin(d1,d2,.12),d3,.18);}
vec4 gel(vec2 p,float t){float d=liquid(p,t);float a=1.-smoothstep(-.003,.004,d);vec2 e=vec2(.003,0.);vec2 n=normalize(vec2(liquid(p+e,t)-liquid(p-e,t),liquid(p+e.yx,t)-liquid(p-e.yx,t))+.0001);float rim=exp(-abs(d)*28.);vec3 c=mix(vec3(.64,.008,.15),vec3(.94,.04,.29),.4+.4*p.y);c+=vec3(.36,.12,.26)*rim*max(0.,-n.x*.6-n.y*.8);c+=vec3(.65,.60,.65)*pow(max(0.,-n.x*.45-n.y*.89),14.)*rim;c+=vec3(.4,.18,.38)*exp(-dot(p-vec2(-.08,-.16),p-vec2(-.08,-.16))*150.);return vec4(c,a);}
// Four smooth-union lobes stretch apart gradually; the necks narrow before separating.
float bubbleField(vec2 p,float a){
 float drift=.008*a;
 vec2 c1=vec2(-.17-.21*a,-.11-.08*a)+drift*vec2(sin(time*1.3),cos(time*1.1));
 vec2 c2=vec2(.17+.21*a,-.11-.06*a)+drift*vec2(cos(time*1.2),sin(time*1.4));
 vec2 c3=vec2(-.06-.17*a,.12+.12*a)+drift*vec2(sin(time*1.1+2.),cos(time*1.2));
 vec2 c4=vec2(.08+.17*a,.12+.12*a)+drift*vec2(cos(time*1.3+1.),sin(time*1.1));
 float d1=length(p-c1)-mix(.18,.15,a),d2=length(p-c2)-mix(.18,.16,a);
 float d3=length(p-c3)-mix(.155,.125,a),d4=length(p-c4)-mix(.15,.135,a);
 float neck=mix(.17,.025,a);
 return smoothMin(smoothMin(d1,d2,neck),smoothMin(d3,d4,neck),neck);
}
vec4 bubbleGel(vec2 p,float a){
 float d=bubbleField(p,a),alpha=1.-smoothstep(-.003,.004,d);vec2 e=vec2(.002,0.);
 vec2 gradient=normalize(vec2(bubbleField(p+e,a)-bubbleField(p-e,a),bubbleField(p+e.yx,a)-bubbleField(p-e.yx,a))+.00001);
 float inner=clamp(-d/.15,0.,1.);vec3 normal=normalize(vec3(gradient*(1.-inner),sqrt(inner)*1.35));
 vec3 light=normalize(vec3(-.48,-.65,1.));float diffuse=max(0.,dot(normal,light));
 vec3 color=mix(vec3(.30,.003,.07),vec3(.92,.025,.24),.35+.65*diffuse);
 color+=vec3(.65,.16,.46)*pow(1.-normal.z,3.)*.55;
 color+=vec3(.95,.75,.87)*pow(diffuse,22.)*.95;
 color+=vec3(.4,.19,.32)*pow(max(0.,dot(normal,normalize(vec3(.8,.25,.7)))),9.);
 return vec4(color,alpha);
}
void main(){vec2 p=vec2((uv.x-.5)*aspect,.5-uv.y);float influence=exp(-dot(p-point,p-point)*10.);vec2 q=p-force*influence;float wobble=motion*(.005*sin(time*1.7+p.y*9.)+.025*pulse*sin(p.y*12.-time*5.));q.x+=wobble*exp(-dot(p,p)*7.);q.y+=motion*.004*sin(time*1.3+p.x*8.);q*=1.-.018*pulse-.045*pressure;
vec4 heartColor=art(q);float t=intro;vec4 g=gel(q,t);float fade=smoothstep(.48,1.,t);vec4 outc=mix(vec4(g.rgb*g.a,g.a),vec4(heartColor.rgb*heartColor.a,heartColor.a),fade);vec4 bubbles=bubbleGel(q,burst);outc=mix(outc,vec4(bubbles.rgb*bubbles.a,bubbles.a),eggBlend);gl_FragColor=outc;}`;
let program,u={};
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const smooth=(a,b,t)=>{const v=Math.max(0,Math.min(1,(t-a)/(b-a)));return v*v*(3-2*v);};
function resetEgg(){holdStarted=0;pressOrigin=null;burstStarted=0;drag=false;canvas.dataset.eggPhase='idle';canvas.dataset.holdProgress='0';}
function beginBurst(now=performance.now()){
 if(motionOff||burstStarted||!ready)return;
 burstStarted=now;holdStarted=0;target=[0,0];force=[0,0];velocity=[0,0];burstCount++;
 canvas.dataset.burstCount=String(burstCount);status.textContent='The heart gently separates into four bubbles, then comes back together.';
}
function eggState(now){
 if(holdStarted&&!burstStarted&&now-holdStarted>=650)beginBurst(now);
 const press=holdStarted?Math.min(1,(now-holdStarted)/650):0;
 canvas.dataset.holdProgress=press.toFixed(2);
 if(!burstStarted){canvas.dataset.eggPhase=holdStarted?'holding':'idle';return {amount:0,blend:0,press};}
 const elapsed=now-burstStarted;
 if(elapsed>=3400){burstStarted=0;canvas.dataset.eggPhase='idle';status.textContent='The heart is together again.';return {amount:0,blend:0,press:0};}
 canvas.dataset.eggPhase=elapsed<950?'separating':elapsed<1650?'bubbles':'rejoining';
 return {amount:smooth(0,950,elapsed)*(1-smooth(1650,2950,elapsed)),blend:smooth(0,420,elapsed)*(1-smooth(2800,3400,elapsed)),press:0};
}
function tick(now){frame=0;if(!active||document.hidden)return;let dt=Math.min((now-last)/1000,.033)||.016;last=now;pulse*=Math.exp(-dt*2.8);if(!hover&&!drag){target[0]*=.86;target[1]*=.86;}for(let i=0;i<2;i++){velocity[i]+=(target[i]-force[i])*85*dt-velocity[i]*11*dt;force[i]+=velocity[i]*dt;}const egg=eggState(now),progress=motionOff?1:Math.min(1,(now-started)/1800);canvas.dataset.phase=progress<1?'forming':Math.hypot(...force)>.012?'flowing':'resting';
 const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2),w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}gl.useProgram(program);gl.uniform1f(u.aspect,w/h);gl.uniform1f(u.time,now/1000);gl.uniform1f(u.intro,progress);gl.uniform1f(u.motion,motionOff?0:1);gl.uniform1f(u.pulse,motionOff?0:pulse);gl.uniform1f(u.burst,egg.amount);gl.uniform1f(u.eggBlend,egg.blend);gl.uniform1f(u.pressure,egg.press);gl.uniform2f(u.point,...pointer);gl.uniform2f(u.force,...(motionOff?[0,0]:force));gl.drawArrays(gl.TRIANGLES,0,6);frame=requestAnimationFrame(tick);
}
function init(){if(!gl){canvas.dataset.renderer='static';return;}try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Heart shader link failed');gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);for(const name of ['heart','aspect','time','intro','motion','pulse','point','force','burst','eggBlend','pressure'])u[name]=gl.getUniformLocation(program,name);const im=new Image();im.onload=()=>{const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE);for(const k of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,k,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.uniform1i(u.heart,0);host.classList.add('is-ready');canvas.dataset.renderer='elastic-webgl';ready=true;started=last=performance.now();frame=requestAnimationFrame(tick);};im.src='assets/home-heart-v2/heart-only.png';}catch(e){canvas.dataset.renderer='static';console.warn('Heart fallback:',e.message);}}
function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left-r.width/2)/r.height,(e.clientY-r.top-r.height/2)/r.height];}
canvas.addEventListener('pointerenter',()=>hover=true);canvas.addEventListener('pointermove',e=>{if(pressOrigin&&Math.hypot(e.clientX-pressOrigin[0],e.clientY-pressOrigin[1])>22){holdStarted=0;pressOrigin=null;}const p=point(e),dx=p[0]-pointer[0],dy=p[1]-pointer[1];pointer=p;if(motionOff)return;const proximity=Math.exp(-Math.max(0,Math.hypot(...p)-.30)*9);target=[Math.max(-.16,Math.min(.16,(p[0]*.24+dx*2.7)*proximity)),Math.max(-.14,Math.min(.14,(p[1]*.22+dy*2.7)*proximity))];});canvas.addEventListener('pointerleave',()=>{hover=false;target=[0,0];if(!drag){holdStarted=0;pressOrigin=null;}});canvas.addEventListener('pointerdown',e=>{if(e.button!==0||motionOff||burstStarted)return;drag=true;canvas.setPointerCapture(e.pointerId);pulse=.15;holdStarted=performance.now();pressOrigin=[e.clientX,e.clientY];});for(const ev of ['pointerup','pointercancel'])canvas.addEventListener(ev,e=>{drag=false;hover=false;holdStarted=0;pressOrigin=null;target=[0,0];if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});canvas.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat)beginBurst();}});canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('blur',()=>{holdStarted=0;pressOrigin=null;});addEventListener('blur',resetEgg);document.addEventListener('visibilitychange',()=>{if(document.hidden)resetEgg();});canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0;host.classList.remove('is-ready');canvas.dataset.renderer='static';status.textContent='Friend Not Phoe heart.';});init();
})();
