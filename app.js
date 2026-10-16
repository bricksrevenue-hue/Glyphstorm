import { Arena, SpaceBackdrop } from './arena.js';
import { VALUES, RULES, TEAMS, TEAM_COLORS, scoreWord } from './rules.js';
const $=id=>document.getElementById(id);
const show=(id,on)=>$(id).classList.toggle('hidden',!on);
const storage={get(key,local=false){try{return (local?localStorage:sessionStorage).getItem(key);}catch{return null;}},
  set(key,value,local=false){try{(local?localStorage:sessionStorage).setItem(key,value);}catch{}},
  remove(key){try{sessionStorage.removeItem(key);}catch{}}};
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
let state=null,me=null,token=storage.get('glyphstorm.session'),latestSeq=-1;
let movement={x:0,y:0,angle:0,pulse:false},keys=new Set(),inputSeq=0;
let touchMove={x:0,y:0};
let selected=[],discardMode=false,submitting=false,view='home',toastTimer;
let lobbySignature='',traySignature='',resultSignature='',followSignature='';
let lastEvents=0,matchSeen=null,offset=0,lastUI=0,audioContext=null;
let muted=storage.get('glyphstorm.sound',true)!=='on';
let reduced=storage.get('glyphstorm.motion',true)==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
const socket=window.io({autoConnect:false,reconnection:true,reconnectionDelay:500,reconnectionDelayMax:3000,timeout:10000});
const backdrop=new SpaceBackdrop($('space'));
const arena=new Arena($('arena'),$('minimap'),()=>movement);
function preferences(){
  document.body.classList.toggle('reduced',reduced);arena.reduced=reduced;backdrop.reduced=reduced;
  $('soundButton').querySelector('span').textContent=muted?'Off':'On';
  $('soundButton').setAttribute('aria-label',muted?'Enable sound':'Mute sound');
  $('motionButton').setAttribute('aria-label',reduced?'Enable full motion':'Enable reduced motion');
  $('motionButton').style.color=reduced?'var(--mint)':'';
}
preferences();
function sound(kind){
  if(muted)return;
  try{
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==='suspended')audioContext.resume();
    const tones=kind==='word'?[440,554,659]:kind==='pickup'?[680]:kind==='start'?[330,440,660]:[240];
    tones.forEach((f,i)=>{
      const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime+i*.08;
      osc.type='sine';osc.frequency.value=f;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.055,t+.015);
      gain.gain.exponentialRampToValueAtTime(.0001,t+.18);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+.2);
    });
  }catch{}
}
function toast(message){$('toast').textContent=message;show('toast',true);clearTimeout(toastTimer);toastTimer=setTimeout(()=>show('toast',false),4000);}
function connection(online,label){$('connection').classList.toggle('offline',!online);$('connection').lastChild.textContent=label;}
function setView(next){
  if(next===view)return;
  view=next;for(const id of ['home','lobby','game','results'])show(id,id===next);
  backdrop.active=next!=='game';document.body.classList.toggle('in-game',next==='game');
  if(next!=='game')resetControls();
  if(next==='lobby'){lobbySignature='';selected=[];}
  window.scrollTo(0,0);
}
function resetControls(){keys.clear();touchMove={x:0,y:0};movement.x=0;movement.y=0;movement.pulse=false;}
function current(){return state?.players.find(p=>p.id===me);}
function serverNow(){return Date.now()+offset;}
function updateState(next){
  if(next.matchId===state?.matchId && next.seq<latestSeq)return;
  latestSeq=next.seq;offset=next.now-Date.now();
  if(matchSeen!==next.matchId){matchSeen=next.matchId;selected=[];lastEvents=0;inputSeq=0;discardMode=false;resultSignature='';}
  state=next;
  selected=selected.filter(id=>state.self.tray.some(t=>t.id===id));
  for(const e of state.events){if(e.seq<=lastEvents)continue;lastEvents=e.seq;if(e.playerId===me&&['pickup','word','reset'].includes(e.type))sound(e.type);if(e.type==='start')sound('start');}
  arena.update(state,me);
  if(state.phase==='lobby'){setView('lobby');renderLobby();}
  else if(state.phase==='results'){setView('results');renderResults();}
  else{setView('game');renderGame();}
}
function acceptJoin(result){
  me=result.playerId;token=result.token;storage.set('glyphstorm.session',token);
  inputSeq=0;latestSeq=-1;selected=[];matchSeen=null;lastEvents=0;resetControls();
  updateState(result.state);
  const url=new URL(location.href);url.searchParams.set('room',result.code);history.replaceState(null,'',url);
  $('homeError').textContent='';show('connectionOverlay',false);
}
function emitAck(event,data,timeout=5000){
  return new Promise((resolve,reject)=>socket.timeout(timeout).emit(event,data,(error,result)=>{
    if(error)return reject(new Error('The connection is slow. Please try again.'));
    if(!result?.ok)return reject(new Error(result?.error||'Please try again.'));
    resolve(result);
  }));
}
async function join(create){
  if(!socket.connected){$('homeError').textContent='Connecting to the game server. Please try again in a moment.';return;}
  const name=$('pilotName').value.trim();if(name.length<2){$('homeError').textContent='Enter a pilot name with at least 2 characters.';$('pilotName').focus();return;}
  $('createButton').disabled=$('joinButton').disabled=true;$('homeError').textContent='';
  try{const result=await emitAck('join',{create,name,code:$('roomCode').value});storage.set('glyphstorm.name',name,true);acceptJoin(result);}
  catch(e){$('homeError').textContent=e.message;}
  finally{$('createButton').disabled=$('joinButton').disabled=false;}
}
async function action(type,payload={}){
  if(!state||!socket.connected)throw new Error('Reconnect before taking an action.');
  const request={requestId:crypto.randomUUID(),type,payload,matchId:state.matchId};
  let result;
  try{result=await emitAck('action',request,3500);}
  catch(e){
    if(!socket.connected || !e.message.startsWith('The connection is slow'))throw e;
    result=await emitAck('action',request,3500);
  }
  if(result.self && state?.matchId===request.matchId)state.self=result.self;
  return result;
}
const act=(type,payload)=>action(type,payload).catch(e=>toast(e.message));
socket.on('connect',async()=>{
  connection(true,'Online');$('createButton').disabled=$('joinButton').disabled=false;
  if(token){
    try{acceptJoin(await emitAck('resume',{token}));toast('Back in your orbit.');}
    catch(e){token=null;storage.remove('glyphstorm.session');state=null;me=null;setView('home');$('homeError').textContent=e.message;show('connectionOverlay',false);}
  }
});
socket.on('disconnect',()=>{
  connection(false,'Reconnecting');resetControls();
  if(state){show('connectionOverlay',true);toast('Connection lost. Trying to rejoin your room…');}
});
socket.on('connect_error',()=>{connection(false,'Offline');if(!state)$('homeError').textContent='The game server is not available yet. Waiting to reconnect…';});
socket.on('state',updateState);
socket.on('shutdown',data=>{toast(data.message);token=null;storage.remove('glyphstorm.session');});
socket.connect();
$('pilotName').value=storage.get('glyphstorm.name',true)||'';
$('roomCode').value=new URLSearchParams(location.search).get('room')?.slice(0,6)||'';
$('roomCode').addEventListener('input',()=>{$('roomCode').value=$('roomCode').value.toUpperCase().replace(/[^A-Z2-9]/g,'');});
$('createButton').onclick=()=>join(true);$('joinButton').onclick=()=>join(false);
$('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')join(false);});
$('pilotName').addEventListener('keydown',e=>{if(e.key==='Enter')join(Boolean(!$('roomCode').value));});
async function leave(){
  if(socket.connected)try{await emitAck('leave',{});}catch{}
  state=null;me=null;token=null;storage.remove('glyphstorm.session');selected=[];resetControls();setView('home');
  const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);$('homeError').textContent='';
}
document.querySelectorAll('.leave-button').forEach(button=>button.onclick=leave);
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copied. Send it to your crew.');}catch{toast('Copy this: '+text);}}
$('copyCode').onclick=()=>copy(state.code);
$('copyLink').onclick=()=>{const url=new URL(location.href);url.searchParams.set('room',state.code);copy(url.href);};
$('readyButton').onclick=()=>act('ready',{ready:!current()?.ready});
$('claimButton').onclick=()=>act('claim');
$('startButton').onclick=()=>act('start');
$('team0').onclick=()=>act('team',{team:0});$('team1').onclick=()=>act('team',{team:1});
$('rematchButton').onclick=()=>act('lobby');
for(const id of ['modeSelect','durationSelect','disruptionToggle'])$(id).onchange=()=>act('settings',{
  mode:$('modeSelect').value,minutes:Number($('durationSelect').value),disruption:$('disruptionToggle').checked
});
$('helpButton').onclick=()=>{resetControls();$('helpDialog').showModal();};
$('closeHelp').onclick=()=>$('helpDialog').close();
$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=$('helpDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('helpDialog').close();}});
$('soundButton').onclick=()=>{muted=!muted;storage.set('glyphstorm.sound',muted?'off':'on',true);preferences();sound('pickup');};
$('motionButton').onclick=()=>{reduced=!reduced;storage.set('glyphstorm.motion',reduced?'reduced':'full',true);preferences();};
function renderLobby(){
  const p=current(),active=state.players.filter(p=>p.role==='player'),host=state.hostId===me;
  const signature=JSON.stringify({host:state.hostId,settings:state.settings,players:state.players.map(p=>[p.id,p.name,p.role,p.team,p.connected,p.ready])});
  if(signature===lobbySignature)return;lobbySignature=signature;
  $('lobbyCode').textContent=state.code;$('playerCount').textContent=active.length+' / 8 PILOTS';
  $('roster').replaceChildren();
  for(const pilot of active){
    const row=node('div','pilot-row'),avatar=node('div','pilot-avatar',pilot.name.slice(0,1).toUpperCase());avatar.style.color=pilot.color;
    const info=node('div','pilot-info',pilot.name+(pilot.id===me?' (you)':''));
    const description=[pilot.id===state.hostId?'Host':'',state.settings.mode==='teams'?TEAMS[pilot.team]:'',!pilot.connected?'Reconnecting':''].filter(Boolean).join(' · ');
    info.append(node('small','',description||'Word pilot'));
    row.append(avatar,info,node('span',pilot.ready?'ready-tag':'waiting-tag',pilot.ready?'READY ✓':'WAITING'));$('roster').append(row);
  }
  if(active.length<2)$('roster').append(node('div','empty-seat','＋ Invite a friend to launch your first round'));
  const spectators=state.players.filter(p=>p.role==='spectator');
  $('spectatorList').textContent=spectators.length?'Watching: '+spectators.map(p=>p.name).join(', '):'';
  $('modeSelect').value=state.settings.mode;$('durationSelect').value=String(state.settings.minutes);$('disruptionToggle').checked=state.settings.disruption;
  for(const id of ['modeSelect','durationSelect','disruptionToggle'])$(id).disabled=!host;
  $('hostBadge').textContent=host?'YOUR CONTROLS':'HOST CONTROLS';
  show('readyButton',p?.role==='player');show('claimButton',p?.role==='spectator');show('startButton',host);
  $('readyButton').textContent=p?.ready?'Ready ✓ · click to undo':'Ready up ✓';
  show('teamActions',state.settings.mode==='teams'&&p?.role==='player');
  for(let i=0;i<2;i++)$('team'+i).style.borderColor=p?.team===i?TEAM_COLORS[i]:'';
  const balanced=state.settings.mode!=='teams'||active.filter(p=>p.team===0).length===active.filter(p=>p.team===1).length;
  const allReady=active.length>=2&&active.every(p=>p.ready&&p.connected)&&balanced;
  $('startButton').disabled=!allReady;
  $('claimButton').disabled=active.length>=8;
  $('lobbyHint').textContent=active.length<2?'Share the room code or invite link. You need at least two pilots.':
    !balanced?'Balance the two teams before launching.':allReady?(host?'Your crew is ready. Launch when you are.':'Your crew is ready. Waiting for the host to launch.'):'Every pilot needs to ready up.';
}
function renderScores(){
  const pilots=state.players.filter(p=>p.role==='player'||p.role==='retired').sort((a,b)=>b.score-a.score);
  const fragment=document.createDocumentFragment();
  if(state.settings.mode==='teams'){
    for(let i=0;i<2;i++){
      const total=pilots.filter(p=>p.team===i).reduce((n,p)=>n+p.score,0),row=node('div','team-total',TEAMS[i]+'  '+total+' pts');
      row.style.color=TEAM_COLORS[i];fragment.append(row);
    }
  }
  for(const p of pilots){const row=node('div','score-row'+(p.id===me?' me':''));row.style.borderLeftColor=p.color;
    row.append(node('span','',p.name+(p.connected?'':' · away')),node('b','',String(p.score)));fragment.append(row);}
  $('scoreboard').replaceChildren(fragment);
}
function renderGame(){
  const p=current(),spectating=p?.role!=='player';
  $('game').classList.toggle('is-spectator',spectating);
  show('spectatorBar',spectating);show('trayDock',!spectating);
  $('game').style.gridTemplateRows=spectating?'47px 1fr':'';
  $('gameMode').textContent=(state.settings.mode==='teams'?'TEAM ORBIT':'FREE-FOR-ALL')+(state.settings.disruption?' · DISRUPTION ON':'');
  $('gameRoom').textContent='ROOM '+state.code;
  renderScores();renderTray();
  const sig=state.players.filter(p=>p.role==='player').map(p=>p.id).join(',');
  if(sig!==followSignature){
    followSignature=sig;$('followSelect').replaceChildren();
    for(const pilot of state.players.filter(p=>p.role==='player')){const option=node('option','',pilot.name);option.value=pilot.id;$('followSelect').append(option);}
    if(!state.players.some(p=>p.id===arena.follow&&p.role==='player'))arena.follow=null;
  }
  arena.follow=spectating?($('followSelect').value||null):null;
  const building=Boolean(state.self.wordMode)&&!spectating&&state.phase==='playing'&&!p?.resetUntil;
  show('wordPanel',building);
  if(!building && selected.length){selected=[];renderTray();}
  $('buildButton').disabled=state.phase!=='playing'||Boolean(p?.resetUntil)||building;
  $('discardButton').disabled=state.phase!=='playing'||Boolean(p?.resetUntil);
  $('discardButton').textContent=discardMode?'Cancel discard':'Discard a letter';
  if(building)renderWord();
}
function renderTray(){
  const tray=state.self.tray,p=current();
  const sig=JSON.stringify([tray,selected,discardMode,state.self.wordMode]);
  if(sig===traySignature)return;traySignature=sig;
  $('trayCount').textContent=tray.length+' / 10';$('tray').replaceChildren();
  for(let i=0;i<10;i++){
    const tile=tray[i],button=node('button','tile'+(!tile?' empty':'')+(selected.includes(tile?.id)?' selected':'')+(discardMode&&tile?' discarding':''),tile?.letter||'·');
    button.disabled=!tile;button.setAttribute('aria-label',tile?tile.letter+', '+VALUES[tile.letter]+' points':'Empty letter slot');
    if(tile){button.append(node('small','',String(VALUES[tile.letter])));button.onclick=()=>selectTile(tile.id);}
    $('tray').append(button);
  }
  $('trayHint').textContent=discardMode?'Tap a letter to discard it. Discarded letters earn no points.':
    state.self.wordMode?'Tap letters in order. Tap a selected tile to remove it.':
    tray.length===10?'Tray full. Build a word or discard a letter before collecting more.':'Open crystals, then fly close to collect their letters.';
  if(p?.lastWord)$('lastWord').textContent=p.lastWord.word+' +'+p.lastWord.points;
}
async function selectTile(id){
  if(discardMode){
    try{await action('discard',{tileId:id});discardMode=false;selected=selected.filter(t=>t!==id);renderTray();}
    catch(e){toast(e.message);}return;
  }
  if(!state.self.wordMode){
    try{await action('wordMode',{enter:true});resetControls();$('wordError').textContent='';show('wordPanel',true);}
    catch(e){toast(e.message);return;}
  }
  if(selected.includes(id))selected=selected.filter(t=>t!==id);else selected.push(id);
  renderWord();renderTray();
}
async function build(){
  if(view!=='game'||state?.phase!=='playing'||current()?.role!=='player')return;
  try{await action('wordMode',{enter:true});selected=[];discardMode=false;resetControls();$('wordError').textContent='';show('wordPanel',true);renderWord();renderTray();}
  catch(e){toast(e.message);}
}
async function closeWord(){
  try{await action('wordMode',{enter:false});selected=[];show('wordPanel',false);renderTray();resetControls();}
  catch(e){toast(e.message);}
}
function renderWord(){
  const letters=selected.map(id=>state.self.tray.find(t=>t.id===id)?.letter||'').join('');
  $('wordLetters').replaceChildren();
  if(letters)$('wordLetters').textContent=letters;else $('wordLetters').append(node('span','placeholder','Your next great word starts here'));
  $('wordScore').textContent=letters.length>=3?scoreWord(letters)+' points if valid':letters.length+' / 3 letters minimum';
  $('submitButton').disabled=letters.length<3||submitting;
  $('submitButton').firstChild.textContent=submitting?'Checking…':'Submit word ';
}
$('buildButton').onclick=build;$('closeWord').onclick=closeWord;
$('discardButton').onclick=()=>{discardMode=!discardMode;renderTray();$('discardButton').textContent=discardMode?'Cancel discard':'Discard a letter';};
$('backspaceButton').onclick=()=>{selected.pop();renderWord();renderTray();};
$('clearWord').onclick=()=>{selected=[];renderWord();renderTray();};
async function submit(){
  if(submitting||selected.length<3)return;
  submitting=true;$('wordError').textContent='';renderWord();
  try{const result=await action('submit',{tileIds:[...selected]});selected=[];show('wordPanel',false);toast(result.value.word+' · +'+result.value.points+' points');renderTray();}
  catch(e){$('wordError').textContent=e.message;}
  finally{submitting=false;renderWord();}
}
$('submitButton').onclick=submit;
function renderResults(){
  const r=state.results;if(!r)return;
  const sig=state.matchId+state.hostId;
  if(sig===resultSignature)return;resultSignature=sig;
  const names=r.mode==='teams'?r.winners.map(t=>TEAMS[t]):r.winners.map(id=>r.ranking.find(p=>p.id===id)?.name||'Pilot');
  $('winnerTitle').textContent=names.length>1?'A shared constellation.':names[0]+' takes the orbit.';
  $('winnerSubtitle').textContent=names.length>1?names.join(' & ')+' tied for the win.':'Every word counted. Ready for another round?';
  $('resultsMode').textContent=(r.mode==='teams'?'TEAMS':'FREE-FOR-ALL')+' · '+state.settings.minutes+' MIN';
  $('resultsTable').replaceChildren();
  if(r.mode==='teams')for(const t of r.teams){const row=node('div','pilot-row');row.style.color=TEAM_COLORS[t.team];row.append(node('strong','pilot-info',TEAMS[t.team]),node('strong','',t.score+' pts'));$('resultsTable').append(row);}
  r.ranking.forEach((p,i)=>{
    const row=node('div','result-row'),name=node('div','',p.name+(p.id===me?' (you)':''));
    name.append(node('small','',p.words+' word'+(p.words===1?'':'s')));name.style.color=p.color;
    row.append(node('span','result-rank',String(i+1).padStart(2,'0')),name,node('span','result-best',p.best?'Best: '+p.best.word:'No word yet'),node('strong','result-score',String(p.score)));
    $('resultsTable').append(row);
  });
  const history=r.ranking.find(p=>p.id===me)?.history||[];
  $('resultWordCount').textContent=history.length+' WORDS';$('resultWords').replaceChildren();
  if(!history.length)$('resultWords').append(node('p','muted',current()?.role==='spectator'?'Claim a pilot seat in the next lobby to join the fun.':'A fresh tray and a new round are waiting.'));
  for(const entry of history){const chip=node('span','word-chip',entry.word);chip.append(node('b','', '+'+entry.points));$('resultWords').append(chip);}
  show('rematchButton',state.hostId===me);
  $('rematchHint').textContent=state.hostId===me?'Your crew stays in the same room.':'Waiting for the host to return to the lobby.';
}
window.addEventListener('keydown',e=>{
  if($('helpDialog').open)return;
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(view!=='game')return;
  if(state?.self.wordMode){
    if(e.key==='Escape'){e.preventDefault();closeWord();}
    else if(e.key==='Enter'){e.preventDefault();submit();}
    else if(e.key==='Backspace'){e.preventDefault();selected.pop();renderWord();renderTray();}
    else if(/^[a-z]$/i.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();const tile=state.self.tray.find(t=>t.letter===e.key.toUpperCase()&&!selected.includes(t.id));if(tile){selected.push(tile.id);renderWord();renderTray();}}
    return;
  }
  if(e.code==='Space'){e.preventDefault();if(!e.repeat)build();return;}
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);updateMovement();}
});
window.addEventListener('keyup',e=>{keys.delete(e.code);updateMovement();});
window.addEventListener('blur',resetControls);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetControls();});
function updateMovement(){
  if(document.hidden||state?.self.wordMode||$('helpDialog').open){movement.x=movement.y=0;movement.pulse=false;return;}
  const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touchMove.x;
  const y=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'))+touchMove.y;
  const length=Math.max(1,Math.hypot(x,y));movement.x=x/length;movement.y=y/length;
}
$('arena').addEventListener('pointermove',e=>{if(e.pointerType!=='touch')movement.angle=arena.aimAt(e.clientX,e.clientY);});
$('arena').addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||state?.self.wordMode)return;e.preventDefault();movement.angle=arena.aimAt(e.clientX,e.clientY);if(e.button===0)movement.pulse=true;});
window.addEventListener('pointerup',e=>{if(e.pointerType!=='touch')movement.pulse=false;});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
function stick(id,aim){
  const el=$(id),knob=el.querySelector('span');let pointer=null;
  const move=e=>{
    if(e.pointerId!==pointer)return;
    e.preventDefault();const r=el.getBoundingClientRect(),limit=r.width*.38;
    let x=(e.clientX-r.left-r.width/2)/limit,y=(e.clientY-r.top-r.height/2)/limit;
    const length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;knob.style.transform='translate('+x*limit+'px,'+y*limit+'px)';
    if(aim){if(Math.hypot(x,y)>.15){movement.angle=Math.atan2(y,x);movement.pulse=!state?.self.wordMode;}else movement.pulse=false;}
    else{touchMove={x,y};updateMovement();}
  };
  const end=e=>{if(e.pointerId!==pointer)return;pointer=null;knob.style.transform='';if(aim)movement.pulse=false;else{touchMove={x:0,y:0};updateMovement();}};
  el.addEventListener('pointerdown',e=>{if(pointer!==null)return;pointer=e.pointerId;el.setPointerCapture(pointer);move(e);});
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
}
stick('leftStick',false);stick('rightStick',true);
setInterval(()=>{
  if(!socket.connected||view!=='game'||state?.phase!=='playing'||current()?.role!=='player')return;
  updateMovement();
  socket.volatile.emit('input',{...movement,matchId:state.matchId,seq:++inputSeq});
},1000/30);
function timers(){
  if(!state||view!=='game')return;
  const now=serverNow(),p=current(),remaining=Math.max(0,Math.ceil((state.endAt-now)/1000));
  $('clock').textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
  $('clock').classList.toggle('urgent',remaining<=30);
  let overlay=false;
  if(state.phase==='countdown'){
    overlay=true;$('overlayLabel').textContent='FIND YOUR ORBIT';$('overlayValue').textContent=String(Math.max(1,Math.ceil((state.startAt-now)/1000)));$('overlayHint').textContent='Open crystals. Collect letters. Build words.';
  }else if(p?.resetUntil>now){
    overlay=true;$('overlayLabel').textContent='RECALIBRATING';$('overlayValue').textContent=String(Math.ceil((p.resetUntil-now)/1000));$('overlayHint').textContent='Your points are safe. Returning to orbit…';
  }
  show('phaseOverlay',overlay);
  if(!p)return;
  $('stability').textContent=state.settings.disruption?'◈'.repeat(Math.max(0,p.stability))+'◇'.repeat(Math.max(0,3-p.stability)):'';
  const shield=Math.max(0,Math.ceil((p.shieldUntil-now)/1000)),cooldown=Math.max(0,Math.ceil((state.self.cooldownUntil-now)/1000));
  $('shieldStatus').textContent=shield?'Word shield '+shield+'s':cooldown?'Shield ready in '+cooldown+'s':'Word shield ready';
  $('wordProtection').textContent=shield?'◈ Protected for '+shield+'s · ship stationary':'◇ Unprotected · '+(cooldown?'shield recharges in '+cooldown+'s':'close and reopen to activate your shield');
  $('wordProtection').style.color=shield?'var(--mint)':'#ffbe78';
}
function frame(time){
  backdrop.draw(time);
  if(view==='game')arena.draw(time);
  if(time-lastUI>100){timers();lastUI=time;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
