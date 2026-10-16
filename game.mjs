import { randomUUID } from 'node:crypto';
import { WORLD, RULES, COLORS, TEAM_COLORS, wrap, delta, distance, scoreWord } from '../public/rules.js';

export class GameError extends Error {}
const fail = message => { throw new GameError(message); };
const bag = 'AAAAAAAAAEEEEEEEEEEEEIIIIIIIIIOOOOOOOOUUUURRRRRRSSSSSSTTTTTTLLLLNNNNDDDDGGGBBCCMMPPFFHHVVWWYYKJXQZ';
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

export class GameRoom {
  constructor(code, { words = new Set(), random = Math.random, now = Date.now() } = {}) {
    this.code = code;
    this.words = words;
    this.random = random;
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.settings = { mode:'ffa', minutes:5, disruption:false };
    this.matchId = randomUUID();
    this.startAt = 0;
    this.endAt = 0;
    this.lastActivity = now;
    this.crystals = [];
    this.letters = [];
    this.pulses = [];
    this.events = [];
    this.eventSeq = 0;
    this.entitySeq = 0;
    this.snapshotSeq = 0;
    this.results = null;
  }
  active() { return [...this.players.values()].filter(p => p.role === 'player'); }
  id() { return String(++this.entitySeq); }
  randomLetter() { return bag[Math.floor(this.random() * bag.length)]; }
  event(type, details = {}) {
    this.events.push({ seq:++this.eventSeq, type, ...details });
    this.events = this.events.slice(-32);
  }
  color(p) { return this.settings.mode === 'teams' ? TEAM_COLORS[p.team] : p.color; }
  addPlayer(name, now) {
    if ([...this.players.values()].some(p => p.name.toLowerCase() === name.toLowerCase()))
      fail('That pilot name is taken in this room.');
    const role = this.phase === 'lobby' && this.active().length < RULES.maxPlayers ? 'player' : 'spectator';
    if (role === 'spectator' && [...this.players.values()].filter(p => p.role === 'spectator').length >= RULES.maxSpectators)
      fail('This room is full, including spectator seats.');
    const teamCounts = [0,0];
    this.active().forEach(p => teamCounts[p.team]++);
    const p = {
      id:randomUUID(), name, role, team:teamCounts[0] <= teamCounts[1] ? 0 : 1,
      color:COLORS[this.active().length % COLORS.length], joinedAt:now, connected:true,
      disconnectedAt:null, socketId:null, ready:false, x:0, y:0, vx:0, vy:0, angle:0,
      score:0, tray:[], history:[], used:new Set(), stability:RULES.stability,
      shieldUntil:0, cooldownUntil:0, resetUntil:0, protectionUntil:0, lastHitAt:0,
      regenAt:0, lastPulseAt:0, wordMode:false, lastDiscardAt:0,
      input:{ x:0,y:0,angle:0,pulse:false }, inputAt:now, inputSeq:-1, requests:new Map()
    };
    this.players.set(p.id,p);
    if (!this.hostId) this.hostId = p.id;
    this.position(p);
    this.lastActivity = now;
    return p;
  }
  position(p) {
    let spot = {x:WORLD.width/2,y:WORLD.height/2};
    for (let i = 0; i < 40; i++) {
      spot = {x:80 + this.random() * (WORLD.width-160), y:80 + this.random() * (WORLD.height-160)};
      if (this.active().every(other => other.id === p.id || distance(spot,other) > 140) &&
          this.crystals.every(c => distance(spot,c) > c.r + 50)) break;
    }
    p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0;
  }
  needHost(id) { if (id !== this.hostId) fail('Only the host can change this.'); }
  needLobby() { if (this.phase !== 'lobby') fail('This action is available in the lobby.'); }
  player(id) { const p = this.players.get(id); if (!p) fail('Your seat is no longer in this room.'); return p; }
  needPlaying(p, now) {
    if (this.phase !== 'playing' || now >= this.endAt) fail('The round is not accepting actions.');
    if (p.role !== 'player') fail('Spectators can watch but cannot play this round.');
    if (p.resetUntil > now) fail('Your ship is resetting.');
  }
  disconnect(id, now) {
    const p = this.players.get(id); if (!p) return;
    this.lastActivity = now;
    p.connected = false; p.disconnectedAt = now; p.socketId = null;
    p.input = {x:0,y:0,angle:p.angle,pulse:false};
    p.ready = false;
  }
  remove(id, now) {
    const p=this.players.get(id);
    // Preserve points already earned by a departing pilot for final standings.
    if(p && p.role==='player' && ['playing','countdown','results'].includes(this.phase)){
      p.role='retired';p.connected=false;p.socketId=null;p.disconnectedAt=null;p.ready=false;
    }else this.players.delete(id);
    this.lastActivity = now;
    if (this.hostId === id) this.transferHost();
  }
  transferHost() {
    const connected = [...this.players.values()].filter(p => p.connected).sort((a,b) =>
      Number(a.role === 'spectator') - Number(b.role === 'spectator') || a.joinedAt-b.joinedAt);
    this.hostId = connected[0]?.id ?? null;
  }
  configure(id, settings) {
    this.needHost(id); this.needLobby();
    if (!['ffa','teams'].includes(settings.mode) || ![3,5,7].includes(settings.minutes) || typeof settings.disruption !== 'boolean')
      fail('Choose one of the available room settings.');
    const changedMode = settings.mode !== this.settings.mode;
    this.settings = {mode:settings.mode, minutes:settings.minutes, disruption:settings.disruption};
    this.active().forEach((p,i) => { p.ready = false; if (changedMode) p.team = i%2; });
  }
  team(id, team) {
    this.needLobby();
    const p = this.player(id);
    if (p.role !== 'player' || ![0,1].includes(team)) fail('Choose Aurora or Nebula.');
    p.team = team; p.ready = false;
  }
  claimSeat(id) {
    this.needLobby();
    const p = this.player(id);
    if (p.role === 'player') return;
    if (this.active().length >= 8) fail('All 8 pilot seats are occupied.');
    const counts = [0,0]; this.active().forEach(other => counts[other.team]++);
    p.role = 'player'; p.team = counts[0] <= counts[1] ? 0 : 1;
    const usedColors = new Set(this.active().filter(other=>other.id!==id).map(other=>other.color));
    p.color = COLORS.find(c=>!usedColors.has(c)) || COLORS[0];
    p.ready = false;
  }
  start(id, now) {
    this.needHost(id); this.needLobby();
    const players = this.active();
    if (players.length < 2) fail('At least 2 pilots are needed.');
    if (!players.every(p => p.connected && p.ready)) fail('Every pilot must be connected and ready.');
    if (this.settings.mode === 'teams' && players.filter(p=>p.team===0).length !== players.filter(p=>p.team===1).length)
      fail('Teams must be equal. Switch a team or choose free-for-all.');
    this.matchId = randomUUID();
    this.phase = 'countdown'; this.startAt = now+3000;
    this.endAt = this.startAt+this.settings.minutes*60000;
    this.results = null; this.events = []; this.crystals = []; this.letters = []; this.pulses = [];
    for (const p of this.players.values()) {
      p.score=0; p.tray=[]; p.history=[]; p.used.clear(); p.requests.clear();
      p.stability=3; p.resetUntil=0; p.shieldUntil=0; p.cooldownUntil=0; p.wordMode=false;
      p.protectionUntil=this.startAt+2000; p.regenAt=this.startAt+4000; p.lastPulseAt=0;
      p.input={x:0,y:0,angle:p.angle,pulse:false}; p.inputSeq=-1; this.position(p);
    }
    while (this.crystals.length<RULES.crystalCount) this.spawnCrystal();
  }
  lobby(id, now) {
    this.needHost(id);
    if (this.phase !== 'results') fail('Finish the current round first.');
    this.phase='lobby'; this.results=null; this.pulses=[]; this.letters=[]; this.crystals=[];
    this.lastActivity=now;
    for(const p of this.players.values())if(p.role==='retired')this.players.delete(p.id);
    for (const p of this.players.values()) {
      p.ready=false; p.wordMode=false; p.shieldUntil=0; p.score=0; p.tray=[]; p.history=[]; p.used.clear();
    }
  }
  spawnCrystal() {
    let c;
    for (let i=0; i<25; i++) {
      c={id:this.id(),x:this.random()*WORLD.width,y:this.random()*WORLD.height,r:24+this.random()*10,
        vx:(this.random()-.5)*24,vy:(this.random()-.5)*24,letter:this.randomLetter(),rotation:this.random()*6.28};
      if (this.active().every(p=>distance(p,c)>100) && this.crystals.every(other=>distance(c,other)>90)) break;
    }
    this.crystals.push(c);
  }
  input(id, data, now) {
    const p=this.player(id);
    if (this.phase!=='playing' || p.role!=='player' || now>=this.endAt) return;
    if (data.matchId!==this.matchId || !Number.isSafeInteger(data.seq) || data.seq<=p.inputSeq) return;
    if (![data.x,data.y,data.angle].every(Number.isFinite)) return;
    p.inputSeq=data.seq;
    const x=clamp(data.x,-1,1), y=clamp(data.y,-1,1), length=Math.max(1,Math.hypot(x,y));
    p.input={x:x/length,y:y/length,angle:wrap(data.angle,Math.PI*2),pulse:data.pulse===true};
    p.inputAt=now;
  }
  endShield(p, now) {
    if (p.shieldUntil) {
      p.cooldownUntil=Math.min(now,p.shieldUntil)+RULES.cooldownMs;
      p.shieldUntil=0;
    }
  }
  wordMode(id, enter, now) {
    const p=this.player(id); this.needPlaying(p,now);
    if (!enter) { this.endShield(p,now); p.wordMode=false; return; }
    if (p.wordMode) return;
    p.wordMode=true; p.vx=0; p.vy=0; p.input.pulse=false;
    if (now>=p.cooldownUntil) p.shieldUntil=now+RULES.shieldMs;
  }
  submit(id, tileIds, now) {
    const p=this.player(id); this.needPlaying(p,now);
    if(!p.wordMode)fail('Enter word-building mode first.');
    this.endShield(p,now);
    if (!Array.isArray(tileIds) || tileIds.length<3 || tileIds.length>10 || new Set(tileIds).size!==tileIds.length)
      fail('Build a word using 3–10 different tray tiles.');
    const tiles=tileIds.map(id=>p.tray.find(t=>t.id===id));
    if (tiles.some(t=>!t)) fail('Your tray changed. Select the letters again.');
    const word=tiles.map(t=>t.letter).join('');
    if (!this.words.has(word)) fail('That word is not in the game dictionary.');
    if (p.used.has(word)) fail('You already scored '+word+' this round.');
    const points=scoreWord(word);
    p.tray=p.tray.filter(t=>!tileIds.includes(t.id));
    p.score+=points; p.used.add(word); p.wordMode=false;
    const entry={word,points,at:now};
    p.history.push(entry);
    this.event('word',{playerId:p.id,name:p.name,word,points,x:p.x,y:p.y});
    return entry;
  }
  discard(id, tileId, now) {
    const p=this.player(id); this.needPlaying(p,now);
    if (now-p.lastDiscardAt<1000) fail('Wait a moment before discarding another tile.');
    if (!p.tray.some(t=>t.id===tileId)) fail('That letter is no longer in your tray.');
    p.tray=p.tray.filter(t=>t.id!==tileId); p.lastDiscardAt=now;
  }
  reset(p, now) {
    const dropped=[];
    while (dropped.length<3 && p.tray.length) {
      const index=Math.floor(this.random()*p.tray.length);
      const [tile]=p.tray.splice(index,1), angle=this.random()*Math.PI*2;
      const letter={...tile,x:wrap(p.x+Math.cos(angle)*32,WORLD.width),y:wrap(p.y+Math.sin(angle)*32,WORLD.height),
        ownerId:null,team:null,priorityUntil:0,expiresAt:now+RULES.letterLifeMs};
      this.letters.push(letter); dropped.push(tile.letter);
    }
    this.letters=this.letters.slice(-RULES.maxLetters);
    this.endShield(p,now); p.wordMode=false; p.resetUntil=now+RULES.resetMs;
    p.vx=0; p.vy=0; p.input.pulse=false;
    this.event('reset',{playerId:p.id,x:p.x,y:p.y,dropped:dropped.length});
  }
  // Segment-circle intersection in wrapped coordinates avoids tunneling at arena seams.
  touches(pulse, target, radius, dt) {
    const x=delta(target.x,pulse.oldX,WORLD.width), y=delta(target.y,pulse.oldY,WORLD.height);
    const dx=pulse.vx*dt,dy=pulse.vy*dt;
    const t=clamp((x*dx+y*dy)/(dx*dx+dy*dy||1),0,1);
    return Math.hypot(x-dx*t,y-dy*t)<radius;
  }
  finish(now) {
    if (this.phase==='results') return;
    const ranking=[...this.players.values()].filter(p=>p.role==='player'||p.role==='retired').map(p=>({id:p.id,name:p.name,team:p.team,color:this.color(p),score:p.score,
      words:p.history.length,best:[...p.history].sort((a,b)=>b.points-a.points)[0]||null,history:p.history}))
      .sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
    const teams=[0,1].map(team=>({team,score:ranking.filter(p=>p.team===team).reduce((n,p)=>n+p.score,0)}));
    const best=this.settings.mode==='teams' ? Math.max(...teams.map(t=>t.score)) : ranking[0]?.score ?? 0;
    const winners=this.settings.mode==='teams' ? teams.filter(t=>t.score===best).map(t=>t.team) : ranking.filter(p=>p.score===best).map(p=>p.id);
    this.results={ranking,teams,winners,mode:this.settings.mode,endedAt:Math.min(now,this.endAt)};
    this.phase='results'; this.pulses=[];
    for (const p of this.players.values()) { this.endShield(p,now); p.wordMode=false; p.vx=0;p.vy=0; }
    this.event('finish');
  }
  tick(dt, now) {
    for (const p of this.players.values()) {
      if (!p.connected && p.disconnectedAt!==null && now-p.disconnectedAt>RULES.reconnectMs) this.remove(p.id,now);
    }
    const host=this.players.get(this.hostId);
    if (!host || (!host.connected && now-host.disconnectedAt>=10000)) this.transferHost();
    if (this.phase==='countdown' && now>=this.startAt) { this.phase='playing'; this.event('start'); }
    if (this.phase!=='playing') return;
    if (now>=this.endAt) { this.finish(now); return; }
    for (const p of this.active()) {
      if (p.shieldUntil && now>=p.shieldUntil) this.endShield(p,now);
      if (p.resetUntil) {
        if (now<p.resetUntil) continue;
        p.resetUntil=0; p.stability=3; p.regenAt=now+4000; p.protectionUntil=now+RULES.protectionMs;
        this.position(p); this.event('return',{playerId:p.id,x:p.x,y:p.y});
      }
      if (now-p.inputAt>350 || !p.connected) p.input={x:0,y:0,angle:p.angle,pulse:false};
      p.angle=p.input.angle;
      if (!p.wordMode) {
        const blend=1-Math.exp(-RULES.acceleration*dt);
        p.vx+=(p.input.x*RULES.speed-p.vx)*blend; p.vy+=(p.input.y*RULES.speed-p.vy)*blend;
        p.x=wrap(p.x+p.vx*dt,WORLD.width); p.y=wrap(p.y+p.vy*dt,WORLD.height);
      } else { p.vx=0; p.vy=0; }
      if (p.stability<3 && now>=p.regenAt) { p.stability++; p.regenAt=now+4000; }
      if (p.input.pulse && !p.wordMode && now>=p.protectionUntil && now-p.lastPulseAt>=RULES.pulseInterval && this.pulses.length<180) {
        p.lastPulseAt=now;
        this.pulses.push({id:this.id(),ownerId:p.id,team:p.team,color:this.color(p),
          x:wrap(p.x+Math.cos(p.angle)*22,WORLD.width),y:wrap(p.y+Math.sin(p.angle)*22,WORLD.height),
          vx:Math.cos(p.angle)*RULES.pulseSpeed,vy:Math.sin(p.angle)*RULES.pulseSpeed,expiresAt:now+1250});
      }
    }
    for (const c of this.crystals) {
      c.x=wrap(c.x+c.vx*dt,WORLD.width); c.y=wrap(c.y+c.vy*dt,WORLD.height);
      for (const p of this.active()) {
        if (p.resetUntil || p.wordMode) continue;
        const d=distance(p,c), min=c.r+RULES.shipRadius;
        if (d<min) {
          const a=Math.atan2(delta(p.y,c.y,WORLD.height),delta(p.x,c.x,WORLD.width));
          p.x=wrap(c.x+Math.cos(a)*(min+1),WORLD.width); p.y=wrap(c.y+Math.sin(a)*(min+1),WORLD.height);
        }
      }
    }
    for (const pulse of this.pulses) {
      if(pulse.expiresAt<=now)continue;
      pulse.oldX=pulse.x; pulse.oldY=pulse.y;
      pulse.x=wrap(pulse.x+pulse.vx*dt,WORLD.width); pulse.y=wrap(pulse.y+pulse.vy*dt,WORLD.height);
      const crystal=this.crystals.find(c=>!c.opened && this.touches(pulse,c,c.r+4,dt));
      if (crystal) {
        crystal.opened=true; pulse.expiresAt=0;
        this.letters.push({id:this.id(),letter:crystal.letter,x:crystal.x,y:crystal.y,ownerId:pulse.ownerId,team:pulse.team,
          priorityUntil:now+RULES.priorityMs,expiresAt:now+RULES.letterLifeMs});
        this.event('open',{x:crystal.x,y:crystal.y,color:pulse.color});
        continue;
      }
      if (this.settings.disruption) {
        const hit=this.active().find(p=>p.id!==pulse.ownerId && !p.resetUntil &&
          !(this.settings.mode==='teams' && p.team===pulse.team) && this.touches(pulse,p,RULES.shipRadius+5,dt));
        if (hit) {
          pulse.expiresAt=0;
          this.event('ripple',{playerId:hit.id,x:hit.x,y:hit.y,color:this.color(hit)});
          if (hit.shieldUntil>now || hit.protectionUntil>now) continue;
          hit.stability--; hit.lastHitAt=now; hit.regenAt=now+4000;
          if (hit.stability<=0) this.reset(hit,now);
        }
      }
    }
    this.pulses=this.pulses.filter(p=>p.expiresAt>now);
    this.crystals=this.crystals.filter(c=>!c.opened);
    while (this.crystals.length<RULES.crystalCount) this.spawnCrystal();
    this.letters=this.letters.filter(l=>l.expiresAt>now).slice(-RULES.maxLetters);
    // Resolve contested pickups by distance, then stable player ID. Each tile is processed once.
    this.letters=this.letters.filter(letter=>{
      const eligible=this.active().filter(p=>p.tray.length<10 && !p.resetUntil && p.shieldUntil<=now && p.protectionUntil<=now &&
        (letter.priorityUntil<=now || p.id===letter.ownerId || (this.settings.mode==='teams' && p.team===letter.team)) && distance(p,letter)<34)
        .sort((a,b)=>distance(a,letter)-distance(b,letter)||a.id.localeCompare(b.id));
      const p=eligible[0]; if (!p) return true;
      p.tray.push({id:letter.id,letter:letter.letter});
      this.event('pickup',{playerId:p.id,letter:letter.letter,x:letter.x,y:letter.y});
      return false;
    });
  }
  publicState(now) {
    return {
      code:this.code,phase:this.phase,hostId:this.hostId,settings:this.settings,matchId:this.matchId,
      now,startAt:this.startAt,endAt:this.endAt,seq:++this.snapshotSeq,world:WORLD,results:this.results,
      players:[...this.players.values()].map(p=>({
        id:p.id,name:p.name,role:p.role,team:p.team,color:this.color(p),connected:p.connected,ready:p.ready,
        x:p.x,y:p.y,vx:p.vx,vy:p.vy,angle:p.angle,score:p.score,tileCount:p.tray.length,wordCount:p.history.length,
        stability:p.stability,shieldUntil:p.shieldUntil,resetUntil:p.resetUntil,protectionUntil:p.protectionUntil,
        wordMode:p.wordMode,lastWord:p.history.at(-1)||null
      })),
      crystals:this.crystals.map(({id,x,y,r,letter,rotation})=>({id,x,y,r,letter,rotation})),
      letters:this.letters,pulses:this.pulses.map(({id,x,y,vx,vy,color})=>({id,x,y,vx,vy,color})),events:this.events
    };
  }
  privateState(id) {
    const p=this.player(id);
    return {id:p.id,tray:p.tray,history:p.history,cooldownUntil:p.cooldownUntil,wordMode:p.wordMode};
  }
}
