export const WORLD = { width: 2400, height: 1600 };
export const RULES = Object.freeze({
  trayLimit: 10, minWord: 3, maxWord: 10, shieldMs: 8000, cooldownMs: 15000,
  resetMs: 3000, protectionMs: 2000, priorityMs: 2000, reconnectMs: 30000,
  speed: 245, acceleration: 11, pulseSpeed: 730, pulseInterval: 180,
  shipRadius: 17, stability: 3, maxPlayers: 8, maxSpectators: 8,
  letterLifeMs: 30000, maxLetters: 100, crystalCount: 44
});
export const VALUES = Object.fromEntries(
  [[1,'AEILNORSTU'],[2,'DG'],[3,'BCMP'],[4,'FHVWY'],[5,'K'],[8,'JX'],[10,'QZ']]
    .flatMap(([n, letters]) => [...letters].map(l => [l,n]))
);
export const COLORS = ['#70f7d1','#b5a0ff','#ffbe78','#ff8caf','#93c6ff','#e5ed80','#efb0ff','#a0e7f4'];
export const TEAMS = ['Aurora','Nebula'];
export const TEAM_COLORS = ['#70f7d1','#b5a0ff'];
export const wrap = (n, size) => ((n % size) + size) % size;
export const delta = (to, from, size) => wrap(to - from + size / 2, size) - size / 2;
export const distance = (a,b) => Math.hypot(delta(a.x,b.x,WORLD.width),delta(a.y,b.y,WORLD.height));
export const scoreWord = word => [...word.toUpperCase()].reduce((n,l) => n + (VALUES[l] || 0),0) + 2 * (word.length - 3) ** 2;
