// LUMENFALL bootstrap: fixed 60 Hz sim, render loop, state machine,
// screenshot mode (?shot=…&seed=…), best-score persistence.
import { createWorld, startRun, stepWorld, chooseUpgrade } from './world.js';
import { drawWorld, drawTitle, drawLevelUp, drawEnd, drawPaused } from './render.js';
import { initInput, moveVector, consumeClick, consumeAnyKey, isDown } from './input.js';
import { sfx, unlockAudio } from './audio.js';
import { buildShotScene } from './shots.js';
import { makeRng } from './rng.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const shotScene = params.get('shot');
const shotSeed = Number(params.get('seed') || 7);

const BEST_KEY = 'lumenfall-best-score';
let best = 0;
try { best = Number(window.localStorage.getItem(BEST_KEY) || 0) || 0; } catch { best = 0; }
function saveBest(score) {
  if (score > best) {
    best = score;
    try { window.localStorage.setItem(BEST_KEY, String(best)); } catch { /* private mode */ }
  }
}

// Read-only handle for automated play-testing (no setters, no cheats).
window.__lumenfall = {
  get state() { return world.state; },
  get time() { return world.time; },
  get kills() { return world.kills; },
  get level() { return world.stats.level; },
  get hp() { return world.player.hp; },
};

initInput(canvas);

let world;
let shotMode = false;
if (shotScene) {
  shotMode = true;
  world = buildShotScene(shotScene, shotSeed);
  // Render one deterministic frame, then signal readiness.
  renderFrame(performance.now() / 1000);
  window.__shotReady = true;
} else {
  const rng = makeRng((Math.random() * 0xffffffff) >>> 0);
  world = createWorld(rng, sfx);
  world.state = 'title';
  requestAnimationFrame(loop);
}

let last = performance.now();
let acc = 0;
const STEP = 1000 / 60;
let viewT = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    tick();
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  viewT = now / 1000;
  renderFrame(viewT);
}

function tick() {
  const st = world.state;
  if (st === 'title') {
    unlockAudio();
    const click = consumeClick();
    if (click || consumeAnyKey()) {
      sfx.click();
      startRun(world);
    }
    return;
  }
  if (st === 'playing') {
    // P / Esc pauses on the key-down edge only: without the latch the
    // same press pauses and instantly resumes on the next tick.
    const pauseDown = isDown('KeyP') || isDown('Escape');
    if (pauseDown && !tick.pauseLatch) {
      tick.pauseLatch = true;
      consumeAnyKey(); // the pause press itself must not resume
      world.prevState = 'playing';
      world.state = 'paused';
      return;
    }
    if (!pauseDown) tick.pauseLatch = false;
    if (isDown('KeyM')) {
      // Mute toggles once per press: track via a short debounce.
      if (!tick.muteLatch) { tick.muteLatch = true; sfx.toggleMute(); }
    } else {
      tick.muteLatch = false;
    }
    stepWorld(world, moveVector());
    if (world.state === 'victory' || world.state === 'gameover') {
      saveBest(world.score);
    }
    return;
  }
  if (st === 'levelup') {
    const click = consumeClick();
    if (click) {
      const idx = cardIndexAt(click.x, click.y);
      if (idx >= 0) chooseUpgrade(world, idx);
      return;
    }
    if (isDown('Digit1')) chooseUpgrade(world, 0);
    else if (isDown('Digit2')) chooseUpgrade(world, 1);
    else if (isDown('Digit3')) chooseUpgrade(world, 2);
    return;
  }
  if (st === 'paused') {
    const pauseDown = isDown('KeyP') || isDown('Escape');
    if (pauseDown && !tick.pauseLatch) {
      tick.pauseLatch = true;
      consumeAnyKey();
      world.state = world.prevState;
      return;
    }
    if (!pauseDown) tick.pauseLatch = false;
    if (consumeAnyKey()) {
      world.state = world.prevState;
    }
    return;
  }
  if (st === 'victory' || st === 'gameover') {
    const click = consumeClick();
    if (click || consumeAnyKey()) {
      sfx.click();
      startRun(world);
    }
  }
}

function cardIndexAt(x, y) {
  const cardW = 300, cardH = 300, gap = 28;
  const total = cardW * 3 + gap * 2;
  const x0 = (1280 - total) / 2, y0 = 210;
  if (y < y0 || y > y0 + cardH) return -1;
  for (let i = 0; i < 3; i++) {
    const cx = x0 + i * (cardW + gap);
    if (x >= cx && x <= cx + cardW) return i;
  }
  return -1;
}

function renderFrame(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const st = world.state;
  if (st === 'title') {
    drawWorld(ctx, world, t);
    drawTitle(ctx, world, best);
  } else if (st === 'levelup') {
    drawWorld(ctx, world, t);
    drawLevelUp(ctx, world);
  } else if (st === 'victory') {
    drawWorld(ctx, world, t);
    drawEnd(ctx, world, true, best);
  } else if (st === 'gameover') {
    drawWorld(ctx, world, t);
    drawEnd(ctx, world, false, best);
  } else if (st === 'paused') {
    drawWorld(ctx, world, t);
    drawPaused(ctx);
  } else {
    drawWorld(ctx, world, t);
  }
}
