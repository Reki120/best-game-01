// LUMENFALL sim: fixed-step update, no DOM, no rendering here.
// The world owns the player, enemies, projectiles, gems, waves, the Dawn
// meter, level-ups and the win/lose state. Rendering lives in render.js.
import { clamp, dist2, makeRng } from './rng.js';
import { ENEMY_TYPES, spawnTable, spawnInterval, maxAlive, hpScale } from './enemies.js';
import { UPGRADES, drawOffers } from './upgrades.js';
import { makeParticles, spawnParticle, burst, spawnText, updateParticles } from './particles.js';

export const ARENA_W = 2000;
export const ARENA_H = 1400;
export const SURVIVE_TIME = 300;
export const BOSS_TIME = 255;

const STEP = 1 / 60;

function xpNeeded(level) {
  return 6 + (level - 1) * 5;
}

function baseStats() {
  return {
    hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: xpNeeded(1),
    speed: 210, pickup: 140,
    boltCount: 1, boltDamage: 13, boltRate: 0.5,
    orbitCount: 0, orbitDamage: 8,
    novaDamage: 0, novaCooldown: 6, novaRadius: 130,
    thorns: 0, chill: 0, chillTime: 0, chain: 0,
    dawnRate: 1, dawnDamage: 40,
    ranks: {},
  };
}

export function createWorld(rng, sfx) {
  const w = {
    rng,
    sfx: sfx || null,
    state: 'title', // title | playing | levelup | victory | gameover | paused
    prevState: 'playing',
    time: 0,
    kills: 0,
    score: 0,
    shake: 0,
    flash: 0,
    flashColor: '#ffffff',
    player: null,
    enemies: [],
    shots: [],
    foeShots: [],
    gems: [],
    particles: makeParticles(),
    offers: [],
    pendingLevels: 0,
    spawnT: 0,
    boltT: 0,
    novaT: 0,
    orbitAngle: 0,
    bossSpawned: false,
    dawn: 0,
    bossWarnT: 0,
    starfallT: 45,
    props: [],
    stats: baseStats(),
    message: '',
    messageT: 0,
  };
  resetRun(w);
  // Arena dressing: fixed, deterministic props (crystals, mushrooms,
  // stones) so the night never looks empty. Generated once per world
  // from its own seed; they never move and never collide.
  const prng = makeRng(20261117);
  const kinds = ['crystal', 'shroom', 'stone'];
  for (let i = 0; i < 26; i++) {
    w.props.push({
      x: 90 + prng() * (ARENA_W - 180),
      y: 90 + prng() * (ARENA_H - 180),
      kind: kinds[i % 3],
      phase: prng() * Math.PI * 2,
      size: 0.8 + prng() * 0.7,
    });
  }
  return w;
}

function resetRun(w) {
  const s = w.stats;
  w.time = 0; w.kills = 0; w.score = 0;
  w.shake = 0; w.flash = 0;
  w.enemies.length = 0; w.shots.length = 0; w.foeShots.length = 0; w.gems.length = 0;
  w.particles.count = 0; w.particles.texts.length = 0;
  w.offers = []; w.pendingLevels = 0;
  w.spawnT = 1; w.boltT = 0.4; w.novaT = 4; w.orbitAngle = 0;
  w.bossSpawned = false; w.dawn = 0; w.bossWarnT = 0; w.starfallT = 45;
  w.message = ''; w.messageT = 0;
  w.stats = baseStats();
  w.player = {
    x: ARENA_W / 2, y: ARENA_H / 2, radius: 16,
    hp: 100, invulnT: 0, vx: 0, vy: 0, walkT: 0, moving: false,
  };
}

export function startRun(w) {
  resetRun(w);
  w.state = 'playing';
  if (w.sfx) w.sfx.startMusic();
}

export function chooseUpgrade(w, index) {
  const offer = w.offers[index];
  if (!offer || w.state !== 'levelup') return;
  const s = w.stats;
  const rank = (s.ranks[offer.id] || 0) + 1;
  s.ranks[offer.id] = rank;
  offer.apply(s, rank);
  if (offer.id === 'heart') { /* apply already healed */ }
  w.pendingLevels--;
  if (w.pendingLevels > 0 || s.xp >= s.xpNext) {
    levelUpOnce(w);
  } else {
    w.state = 'playing';
    w.offers = [];
  }
  if (w.sfx) w.sfx.click();
}

