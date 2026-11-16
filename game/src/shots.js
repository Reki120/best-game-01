// Deterministic screenshot scenes: ?shot=title|play|levelup|victory|gameover
// with &seed=N. Each builds a seeded world, simulates a fixed number of
// steps with a scripted bot, and leaves the game ready to render one frame.
import { createWorld, startRun, stepWorld, chooseUpgrade } from './world.js';
import { makeRng } from './rng.js';

function botMove(w, t) {
  // Flee the nearest Shade, drift toward the nearest shard, else circle.
  const p = w.player;
  let threat = null, threatD = 200 * 200;
  for (const e of w.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < threatD) { threatD = d2; threat = e; }
  }
  if (threat) {
    const d = Math.sqrt(threatD) || 1;
    return { x: (p.x - threat.x) / d, y: (p.y - threat.y) / d };
  }
  let gem = null, gemD = 260 * 260;
  for (const g of w.gems) {
    const dx = g.x - p.x, dy = g.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < gemD) { gemD = d2; gem = g; }
  }
  if (gem) {
    const d = Math.sqrt(gemD) || 1;
    return { x: (gem.x - p.x) / d, y: (gem.y - p.y) / d };
  }
  const a = t * 0.55;
  return { x: Math.cos(a), y: Math.sin(a * 1.3) * 0.8 };
}

function simulate(w, seconds, moveFn) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (w.state !== 'playing') break;
    stepWorld(w, moveFn ? moveFn(w, w.time) : null);
  }
}

export function buildShotScene(scene, seed) {
  const rng = makeRng(seed || 7);
  const w = createWorld(rng, null);
  if (scene === 'title') {
    // Title over a quiet, decorative night: a few shades drifting.
    startRun(w);
    w.state = 'title';
    return w;
  }
  startRun(w);
  if (scene === 'play') {
    // Mid-game, busy: simulate in chunks, taking every level-up on the way.
    let simmed = 0;
    while (simmed < 100) {
      if (w.state === 'levelup') { chooseUpgrade(w, 0); continue; }
      if (w.state === 'gameover') { startRun(w); simmed = 0; continue; }
      if (w.state !== 'playing') break;
      stepWorld(w, botMove(w, w.time));
      simmed += 1 / 60;
    }
    return w;
  }
  if (scene === 'levelup') {
    // Farm XP until the first level-up screen appears.
    w.stats.xp = w.stats.xpNext - 1;
    simulate(w, 60, botMove);
    if (w.state !== 'levelup') {
      // Force it: heal up, grant the last shard directly.
      w.state = 'playing';
      w.player.hp = w.stats.maxHp;
      w.stats.xp = w.stats.xpNext;
      simulate(w, 2, botMove);
    }
    return w;
  }
  if (scene === 'victory') {
    // Play a real endgame: fight until the last seconds, then hold to dawn.
    let attempts = 0;
    while (attempts < 3) {
      let simmed = 0;
      while (w.time < 296 && simmed < 400) {
        if (w.state === 'levelup') { chooseUpgrade(w, 0); continue; }
        if (w.state !== 'playing') break;
        stepWorld(w, botMove(w, w.time));
        simmed += 1 / 60;
      }
      if (w.state === 'playing' && w.time >= 290) break;
      attempts++;
      startRun(w);
    }
    if (w.state === 'playing') simulate(w, 12, botMove);
    if (w.state !== 'victory') {
      // Fallback: jump the clock to dawn so the screen still renders.
      w.state = 'playing';
      w.player.hp = w.stats.maxHp;
      w.time = 299;
      simulate(w, 3, botMove);
    }
    return w;
  }
  if (scene === 'gameover') {
    w.player.hp = 1;
    simulate(w, 30, () => null);
    return w;
  }
  return w;
}
