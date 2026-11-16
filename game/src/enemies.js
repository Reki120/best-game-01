// Enemy types, the spawn director, and the boss.
// Types are plain data; the sim in world.js owns the enemy array.
export const ENEMY_TYPES = {
  shade:    { hp: 12, speed: 44, radius: 13, damage: 6,  xp: 1, color: '#8e6cc9', glow: '#b79df0', score: 10 },
  skitter:  { hp: 7,  speed: 92, radius: 10, damage: 4,  xp: 1, color: '#e05d8f', glow: '#ff9ec4', score: 15 },
  brute:    { hp: 52, speed: 29, radius: 22, damage: 12, xp: 3, color: '#5a3fa8', glow: '#9d7bea', score: 30 },
  spitter:  { hp: 16, speed: 37, radius: 12, damage: 5,  xp: 2, color: '#3fae8a', glow: '#7fe0c0', score: 25 },
  wraith:   { hp: 22, speed: 60, radius: 12, damage: 8,  xp: 2, color: '#c9d4ff', glow: '#ffffff', score: 25 },
  elite:    { hp: 130, speed: 38, radius: 26, damage: 16, xp: 8, color: '#ffd166', glow: '#ffe9a8', score: 100 },
  boss:     { hp: 800, speed: 33, radius: 44, damage: 20, xp: 25, color: '#ff5d73', glow: '#ffb3bd', score: 500 },
};

// Which types may appear at a given elapsed time (seconds), with weights.
export function spawnTable(elapsed) {
  const table = [['shade', 10]];
  if (elapsed > 25) table.push(['skitter', 6]);
  if (elapsed > 60) table.push(['wraith', 5]);
  if (elapsed > 90) table.push(['brute', 4]);
  if (elapsed > 120) table.push(['spitter', 5]);
  if (elapsed > 180) table.push(['elite', 1]);
  return table;
}

// Enemies alive cap and spawn interval shrink as the night deepens.
export function spawnInterval(elapsed) {
  return Math.max(0.55, 1.3 - elapsed * 0.0022);
}

export function maxAlive(elapsed) {
  return Math.min(80, 16 + Math.floor(elapsed / 9));
}

// HP multiplier so late waves stay threatening without one-shotting.
export function hpScale(elapsed) {
  return 1 + elapsed / 200;
}