function levelUpOnce(w) {
  const s = w.stats;
  s.xp -= s.xpNext;
  s.level++;
  s.xpNext = xpNeeded(s.level);
  w.offers = drawOffers(w.rng, s.ranks);
  w.state = 'levelup';
  burst(w.particles, w.player.x, w.player.y, '#ffd166', 26, 260);
  if (w.sfx) w.sfx.levelup();
}

function gainXp(w, amount) {
  const s = w.stats;
  s.xp += amount;
  // One level-up screen at a time; the rest queue in pendingLevels and
  // are offered after the player picks (see chooseUpgrade).
  if (s.xp >= s.xpNext && w.state === 'playing') {
    w.pendingLevels++;
    levelUpOnce(w);
  }
}

function spawnEnemy(w, typeId, x, y) {
  const t = ENEMY_TYPES[typeId];
  // The boss scales gently on its own curve: at 4:30 it has ~2,000 HP,
  // a real fight for a levelled build, not a 3,360-HP wall.
  const scale = typeId === 'boss' ? 1 + w.time / 400 : hpScale(w.time);
  const hp = Math.round(t.hp * scale);
  w.enemies.push({
    type: typeId, x, y, hp, maxHp: hp,
    // The night quickens as it deepens: +20% speed by 5:00.
    speed: t.speed * (0.9 + w.rng() * 0.2) * (1 + w.time / 1500),
    radius: t.radius, damage: t.damage, xp: t.xp,
    color: t.color, glow: t.glow, score: t.score,
    flash: 0, slowT: 0, orbitCd: 0, shootT: 1.5 + w.rng() * 1.5,
    touchCd: 0, wobble: w.rng() * Math.PI * 2,
    // Spawn fade-in: half a second of materialising, no contact damage.
    fade: 0.5,
  });
}

// Spawn one enemy at an exact spot for staged scenes (screenshots);
// the enemy materialises instantly (no fade-in).
export function spawnEnemyAt(w, typeId, x, y) {
  spawnEnemy(w, typeId, x, y);
  const e = w.enemies[w.enemies.length - 1];
  e.fade = 0;
  return e;
}

function spawnRing(w) {
  const table = spawnTable(w.time);
  let total = 0;
  for (const [, weight] of table) total += weight;
  let roll = w.rng() * total;
  let type = 'shade';
  for (const [t, weight] of table) {
    roll -= weight;
    if (roll <= 0) { type = t; break; }
  }
  const p = w.player;
  const angle = w.rng() * Math.PI * 2;
  const dist = 540 + w.rng() * 90;
  const x = clamp(p.x + Math.cos(angle) * dist, 30, ARENA_W - 30);
  const y = clamp(p.y + Math.sin(angle) * dist, 30, ARENA_H - 30);
  spawnEnemy(w, type, x, y);
}

function damageEnemy(w, e, dmg, kx, ky) {
  // Luma's light burns the dark's heart twice as hard: the boss is a
  // fight the player can win in the final stretch, not a wall to kite.
  if (e.type === 'boss') dmg *= 2;
  e.hp -= dmg;
  e.flash = 0.12;
  if (kx || ky) {
    const len = Math.hypot(kx, ky) || 1;
    e.x += (kx / len) * 14;
    e.y += (ky / len) * 14;
  }
  spawnText(w.particles, e.x, e.y - e.radius - 6, String(Math.round(dmg)), '#ffe9a8');
  if (w.stats.chill > 0) e.slowT = w.stats.chillTime;
  if (e.hp <= 0) killEnemy(w, e);
}

function killEnemy(w, e) {
  e.hp = 0;
  w.kills++;
  w.score += e.score;
  w.dawn = Math.min(100, w.dawn + 2 * w.stats.dawnRate);
  burst(w.particles, e.x, e.y, e.glow, e.type === 'boss' ? 60 : 10, e.type === 'boss' ? 380 : 200);
  // Drop gems: value split so elites/bosses shower shards.
  let value = e.xp;
  while (value > 0) {
    const v = value >= 8 ? 8 : value >= 3 ? 3 : 1;
    value -= v;
    w.gems.push({
      x: e.x + (w.rng() - 0.5) * 36, y: e.y + (w.rng() - 0.5) * 36,
      value: v, t: w.rng() * Math.PI * 2,
    });
  }
  if (e.type === 'boss') {
    // The climax pays off: the night breaks open.
    w.message = 'GLOOMHEART FALLS — THE NIGHT BREAKS';
    w.messageT = 4;
    w.dawn = 100;
  }
  if (w.sfx) w.sfx.enemyDie();
}

