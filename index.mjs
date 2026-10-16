import express from 'express';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { GameRoom, GameError } from './game.mjs';
import { WORDS, cleanName } from './dictionary.mjs';
import { RULES } from '../public/rules.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function createGameServer({ words=WORDS, clock=Date.now, random=Math.random, testMode=false }={}) {
  const app=express(), http=createServer(app);
  const rooms=new Map(), sessions=new Map(), connectionRates=new Map(), createRates=new Map();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'");
    next();
  });
  app.get('/health',(_,res)=>res.json({status:'ok',version:'1.0.0',rooms:rooms.size}));
  app.get('/api/dictionary',(_,res)=>res.json({language:'English',minLength:3,maxLength:10,entries:words.size,
    policy:'Bundled word-list dictionary with an offensive-word filter. No live AI word judging. Proper names and abbreviations are not intended; dictionary coverage is imperfect.'}));
  app.use(express.static(path.join(root,'public'),{maxAge:'1h',setHeaders(res,p){if(p.endsWith('.html'))res.setHeader('Cache-Control','no-cache');}}));
  const io=new Server(http,{maxHttpBufferSize:8192,pingInterval:15000,pingTimeout:10000,
    // Same-origin browser deployment. Engine.IO handles the polling/WebSocket upgrade.
    allowRequest:(req,cb)=>{
      const origin=req.headers.origin;
      if (!origin) return cb(null,true);
      try { cb(null,new URL(origin).host===req.headers.host); } catch { cb(null,false); }
    }
  });
  const limited=(map,key,max,windowMs,now)=>{
    let record=map.get(key);
    if (!record || now-record.at>=windowMs) { record={at:now,n:0}; map.set(key,record); }
    record.n++; return record.n>max;
  };
  io.use((socket,next)=>{
    const ip=socket.handshake.address || 'unknown';
    if (!testMode && limited(connectionRates,ip,80,60000,clock())) return next(new Error('Too many connections. Please wait a minute.'));
    next();
  });
  function credentials(socket,room,p) {
    const token=randomBytes(32).toString('hex');
    sessions.set(token,{roomCode:room.code,playerId:p.id});
    socket.data={roomCode:room.code,playerId:p.id,token,rates:{input:[],action:[],join:[]}};
    p.socketId=socket.id;
    return {token,playerId:p.id,code:room.code,state:{...room.publicState(clock()),self:room.privateState(p.id)}};
  }
  function resolve(socket) {
    const room=rooms.get(socket.data.roomCode), p=room?.players.get(socket.data.playerId);
    if (!room || !p || p.socketId!==socket.id) throw new GameError('Your room is no longer available. Join again.');
    return {room,p};
  }
  function rate(socket,name,max,windowMs=1000) {
    socket.data.rates ||= {input:[],action:[],join:[]};
    const now=clock(), values=(socket.data.rates[name] || []).filter(t=>now-t<windowMs);
    if (values.length>=max) return false;
    values.push(now); socket.data.rates[name]=values; return true;
  }
  function replyError(ack,e) {
    if (!(e instanceof GameError)) console.error('Action error:',e.message);
    if (typeof ack==='function') ack({ok:false,error:e instanceof GameError ? e.message : 'Something went wrong. Please try again.'});
  }
  io.on('connection',socket=>{
    socket.data.rates={input:[],action:[],join:[]};
    socket.on('join',(data={},ack)=>{
      try {
        if (!rate(socket,'join',6,10000)) throw new GameError('Please wait before trying to join again.');
        if (socket.data.roomCode) throw new GameError('Leave your current room first.');
        let name;
        try { name=cleanName(data.name); } catch(e) { throw new GameError(e.message); }
        let room;
        if (data.create===true) {
          const ip=socket.handshake.address || 'unknown';
          if (rooms.size>=60 || (!testMode && limited(createRates,ip,6,60000,clock())))
            throw new GameError('Room creation is busy. Please try again shortly.');
          let code;
          do { code=[...randomBytes(6)].map(n=>alphabet[n%alphabet.length]).join(''); } while(rooms.has(code));
          room=new GameRoom(code,{words,random,now:clock()});
          rooms.set(code,room);
        } else {
          const code=String(data.code||'').trim().toUpperCase();
          if (!/^[A-Z2-9]{6}$/.test(code) || !rooms.has(code)) throw new GameError('Room not found. Check the 6-character code.');
          room=rooms.get(code);
        }
        const p=room.addPlayer(name,clock()), info=credentials(socket,room,p);
        if (typeof ack==='function') ack({ok:true,...info});
      } catch(e) { replyError(ack,e); }
    });
    socket.on('resume',(data={},ack)=>{
      try {
        if (!rate(socket,'join',6,10000)) throw new GameError('Please wait before reconnecting.');
        if (socket.data.roomCode) throw new GameError('Already connected to a room.');
        const session=typeof data.token==='string' && sessions.get(data.token);
        const room=session && rooms.get(session.roomCode), p=room?.players.get(session.playerId);
        if (!p || p.role==='retired' || (!p.connected && clock()-p.disconnectedAt>RULES.reconnectMs))
          throw new GameError('Your reserved seat expired. Join the room again to watch or play the next round.');
        if (p.connected) throw new GameError('This pilot is already connected on another screen.');
        sessions.delete(data.token);
        p.connected=true;p.disconnectedAt=null;p.inputSeq=-1;
        const info=credentials(socket,room,p);
        if (!room.hostId) room.hostId=p.id;
        if (typeof ack==='function') ack({ok:true,...info});
      } catch(e) { replyError(ack,e); }
    });
    socket.on('input',data=>{
      try { if (rate(socket,'input',60) && data && typeof data==='object') { const {room,p}=resolve(socket); room.input(p.id,data,clock()); } }
      catch { /* Ignore unauthenticated/stale volatile input. */ }
    });
    socket.on('action',(data={},ack)=>{
      try {
        if (!rate(socket,'action',20)) throw new GameError('Slow down for a moment.');
        const {room,p}=resolve(socket);
        if (!data || typeof data!=='object' || typeof data.requestId!=='string' || data.requestId.length>80)
          throw new GameError('Invalid action.');
        if (p.requests.has(data.requestId)) { if(typeof ack==='function')ack(p.requests.get(data.requestId)); return; }
        if (data.matchId!==room.matchId) throw new GameError('The round changed. Please try again.');
        const payload=data.payload || {};
        let value;
        try {
          switch(data.type) {
            case 'settings': room.configure(p.id,payload); break;
            case 'ready': room.needLobby(); if(p.role!=='player')throw new GameError('Claim a pilot seat first.'); p.ready=payload.ready===true; break;
            case 'team': room.team(p.id,payload.team); break;
            case 'claim': room.claimSeat(p.id); break;
            case 'start': room.start(p.id,clock()); break;
            case 'lobby': room.lobby(p.id,clock()); break;
            case 'wordMode': room.wordMode(p.id,payload.enter===true,clock()); break;
            case 'submit': value=room.submit(p.id,payload.tileIds,clock()); break;
            case 'discard': room.discard(p.id,payload.tileId,clock()); break;
            default: throw new GameError('Unknown action.');
          }
          const result={ok:true,value,self:room.privateState(p.id)};
          p.requests.set(data.requestId,result);
          if(p.requests.size>250)p.requests.delete(p.requests.keys().next().value);
          if(typeof ack==='function')ack(result);
        } catch(e) {
          if(e instanceof GameError)p.requests.set(data.requestId,{ok:false,error:e.message});
          if(p.requests.size>250)p.requests.delete(p.requests.keys().next().value);
          replyError(ack,e);
        }
      } catch(e) { replyError(ack,e); }
    });
    socket.on('leave',(_,ack)=>{
      try {
        const {room,p}=resolve(socket); room.remove(p.id,clock()); sessions.delete(socket.data.token);
        socket.data={rates:{input:[],action:[],join:[]}};
        if(typeof ack==='function')ack({ok:true});
      } catch(e) { replyError(ack,e); }
    });
    socket.on('disconnect',()=>{
      const room=rooms.get(socket.data.roomCode),p=room?.players.get(socket.data.playerId);
      if(p && p.socketId===socket.id) room.disconnect(p.id,clock());
    });
  });
  let last=clock(),snapshotAt=0,cleanAt=0;
  const tick=()=>{
    const now=clock(),dt=Math.min((now-last)/1000,.1);last=now;
    for(const room of rooms.values()) room.tick(dt,now);
    if(now-snapshotAt>=50) {
      snapshotAt=now;
      for(const room of rooms.values()) {
        const state=room.publicState(now);
        for(const p of room.players.values()) if(p.connected && p.socketId)
          io.to(p.socketId).volatile.emit('state',{...state,self:room.privateState(p.id)});
      }
    }
    if(now-cleanAt>=10000) {
      cleanAt=now;
      for(const [code,room] of rooms) if(![...room.players.values()].some(p=>p.connected) && now-room.lastActivity>60000) rooms.delete(code);
      for(const [token,s] of sessions) {
        const p=rooms.get(s.roomCode)?.players.get(s.playerId);
        if(!p || p.role==='retired')sessions.delete(token);
      }
      for(const map of [connectionRates,createRates])for(const [key,r]of map)if(now-r.at>120000)map.delete(key);
    }
  };
  const interval=setInterval(tick,1000/30);
  return {app,http,io,rooms,sessions,tick,
    listen:(port=0,host='127.0.0.1')=>new Promise(resolve=>http.listen(port,host,()=>resolve(http.address()))),
    close:()=>new Promise(resolve=>{clearInterval(interval);io.close(()=>resolve());})
  };
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createGameServer();
  const port=Number(process.env.PORT||3000);
  server.listen(port,'0.0.0.0').then(()=>console.log('Glyphstorm listening on port '+port+'; '+WORDS.size+' dictionary entries.'));
  const shutdown=()=>{
    server.io.emit('shutdown',{message:'The server is restarting. Please create a new room when it returns.'});
    server.close().then(()=>process.exit(0));
    setTimeout(()=>process.exit(0),5000).unref();
  };
  process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
