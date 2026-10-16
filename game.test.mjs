import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/game.mjs';
import { WORLD, RULES, distance, scoreWord } from '../public/rules.js';
let tileSeq=0;
const tiles=word=>[...word].map(letter=>({id:'t'+ ++tileSeq,letter}));
function setup(mode='ffa',disruption=false){
  let seed=41;
  const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const room=new GameRoom('ABCDEF',{words:new Set(['CAT','STAR','PLANET','LETTER','DOG']),random,now:1000});
  const a=room.addPlayer('Alpha',1000),b=room.addPlayer('Beta',1001);
  room.configure(a.id,{mode,minutes:3,disruption});
  a.ready=b.ready=true;room.start(a.id,1000);room.tick(0,4000);
  for(const [i,p]of [a,b].entries()){p.protectionUntil=0;p.x=500+i*500;p.y=500;p.inputAt=7000;}
  room.crystals=[];
  return {room,a,b};
}
function letter(room,letter,x,y,ownerId=null,team=null,priorityUntil=0){
  const tile={id:room.id(),letter,x,y,ownerId,team,priorityUntil,expiresAt:50000};room.letters.push(tile);return tile;
}
function pulse(room,a,b,now=7000){
  room.pulses.push({id:room.id(),ownerId:a.id,team:a.team,color:a.color,x:b.x-20,y:b.y,vx:1000,vy:0,expiresAt:now+1000});
  room.tick(.03,now);
}
function submit(room,p,ids,now){room.wordMode(p.id,true,now);return room.submit(p.id,ids,now);}
test('valid words consume exactly the submitted tiles, preserve unused letters, and enforce per-player history',()=>{
  const {room,a,b}=setup();a.tray=tiles('CATS');const ids=a.tray.slice(0,3).map(t=>t.id);
  assert.equal(submit(room,a,ids,7000).points,5);assert.equal(a.tray.map(t=>t.letter).join(''),'S');
  a.tray=tiles('CAT');assert.throws(()=>submit(room,a,a.tray.map(t=>t.id),7100),/already scored/);
  b.tray=tiles('CAT');assert.equal(submit(room,b,b.tray.map(t=>t.id),7200).word,'CAT');
  assert.equal(a.score,5);assert.equal(b.score,5);assert.equal(scoreWord('PLANET'),26);
});
test('invalid words, fabricated tiles, and duplicate tile IDs never consume or score inventory',()=>{
  const {room,a}=setup();a.tray=tiles('QZXC');const original=structuredClone(a.tray);
  room.wordMode(a.id,true,7000);assert.throws(()=>room.submit(a.id,a.tray.slice(0,3).map(t=>t.id),7100),/dictionary/);
  assert.equal(a.shieldUntil,0);assert.equal(a.cooldownUntil,22100);
  assert.deepEqual(a.tray,original);assert.equal(a.score,0);
  assert.throws(()=>room.submit(a.id,['fake','tiles','here'],7200),/tray changed/);
  assert.throws(()=>room.submit(a.id,[a.tray[0].id,a.tray[0].id,a.tray[1].id],7200),/different tray/);
});
test('repeated letters require distinct inventory tiles',()=>{
  const {room,a}=setup();a.tray=tiles('LETTERA');
  submit(room,a,a.tray.slice(0,6).map(t=>t.id),7000);
  assert.equal(a.tray.map(t=>t.letter).join(''),'A');assert.equal(a.score,24);
});
test('word shields stop movement, pulsing, and collection and cannot be refreshed during cooldown',()=>{
  const {room,a}=setup();a.x=100;a.y=100;
  letter(room,'A',100,100);
  room.wordMode(a.id,true,7000);
  room.input(a.id,{seq:1,matchId:room.matchId,x:1,y:0,angle:0,pulse:true},7100);room.tick(.03,7100);
  assert.equal(a.x,100);assert.equal(a.tray.length,0);assert.equal(room.pulses.length,0);
  room.wordMode(a.id,false,7200);assert.equal(a.cooldownUntil,22200);
  room.wordMode(a.id,true,7300);assert.equal(a.shieldUntil,0);
  room.wordMode(a.id,false,7400);room.wordMode(a.id,true,22201);assert.equal(a.shieldUntil,30201);
  room.tick(.03,30202);assert.equal(a.shieldUntil,0);assert.equal(a.cooldownUntil,45201);
});
test('pickup priority expires and a full tray leaves letters available',()=>{
  const {room,a,b}=setup();a.x=600;a.y=600;b.x=100;b.y=100;
  const l=letter(room,'A',100,100,a.id,a.team,9000);
  room.tick(.01,7000);assert.equal(b.tray.length,0);assert.ok(room.letters.includes(l));
  room.tick(.01,9001);assert.equal(b.tray.length,1);
  b.tray=tiles('AAAAAAAAAA');letter(room,'E',100,100);
  room.tick(.01,9100);assert.equal(b.tray.length,10);assert.equal(room.letters.length,1);
});
test('teammates share priority but opponents do not',()=>{
  const {room,a,b}=setup('teams');b.team=a.team;b.x=100;b.y=100;a.x=500;
  letter(room,'E',100,100,a.id,a.team,9000);room.tick(.01,7000);assert.equal(b.tray.length,1);
});
test('two simultaneous pickups produce one owner and never duplicate a tile',()=>{
  const {room,a,b}=setup();a.x=b.x=100;a.y=b.y=100;letter(room,'A',100,100);
  room.tick(.01,7000);assert.equal(a.tray.length+b.tray.length,1);assert.equal(room.letters.length,0);
});
test('collection and pulse collision use shortest distances across the wrapped seam',()=>{
  const {room,a,b}=setup();a.x=2;a.y=100;b.x=1000;
  letter(room,'A',WORLD.width-3,100);room.tick(.01,7000);assert.equal(a.tray.length,1);
  assert.equal(distance({x:1,y:1},{x:WORLD.width-1,y:1}),2);
  room.crystals=[{id:'crystal',x:3,y:300,r:20,vx:0,vy:0,letter:'Z',rotation:0}];
  room.pulses=[{id:'pulse',ownerId:a.id,team:a.team,color:a.color,x:WORLD.width-30,y:300,vx:1000,vy:0,expiresAt:9000}];
  room.tick(.04,7100);assert.ok(room.letters.some(l=>l.letter==='Z'));assert.ok(!room.crystals.some(c=>c.id==='crystal'));
});
test('a reset drops at most three distinct letters, keeps score, and returns with protection',()=>{
  const {room,a}=setup();a.tray=tiles('PLANET');a.score=26;const ids=new Set(a.tray.map(t=>t.id));
  room.reset(a,7000);assert.equal(a.tray.length,3);assert.equal(room.letters.length,3);assert.equal(a.score,26);
  assert.equal(new Set([...a.tray,...room.letters].map(t=>t.id)).size,6);assert.ok(room.letters.every(l=>ids.has(l.id)&&l.priorityUntil===0));
  room.tick(.03,9999);assert.equal(a.resetUntil,10000);
  room.tick(.03,10000);assert.equal(a.resetUntil,0);assert.equal(a.protectionUntil,12000);assert.equal(a.stability,3);
  const short=tiles('AT');a.tray=short;room.reset(a,13000);assert.equal(a.tray.length,0);
});
test('disruption is optional, friendly fire is off, and protected ships ignore pulse contacts',()=>{
  const {room,a,b}=setup('teams',false);
  pulse(room,a,b);assert.equal(b.stability,3);
  room.settings.disruption=true;b.team=a.team;pulse(room,a,b,7100);assert.equal(b.stability,3);
  b.team=1-a.team;b.shieldUntil=9000;pulse(room,a,b,7200);assert.equal(b.stability,3);
  b.shieldUntil=0;
  pulse(room,a,b,7300);pulse(room,a,b,7500);pulse(room,a,b,7700);
  assert.equal(b.resetUntil,10700);assert.equal(a.score,0);assert.equal(b.score,0);
});
test('movement and action payloads cannot override server speed, tray, or timer',()=>{
  const {room,a}=setup();a.x=100;a.y=100;
  room.input(a.id,{seq:1,matchId:room.matchId,x:1e12,y:1e12,angle:NaN,pulse:true},7000);
  assert.equal(a.inputSeq,-1);
  room.input(a.id,{seq:2,matchId:room.matchId,x:1e12,y:1e12,angle:0,pulse:true},7000);
  assert.ok(Math.hypot(a.input.x,a.input.y)<=1);
  room.input(a.id,{seq:1,matchId:room.matchId,x:-1,y:0,angle:0,pulse:true},7001);
  assert.ok(a.input.x>0);
  room.tick(.1,7001);assert.ok(Math.hypot(a.vx,a.vy)<=RULES.speed);
});
test('the deadline is authoritative and tied scores share the win',()=>{
  const {room,a,b}=setup();a.tray=tiles('CAT');submit(room,a,a.tray.map(t=>t.id),room.endAt-1);
  b.tray=tiles('CAT');assert.throws(()=>room.submit(b.id,b.tray.map(t=>t.id),room.endAt),/not accepting/);
  b.score=5;room.tick(.03,room.endAt);assert.equal(room.phase,'results');assert.equal(room.results.winners.length,2);
});
test('late arrivals spectate, and equal teams and readiness are enforced in the lobby',()=>{
  const {room,a}=setup('teams');const watcher=room.addPlayer('Watcher',7000);assert.equal(watcher.role,'spectator');
  assert.throws(()=>room.wordMode(watcher.id,true,7100),/Spectators/);
  room.finish(room.endAt);room.lobby(a.id,room.endAt+1000);room.claimSeat(watcher.id);
  room.active().forEach(p=>p.ready=true);assert.throws(()=>room.start(a.id,200000),/equal/);
});
test('host migration and departure preserve earned team points',()=>{
  const {room,a,b}=setup('teams');a.score=100;room.disconnect(a.id,7000);room.tick(.03,17001);assert.equal(room.hostId,b.id);
  room.tick(.03,37001);assert.equal(a.role,'retired');assert.equal(room.active().length,1);
  room.finish(room.endAt);assert.equal(room.results.teams[a.team].score,100);
  room.lobby(b.id,room.endAt+100);assert.ok(!room.players.has(a.id));
});
test('public snapshots omit private trays, used-word sets, request history, and session credentials',()=>{
  const {room,a}=setup();a.tray=tiles('SECRET');const snapshot=room.publicState(7000),serialized=JSON.stringify(snapshot);
  assert.ok(!serialized.includes('"tray"'));assert.ok(!serialized.includes('"requests"'));assert.ok(!serialized.includes('"token"'));
  assert.equal(snapshot.players.find(p=>p.id===a.id).tileCount,6);assert.equal(room.privateState(a.id).tray.length,6);
});
test('submission requires word-building mode even when the client crafts a valid payload',()=>{
  const {room,a}=setup();a.tray=tiles('CAT');
  assert.throws(()=>room.submit(a.id,a.tray.map(t=>t.id),7000),/word-building/);
  assert.equal(a.score,0);assert.equal(a.tray.length,3);
});