function starfall(w) {
  const p = w.player;
  const ang = w.rng() * Math.PI * 2;
  const dist = 140 + w.rng() * 220;
  const cx = clamp(p.x + Math.cos(ang) * dist, 80, ARENA_W - 80);
  const cy = clamp(p.y + Math.sin(ang) * dist, 80, ARENA_H - 80);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    w.gems.push({
      x: cx + Math.cos(a) * 90, y: cy + Math.sin(a) * 90,
      value: k === 0 ? 8 : (k % 3 === 0 ? 3 : 1),
      t: w.rng() * Math.PI * 2,
    });
  }
  burst(w.particles, cx, cy, '#ffd166', 40, 380);
  w.message = '✦ STARFALL — SHARDS RAIN FROM THE SKY ✦';
  w.messageT = 3;
  if (w.sfx) w.sfx.gem();
}

function dawnBurst(w) {
  w.dawn = 0;
  w.flash = 0.35;
  w.flashColor = '#ffd166';
  w.shake = 10;
  const p = w.player;
  burst(w.particles, p.x, p.y, '#ffd166', 70, 520);
  for (const e of w.enemies) {
    const d2 = dist2(e.x, e.y, p.x, p.y);
    if (d2 < 460 * 460) {
      const d = Math.sqrt(d2) || 1;
      damageEnemy(w, e, w.stats.dawnDamage, (e.x - p.x) / d * 260, (e.y - p.y) / d * 260);
    }
  }
  if (w.sfx) w.sfx.dawn();
}

function fireBolts(w) {
  const s = w.stats;
  const p = w.player;
  // Nearest living enemies, up to boltCount.
  const targets = [];
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    targets.push(e);
  }
  // Aim at the boss first, then elites, then the nearest — so the
  // Gloomheart climax is a fight, not a 30-second kite.
  const prio = (e) => (e.type === 'boss' ? 0 : e.type === 'elite' ? 1 : 2);
  targets.sort((a, b) => prio(a) - prio(b) || dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y));
  const n = Math.min(s.boltCount, targets.length);
  for (let i = 0; i < n; i++) {
    const e = targets[i];
    const dx = e.x - p.x, dy = e.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const spread = (i - (n - 1) / 2) * 0.12;
    const ca = Math.cos(spread), sa = Math.sin(spread);
    const vx = (dx / len) * 520, vy = (dy / len) * 520;
    w.shots.push({
      x: p.x, y: p.y,
      vx: vx * ca - vy * sa, vy: vx * sa + vy * ca,
      life: 1.1, damage: s.boltDamage, chainLeft: s.chain, hitSet: [],
    });
  }
  if (n > 0 && w.sfx) w.sfx.shoot();
}

function novaBlast(w) {
  const s = w.stats;
  if (s.novaDamage <= 0) return;
  const p = w.player;
  burst(w.particles, p.x, p.y, '#2ec4b6', 40, 420);
  w.shake = Math.max(w.shake, 6);
  for (const e of w.enemies) {
    const d2 = dist2(e.x, e.y, p.x, p.y);
    if (d2 < s.novaRadius * s.novaRadius) {
      const d = Math.sqrt(d2) || 1;
      damageEnemy(w, e, s.novaDamage, (e.x - p.x) / d * 200, (e.y - p.y) / d * 200);
    }
  }
  if (w.sfx) w.sfx.nova();
}

