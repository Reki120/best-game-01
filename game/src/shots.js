// Deterministic screenshot scenes: ?shot=title|play|levelup|victory|gameover
// with &seed=N. Each builds a seeded world, simulates a fixed number of
// steps with a scripted bot, and leaves the game ready to render one frame.
import { createWorld, startRun, stepWorld, chooseUpgrade, spawnEnemyAt, ARENA_W, ARENA_H } from './world.js';
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

// Pick the strongest offer for a staged scene: damage first, then
// survivability. (A real player chooses; the scene bot just stages
// a busy, high-level frame.)
const SCENE_PICK = ['bolt', 'orbit', 'nova', 'chain', 'dawn', 'frost', 'boots', 'heart', 'magnet', 'thorns'];
function pickSceneOffer(w) {
  let best = 0, bestRank = 1e9;
  for (let i = 0; i < w.offers.length; i++) {
    const r = SCENE_PICK.indexOf(w.offers[i].id);
    if (r < bestRank) { bestRank = r; best = i; }
  }
  return best;
}

// Enemies inside the 1280×720 camera view, for the play shot.
function enemiesInView(w) {
  const p = w.player;
  const camX = Math.max(0, Math.min(ARENA_W - 1280, p.x - 1280 / 2));
  const camY = Math.max(0, Math.min(ARENA_H - 720, p.y - 720 / 2));
  let n = 0;
  for (const e of w.enemies) {
    if (e.hp > 0 && e.x > camX - 40 && e.x < camX + 1320 && e.y > camY - 40 && e.y < camY + 760) n++;
  }
  return n;
}

// Scene bot: flees only when something is right on top of Luma, else
// drifts toward shards or circles the arena centre — so the pack stays
// in frame for the play/victory shots. (The balance sim keeps the
// plain flee bot in sim.mjs as its difficulty benchmark.)
function sceneBotMove(w, t) {
  const p = w.player;
  let threat = null, threatD = 140 * 140;
  for (const e of w.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < threatD) { threatD = d2; threat = e; }
  }
  if (threat) {
    const d = Math.sqrt(threatD) || 1;
    return { x: (p.x - threat.x) / d, y: (p.y - threat.y) / d };
  }
  let gem = null, gemD = 300 * 300;
  for (const g of w.gems) {
    const dx = g.x - p.x, dy = g.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < gemD) { gemD = d2; gem = g; }
  }
  if (gem) {
    const d = Math.sqrt(gemD) || 1;
    return { x: (gem.x - p.x) / d, y: (gem.y - p.y) / d };
  }
  // Circle the arena centre on a ~420px ring. (Near the centre the
  // direction is undefined, so walk right until the ring is reached.)
  const cx = ARENA_W / 2 - p.x, cy = ARENA_H / 2 - p.y;
  const d = Math.hypot(cx, cy) || 1;
  if (d < 60) return { x: 1, y: 0 };
  const radial = (420 - d) / 420;
  const tx = (cx / d) * radial + (-cy / d) * 0.8;
  const ty = (cy / d) * radial + (cx / d) * 0.8;
  const len = Math.hypot(tx, ty) || 1;
  return { x: tx / len, y: ty / len };
}

// Hunt move: straight at the nearest enemy. Used only to stage the play
// shot — a few seconds of hunting pulls the pack into frame.
function huntMove(w) {
  const p = w.player;
  let near = null, nearD = Infinity;
  for (const e of w.enemies) {
    const d2 = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d2 < nearD) { nearD = d2; near = e; }
  }
  if (!near) return { x: 1, y: 0 };
  const d = Math.sqrt(nearD) || 1;
  return { x: (near.x - p.x) / d, y: (near.y - p.y) / d };
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
    // Title over a living night: stage eight shades closing in on Luma
    // by hand, so the sim never runs — the HUD stays a clean start
    // (100/100, Lv 1, 0 kills, 5:00) behind the cover text.
    startRun(w);
    const p = w.player;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.4;
      const d = 260 + (k % 3) * 120;
      spawnEnemyAt(w, 'shade', p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    }
    w.gems.push({ x: p.x - 180, y: p.y + 120, value: 1, t: 0 });
    w.gems.push({ x: p.x + 220, y: p.y - 90, value: 3, t: 1 });
    w.state = 'title';
    return w;
  }
  startRun(w);
  if (scene === 'play') {
    // Mid-game, busy: simulate in chunks, taking every level-up on the way.
    // The scene bot circles instead of fleeing, so the pack stays in frame.
    let simmed = 0;
    while (simmed < 100) {
      if (w.state === 'levelup') { chooseUpgrade(w, pickSceneOffer(w)); continue; }
      if (w.state === 'gameover') { startRun(w); simmed = 0; continue; }
      if (w.state !== 'playing') break;
      stepWorld(w, sceneBotMove(w, w.time));
      simmed += 1 / 60;
    }
    // Keep going until the camera actually has something to show:
    // hunt the pack until at least 10 enemies are in view AND Luma is
    // away from the edges (or 45 more seconds pass). Back off to
    // circling if health gets low or Luma gets pinned near an edge, so
    // the staging bot does not die (or end up half-clipped by the
    // screen edge) framing the shot.
    let extra = 0;
    while (w.state === 'playing' && extra < 45) {
      const p = w.player;
      const nearEdge = p.x < 220 || p.x > ARENA_W - 220 || p.y < 220 || p.y > ARENA_H - 220;
      if (enemiesInView(w) >= 10 && !nearEdge) break;
      const move = (w.player.hp < 30 || nearEdge) ? sceneBotMove(w, w.time) : huntMove(w);
      stepWorld(w, move);
      extra += 1 / 60;
      if (w.state === 'levelup') chooseUpgrade(w, pickSceneOffer(w));
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
        if (w.state === 'levelup') { chooseUpgrade(w, pickSceneOffer(w)); continue; }
        if (w.state !== 'playing') break;
        stepWorld(w, sceneBotMove(w, w.time));
        simmed += 1 / 60;
      }
      if (w.state === 'playing' && w.time >= 290) break;
      attempts++;
      startRun(w);
    }
    if (w.state === 'playing') simulate(w, 12, sceneBotMove);
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
    simulate(w, 90, () => null);
    if (w.state !== 'gameover') {
      // Staging fallback: the standing-still wisp sometimes outlasts
      // the clock on bolts alone — end it directly for the shot.
      w.player.hp = 0;
      w.state = 'gameover';
    }
    return w;
  }
  return w;
}
