import { WORLD, RULES, delta, wrap } from './rules.js';
const TAU=Math.PI*2;
const smooth=(value,target,k)=>value+(target-value)*k;
function sizeCanvas(canvas) {
  const rect=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w:rect.width,h:rect.height};
}
const stars=Array.from({length:180},(_,i)=>({x:((i*7919)%10007)/10007,y:((i*4447)%10009)/10009,r:i%7===0?1.4:.6,a:.15+(i%8)/18}));
function field(ctx,w,h,time,reduced) {
  ctx.clearRect(0,0,w,h);
  for(const s of stars){ctx.globalAlpha=s.a*(reduced?1:.8+.2*Math.sin(time*.001+s.x*20));ctx.fillStyle='#c3e3f4';ctx.beginPath();ctx.arc(s.x*w,s.y*h,s.r,0,TAU);ctx.fill();}
  ctx.globalAlpha=1;
}
function crystal(ctx,x,y,r,rotation,letter,color='#70f7d1',scale=1) {
  ctx.save();ctx.translate(x,y);
  const points=[[-.1,-1],[.8,-.45],[.65,.64],[-.28,.95],[-.9,.15],[-.65,-.65]];
  ctx.rotate(rotation);
  ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(px*r,py*r):ctx.moveTo(px*r,py*r));ctx.closePath();
  const fill=ctx.createLinearGradient(-r,-r,r,r);fill.addColorStop(0,'#2c756b88');fill.addColorStop(1,'#182c5266');
  ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=color+'80';ctx.lineWidth=1.4;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-.1*r,-r);ctx.lineTo(-.28*r,.95*r);ctx.lineTo(.8*r,-.45*r);ctx.lineTo(-.9*r,.15*r);ctx.strokeStyle=color+'26';ctx.lineWidth=.7;ctx.stroke();
  ctx.rotate(-rotation);
  ctx.shadowColor='#071320';ctx.shadowBlur=5;ctx.fillStyle='#e7fff9';ctx.font='750 '+Math.max(13,21*scale)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(letter,0,1);
  ctx.restore();
}
export class SpaceBackdrop {
  constructor(canvas){this.canvas=canvas;this.reduced=false;this.active=true;}
  draw(time){
    const {ctx,w,h}=sizeCanvas(this.canvas);field(ctx,w,h,time,this.reduced);
    if(!this.active)return;
    const x=w*.25,y=h*.61,r=Math.min(520,w*.47);
    const g=ctx.createRadialGradient(x-r*.25,y-r*.3,0,x,y,r);g.addColorStop(0,'#163d4538');g.addColorStop(.6,'#112b4226');g.addColorStop(1,'#0b142300');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();ctx.strokeStyle='#53969513';ctx.lineWidth=1;
    for(let i=-4;i<=4;i++){
      ctx.beginPath();ctx.ellipse(x,y,r*Math.max(.08,Math.abs(i)/4),r,.25,0,TAU);ctx.stroke();
      ctx.beginPath();ctx.ellipse(x,y+i*r*.22,r,Math.max(8,r*.19),.25,0,TAU);ctx.stroke();
    }ctx.restore();
    if(w>700){
      const t=this.reduced?0:time*.0001;
      crystal(ctx,w*.45+Math.sin(t)*10,h*.38,28,.2,'A','#70f7d1',1.1);
      crystal(ctx,w*.39+Math.cos(t)*10,h*.72,20,-.1,'R','#b5a0ff',.8);
      crystal(ctx,w*.08,h*.78+Math.sin(t)*7,17,.3,'E','#70f7d1',.7);
    }
  }
}
export class Arena {
  constructor(canvas,map,getInput){
    this.canvas=canvas;this.map=map;this.getInput=getInput;
    this.state=null;this.me=null;this.follow=null;this.visual=new Map();this.camera={x:1200,y:800};
    this.received=0;this.lastEvent=0;this.effects=[];this.lastFrame=performance.now();this.reduced=false;
    this.scale=1;this.w=1000;this.h=600;
  }
  update(state,me){
    if(this.state?.matchId!==state.matchId){this.visual.clear();this.effects=[];this.lastEvent=0;}
    this.state=state;this.me=me;this.received=performance.now();
    for(const ev of state.events){
      if(ev.seq<=this.lastEvent)continue;
      this.lastEvent=ev.seq;
      if(['open','pickup','ripple','reset','return','word'].includes(ev.type))
        this.effects.push({...ev,born:performance.now()});
    }
    this.effects=this.effects.slice(-80);
  }
  targetPlayer(){
    return this.state?.players.find(p=>p.id===(this.follow||this.me)&&p.role==='player') ||
      this.state?.players.find(p=>p.role==='player');
  }
  project(x,y){return {x:this.w/2+delta(x,this.camera.x,WORLD.width)*this.scale,y:this.h/2+delta(y,this.camera.y,WORLD.height)*this.scale};}
  aimAt(clientX,clientY){
    const p=this.state?.players.find(p=>p.id===this.me);if(!p)return 0;
    const v=this.visual.get(p.id)||p,screen=this.project(v.x,v.y),rect=this.canvas.getBoundingClientRect();
    return Math.atan2(clientY-rect.top-screen.y,clientX-rect.left-screen.x);
  }
  draw(time){
    const dt=Math.min((time-this.lastFrame)/1000,.05);this.lastFrame=time;
    if(!this.state || this.canvas.clientHeight===0)return;
    const {ctx,w,h}=sizeCanvas(this.canvas);this.w=w;this.h=h;
    this.scale=Math.min(w/1100,h/620);this.scale=Math.max(.4,Math.min(1.5,this.scale));
    field(ctx,w,h,time,this.reduced);
    const state=this.state,age=Math.min((time-this.received)/1000,.12),now=state.now+time-this.received;
    const input=this.getInput();
    for(const p of state.players){
      if(p.role!=='player')continue;
      let v=this.visual.get(p.id);
      if(!v){v={x:p.x,y:p.y,angle:p.angle};this.visual.set(p.id,v);}
      if(p.id===this.me && !p.resetUntil && !p.wordMode && state.phase==='playing'){
        v.x=wrap(v.x+input.x*RULES.speed*dt,WORLD.width);
        v.y=wrap(v.y+input.y*RULES.speed*dt,WORLD.height);
      }
      const k=1-Math.exp(-14*dt);
      const tx=wrap(p.x+p.vx*age,WORLD.width),ty=wrap(p.y+p.vy*age,WORLD.height);
      if(Math.hypot(delta(tx,v.x,WORLD.width),delta(ty,v.y,WORLD.height))>250){v.x=tx;v.y=ty;}
      else{v.x=wrap(v.x+delta(tx,v.x,WORLD.width)*k,WORLD.width);v.y=wrap(v.y+delta(ty,v.y,WORLD.height)*k,WORLD.height);}
      v.angle=p.id===this.me?input.angle:p.angle;
    }
    const target=this.targetPlayer(),cv=target&&(this.visual.get(target.id)||target);
    if(cv){const k=this.reduced?1:1-Math.exp(-10*dt);this.camera.x=wrap(this.camera.x+delta(cv.x,this.camera.x,WORLD.width)*k,WORLD.width);this.camera.y=wrap(this.camera.y+delta(cv.y,this.camera.y,WORLD.height)*k,WORLD.height);}
    const glow=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,Math.max(w,h)*.65);
    glow.addColorStop(0,'#1d4b5423');glow.addColorStop(.6,'#15274920');glow.addColorStop(1,'#02071360');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    // Decorative horizon grid. Entities keep a linear projection so aiming is exact.
    ctx.strokeStyle='#486c8426';ctx.lineWidth=.7;
    const step=100*this.scale,offsetX=-(this.camera.x*this.scale)%step,offsetY=-(this.camera.y*this.scale)%step;
    for(let x=offsetX-step;x<w+step;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.quadraticCurveTo(w/2+(x-w/2)*.83,h/2,x,h);ctx.stroke();}
    for(let y=offsetY-step;y<h+step;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.quadraticCurveTo(w/2,h/2+(y-h/2)*.77,w,y);ctx.stroke();}
    const visible=(s,margin=80)=>s.x>-margin&&s.x<w+margin&&s.y>-margin&&s.y<h+margin;
    for(const c of state.crystals){
      const s=this.project(c.x,c.y);if(!visible(s))continue;
      const rotation=c.rotation+(this.reduced?0:time*.00006);
      crystal(ctx,s.x,s.y,Math.max(18,c.r*this.scale),rotation,c.letter,c.letter==='Q'||c.letter==='Z'||c.letter==='X'?'#d2b4ff':'#70d6d4',this.scale);
    }
    for(const l of state.letters){
      const s=this.project(l.x,l.y);if(!visible(s))continue;
      const protectedPickup=l.priorityUntil>now;
      const mine=state.players.find(p=>p.id===this.me);
      const eligible=!protectedPickup||l.ownerId===this.me||(state.settings.mode==='teams'&&mine?.team===l.team);
      const color=eligible?'#a2ffe0':'#bca5fa',r=Math.max(13,17*this.scale);
      ctx.save();ctx.translate(s.x,s.y);ctx.globalAlpha=l.expiresAt-now<3000?.55:1;
      ctx.shadowColor=color;ctx.shadowBlur=this.reduced?0:12;
      ctx.fillStyle='#153143';ctx.strokeStyle=color;ctx.lineWidth=1.3;
      ctx.beginPath();ctx.roundRect(-r,-r,r*2,r*2,6);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle=color;ctx.font='750 '+Math.max(14,20*this.scale)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(l.letter,0,1);
      if(protectedPickup){ctx.beginPath();ctx.arc(0,0,r+6,-Math.PI/2,-Math.PI/2+TAU*Math.max(0,(l.priorityUntil-now)/2000));ctx.strokeStyle=color+'70';ctx.lineWidth=1;ctx.stroke();}
      ctx.restore();
    }
    for(const pulse of state.pulses){
      const s=this.project(wrap(pulse.x+pulse.vx*age,WORLD.width),wrap(pulse.y+pulse.vy*age,WORLD.height));if(!visible(s))continue;
      ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(pulse.vy,pulse.vx));ctx.strokeStyle=pulse.color;ctx.lineWidth=2;
      ctx.shadowBlur=this.reduced?0:8;ctx.shadowColor=pulse.color;ctx.beginPath();ctx.ellipse(0,0,8*this.scale,4*this.scale,0,0,TAU);ctx.stroke();ctx.restore();
    }
    for(const p of state.players){
      if(p.role!=='player')continue;
      const v=this.visual.get(p.id)||p,s=this.project(v.x,v.y);if(!visible(s))continue;
      const r=Math.max(11,16*this.scale);
      ctx.save();ctx.translate(s.x,s.y);
      if(p.resetUntil>now){
        ctx.strokeStyle=p.color+'80';ctx.lineWidth=1;
        for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,0,r*(1+i*.5),r*(.5+i*.25),0,0,TAU);ctx.stroke();}
        ctx.restore();continue;
      }
      if(p.shieldUntil>now||p.protectionUntil>now){
        ctx.strokeStyle=p.color+'b0';ctx.fillStyle=p.color+'10';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.arc(0,0,r+14+(this.reduced?0:Math.sin(time*.004)*2),0,TAU);ctx.fill();ctx.stroke();
      }
      ctx.save();ctx.rotate(v.angle);
      if(Math.hypot(p.vx,p.vy)>20){ctx.fillStyle=p.color+'55';ctx.beginPath();ctx.moveTo(-r*.7,-r*.3);ctx.lineTo(-r*(this.reduced?1.4:1.5+Math.sin(time*.03)*.25),0);ctx.lineTo(-r*.7,r*.3);ctx.fill();}
      ctx.fillStyle=p.color+'35';ctx.strokeStyle=p.color;ctx.lineWidth=1.7;
      ctx.beginPath();ctx.moveTo(r*1.15,0);ctx.lineTo(-r*.8,r*.75);ctx.lineTo(-r*.45,0);ctx.lineTo(-r*.8,-r*.75);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#eafffa';ctx.beginPath();ctx.arc(0,0,2.5,0,TAU);ctx.fill();ctx.restore();
      ctx.fillStyle=p.id===this.me?'#edfff9':'#bbcfdf';ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(p.name+(p.connected?'':' · away'),0,r+16);
      if(state.settings.disruption){for(let i=0;i<3;i++){ctx.fillStyle=i<p.stability?p.color:'#26374e';ctx.fillRect(-13+i*10,r+30,7,2);}}
      ctx.restore();
    }
    this.effects=this.effects.filter(e=>time-e.born<900);
    for(const e of this.effects){
      if(e.x===undefined)continue;
      const s=this.project(e.x,e.y),t=(time-e.born)/900;
      ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=e.color||'#a3ffe0';ctx.fillStyle=e.color||'#a3ffe0';
      if(e.type==='word'){
        ctx.font='700 14px system-ui';ctx.textAlign='center';ctx.fillText(e.word+' +'+e.points,s.x,s.y-35-(this.reduced?0:t*30));
      }else{
        ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(s.x,s.y,(this.reduced?20:8+t*48)*this.scale,0,TAU);ctx.stroke();
        if(!this.reduced&&e.type==='open')for(let i=0;i<5;i++){const a=i*TAU/5;ctx.fillRect(s.x+Math.cos(a)*t*38*this.scale,s.y+Math.sin(a)*t*38*this.scale,2,2);}
      }ctx.restore();
    }
    const vignette=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.2,w/2,h/2,Math.max(w,h)*.7);
    vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#050b20b0');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    this.drawMap();
  }
  drawMap(){
    const ctx=this.map.getContext('2d'),w=this.map.width,h=this.map.height;ctx.clearRect(0,0,w,h);
    ctx.strokeStyle='#2e486040';ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(w*i/4,0);ctx.lineTo(w*i/4,h);ctx.stroke();}
    ctx.fillStyle='#577485';for(const c of this.state.crystals)ctx.fillRect(c.x/WORLD.width*w,c.y/WORLD.height*h,2,2);
    for(const p of this.state.players){if(p.role!=='player'||p.resetUntil)continue;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x/WORLD.width*w,p.y/WORLD.height*h,p.id===this.me?3.5:2,0,TAU);ctx.fill();}
    const p=this.targetPlayer();if(p){ctx.strokeStyle=p.color+'60';ctx.beginPath();ctx.arc(p.x/WORLD.width*w,p.y/WORLD.height*h,8,0,TAU);ctx.stroke();}
  }
}