function updatePlaying(w, dt, move) {
  const s = w.stats;
  const p = w.player;
  w.time += dt;

  // --- player movement
  p.moving = !!move;
  if (move) {
    p.x = clamp(p.x + move.x * s.speed * dt, 24, ARENA_W - 24);
    p.y = clamp(p.y + move.y * s.speed * dt, 24, ARENA_H - 24);
    p.walkT += dt;
  }
  if (p.invulnT > 0) p.invulnT -= dt;

  // --- boss warning + spawn
  if (!w.bossSpawned && w.time >= BOSS_TIME - 4 && w.bossWarnT <= 0) {
    w.bossWarnT = 4;
    w.message = 'SOMETHING HUGE STIRS IN THE DARK…';
    w.messageT = 4;
    if (w.sfx) w.sfx.boss();
  }
  if (w.bossWarnT > 0) w.bossWarnT -= dt;
  if (!w.bossSpawned && w.time >= BOSS_TIME) {
    w.bossSpawned = true;
    spawnEnemy(w, 'boss', clamp(p.x + 500, 60, ARENA_W - 60), clamp(p.y - 300, 60, ARENA_H - 60));
    w.message = 'GLOOMHEART, THE HUNGER — BURN IT DOWN';
    w.messageT = 4;
  }

  // --- spawner
  w.spawnT -= dt;
  if (w.spawnT <= 0 && w.enemies.length < maxAlive(w.time)) {
    // Shades arrive in packs that grow through the night: one at first,
    // then pairs and trios — the field stays busy enough to see.
    const pack = Math.min(3, 1 + Math.floor(w.time / 100));
    for (let k = 0; k < pack && w.enemies.length < maxAlive(w.time); k++) spawnRing(w);
    w.spawnT = spawnInterval(w.time);
  }

  // --- starfall: every 50 s (first at 45 s) shards rain down nearby.
  w.starfallT -= dt;
  if (w.starfallT <= 0) {
    w.starfallT = 50;
    starfall(w);
  }

  // --- bolt auto-fire
  w.boltT -= dt;
  if (w.boltT <= 0) {
    fireBolts(w);
    w.boltT = s.boltRate;
  }

  // --- nova
  if (s.novaDamage > 0) {
    w.novaT -= dt;
    if (w.novaT <= 0) {
      novaBlast(w);
      w.novaT = s.novaCooldown;
    }
  }

  // --- orbit embers
  w.orbitAngle += 3.4 * dt;
  if (s.orbitCount > 0) {
    for (let i = 0; i < s.orbitCount; i++) {
      const a = w.orbitAngle + (i * Math.PI * 2) / s.orbitCount;
      const ex = p.x + Math.cos(a) * 72;
      const ey = p.y + Math.sin(a) * 72;
      for (const e of w.enemies) {
        if (e.hp <= 0 || e.orbitCd > 0) continue;
        if (dist2(e.x, e.y, ex, ey) < (e.radius + 14) * (e.radius + 14)) {
          e.orbitCd = 0.35;
          damageEnemy(w, e, s.orbitDamage, e.x - p.x, e.y - p.y);
        }
      }
    }
  }

  // --- dawn burst at full meter (dawnBurst resets the meter to 0,
  // so this cannot fire twice in a row).
  if (w.dawn >= 100) dawnBurst(w);

  // --- enemies: chase, spitters shoot, separation
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.fade > 0) e.fade -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.orbitCd > 0) e.orbitCd -= dt;
    if (e.touchCd > 0) e.touchCd -= dt;
    const slowMul = e.slowT > 0 ? (1 - s.chill) : 1;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (e.type === 'spitter' && d < 280) {
      // Hold range and fire a glob.
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = 2.4;
        w.foeShots.push({
          x: e.x, y: e.y, vx: (dx / d) * 170, vy: (dy / d) * 170,
          life: 3, damage: e.damage, radius: 7,
        });
      }
      e.x += (dx / d) * e.speed * 0.25 * slowMul * dt;
      e.y += (dy / d) * e.speed * 0.25 * slowMul * dt;
    } else {
      const wob = e.type === 'skitter' ? Math.sin(w.time * 6 + e.wobble) * 0.5 : 0;
      const ca = Math.cos(wob), sa = Math.sin(wob);
      const mx = (dx / d) * ca - (dy / d) * sa;
      const my = (dx / d) * sa + (dy / d) * ca;
      e.x = clamp(e.x + mx * e.speed * slowMul * dt, 16, ARENA_W - 16);
      e.y = clamp(e.y + my * e.speed * slowMul * dt, 16, ARENA_H - 16);
    }
    if (e.type === 'boss') {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = 4.5;
        for (let k = 0; k < 3; k++) spawnRing(w);
      }
    }
  }
  // Separation (cheap O(n^2), n capped ~110).
  const list = w.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.hp <= 0) continue;
      const rr = a.radius + b.radius;
      const d2 = dist2(a.x, a.y, b.x, b.y);
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  // --- player shots
  for (let i = w.shots.length - 1; i >= 0; i--) {
    const sh = w.shots[i];
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.life -= dt;
    let dead = sh.life <= 0 || sh.x < 0 || sh.x > ARENA_W || sh.y < 0 || sh.y > ARENA_H;
    if (!dead) {
      for (const e of w.enemies) {
        if (e.hp <= 0 || sh.hitSet.includes(e)) continue;
        if (dist2(e.x, e.y, sh.x, sh.y) < (e.radius + 6) * (e.radius + 6)) {
          sh.hitSet.push(e);
          damageEnemy(w, e, sh.damage, sh.vx * 0.12, sh.vy * 0.12);
          burst(w.particles, sh.x, sh.y, '#ffd166', 4, 140);
          if (w.sfx) w.sfx.hit();
          // Chain spark: leap to the nearest other enemy.
          if (sh.chainLeft > 0) {
            let best = null, bestD = 260 * 260;
            for (const e2 of w.enemies) {
              if (e2.hp <= 0 || e2 === e || sh.hitSet.includes(e2)) continue;
              const d2 = dist2(e2.x, e2.y, e.x, e.y);
              if (d2 < bestD) { bestD = d2; best = e2; }
            }
            if (best) {
              sh.chainLeft--;
              damageEnemy(w, best, sh.damage * 0.8, 0, 0);
              spawnParticle(w.particles, best.x, best.y, 0, 0, 0.2, 5, '#7fe0ff');
            }
          }
          dead = true;
          break;
        }
      }
    }
    if (dead) w.shots.splice(i, 1);
  }

  // --- foe shots
  for (let i = w.foeShots.length - 1; i >= 0; i--) {
    const sh = w.foeShots[i];
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.life -= dt;
    let dead = sh.life <= 0;
    if (!dead && dist2(sh.x, sh.y, p.x, p.y) < (sh.radius + p.radius) * (sh.radius + p.radius)) {
      hurtPlayer(w, sh.damage);
      dead = true;
    }
    if (dead) w.foeShots.splice(i, 1);
  }

  // --- contact damage + thorns
  for (const e of w.enemies) {
    if (e.hp <= 0 || e.fade > 0.25) continue;
    const rr = e.radius + p.radius;
    if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
      if (e.touchCd <= 0) {
        e.touchCd = 0.7;
        hurtPlayer(w, e.damage);
        if (s.thorns > 0) damageEnemy(w, e, s.thorns, e.x - p.x, e.y - p.y);
      }
    }
  }

  // --- gems: drift toward the player from afar, magnet up close, collect
  for (let i = w.gems.length - 1; i >= 0; i--) {
    const g = w.gems[i];
    g.t += dt * 3;
    const d2 = dist2(g.x, g.y, p.x, p.y);
    const d = Math.sqrt(d2) || 1;
    if (d2 < 300 * 300) {
      // Far vacuum: shards creep toward the light so a kiting player
      // still progresses; the magnet radius pulls them in fast.
      const drift = d2 < s.pickup * s.pickup ? 700 * (1 - d / (s.pickup + 60)) : 95;
      g.x += ((p.x - g.x) / d) * drift * dt;
      g.y += ((p.y - g.y) / d) * drift * dt;
    }
    if (d2 < 30 * 30) {
      gainXp(w, g.value);
      if (w.sfx) w.sfx.gem();
      spawnParticle(w.particles, g.x, g.y, 0, -30, 0.3, 3, '#4cc9f0');
      w.gems.splice(i, 1);
    }
  }

  // --- sweep dead enemies
  for (let i = w.enemies.length - 1; i >= 0; i--) {
    if (w.enemies[i].hp <= 0) w.enemies.splice(i, 1);
  }

  // --- win check
  if (w.time >= SURVIVE_TIME) {
    w.state = 'victory';
    w.score += Math.round(w.time) + s.level * 50;
    burst(w.particles, p.x, p.y, '#ffd166', 80, 520);
    burst(w.particles, p.x, p.y, '#2ec4b6', 60, 420);
    if (w.sfx) w.sfx.win();
  }

  if (w.messageT > 0) w.messageT -= dt;
}

function hurtPlayer(w, dmg) {
  const p = w.player;
  if (p.invulnT > 0 || w.state !== 'playing') return;
  p.hp -= dmg;
  p.invulnT = 0.8;
  w.shake = Math.max(w.shake, 7);
  w.flash = 0.18;
  w.flashColor = '#ff5d73';
  burst(w.particles, p.x, p.y, '#ff5d73', 12, 220);
  if (w.sfx) w.sfx.hurt();
  if (p.hp <= 0) {
    p.hp = 0;
    w.state = 'gameover';
    w.score += Math.round(w.time) + w.stats.level * 50;
    burst(w.particles, p.x, p.y, '#ffd166', 60, 460);
    if (w.sfx) w.sfx.lose();
  }
}

// One fixed step. `move` is {x, y} or null. Returns nothing; read w.state.
export function stepWorld(w, move) {
  if (w.shake > 0) w.shake = Math.max(0, w.shake - 30 * STEP);
  if (w.flash > 0) w.flash = Math.max(0, w.flash - STEP);
  updateParticles(w.particles, STEP);
  if (w.state === 'playing') updatePlaying(w, STEP, move);
}

// Expose upgrade catalogue for the HUD.
export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id);
}
