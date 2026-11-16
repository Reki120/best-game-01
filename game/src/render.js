// Canvas rendering: the night arena, entities, HUD and menu overlays.
// Everything is drawn in code; there are no image or font assets.
import { ARENA_W, ARENA_H, SURVIVE_TIME } from './world.js';
import { drawParticles } from './particles.js';

const W = 1280, H = 720;

const PALETTE = {
  bgTop: '#0b0e1e', bgBottom: '#141a33',
  gold: '#ffd166', goldDim: '#c9a24a',
  teal: '#2ec4b6', cyan: '#4cc9f0',
  red: '#ff5d73', magenta: '#e05d8f',
  ink: '#e8ecff', dim: '#9aa3c7',
  card: 'rgba(16, 20, 44, 0.92)', cardEdge: '#3a4470',
};

function fmtTime(t) {
  const left = Math.max(0, Math.ceil(SURVIVE_TIME - t));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, w, viewT) {
  const p = w.player;
  const shakeX = w.shake > 0 ? (Math.random() - 0.5) * w.shake : 0;
  const shakeY = w.shake > 0 ? (Math.random() - 0.5) * w.shake : 0;
  const camX = Math.max(0, Math.min(ARENA_W - W, p.x - W / 2)) + shakeX;
  const camY = Math.max(0, Math.min(ARENA_H - H, p.y - H / 2)) + shakeY;

  // --- night sky background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, PALETTE.bgTop);
  bg.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Stars: hashed positions so they scatter instead of lining up.
  ctx.fillStyle = 'rgba(232, 236, 255, 0.5)';
  for (let i = 0; i < 90; i++) {
    const sx = (i * 7919) % W;
    const sy = (i * 104729) % H;
    const tw = 0.3 + 0.2 * Math.sin(viewT * 1.5 + i);
    ctx.globalAlpha = Math.max(0.08, tw);
    ctx.fillRect(sx - (camX * 0.12 % W), sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Arena floor: faint grid + boundary glow.
  ctx.strokeStyle = 'rgba(90, 110, 190, 0.10)';
  ctx.lineWidth = 1;
  const grid = 100;
  const x0 = -camX % grid, y0 = -camY % grid;
  ctx.beginPath();
  for (let x = x0; x < W; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = y0; y < H; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(-camX, -camY, ARENA_W, ARENA_H);

  // --- gems
  for (const g of w.gems) {
    const bob = Math.sin(g.t) * 2;
    const size = g.value >= 8 ? 9 : g.value >= 3 ? 7 : 5;
    ctx.fillStyle = g.value >= 8 ? '#9d7bea' : g.value >= 3 ? '#4cc9f0' : '#7fe0ff';
    ctx.save();
    ctx.translate(g.x - camX, g.y - camY + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // --- enemies
  for (const e of w.enemies) {
    const ex = e.x - camX, ey = e.y - camY;
    const slow = e.slowT > 0;
    ctx.save();
    ctx.shadowColor = e.glow;
    ctx.shadowBlur = 14;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
    ctx.beginPath();
    if (e.type === 'brute' || e.type === 'boss') {
      // Hexagonal bulk.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + viewT * 0.4;
        const px = ex + Math.cos(a) * e.radius, py = ey + Math.sin(a) * e.radius;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (e.type === 'skitter') {
      // Dart: triangle pointing at the player.
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      ctx.moveTo(ex + Math.cos(a) * (e.radius + 6), ey + Math.sin(a) * (e.radius + 6));
      ctx.lineTo(ex + Math.cos(a + 2.5) * e.radius, ey + Math.sin(a + 2.5) * e.radius);
      ctx.lineTo(ex + Math.cos(a - 2.5) * e.radius, ey + Math.sin(a - 2.5) * e.radius);
      ctx.closePath();
    } else {
      ctx.arc(ex, ey, e.radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
    // Eyes.
    const ea = Math.atan2(p.y - e.y, p.x - e.x);
    ctx.fillStyle = slow ? '#bfe9ff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(ea - 0.35) * e.radius * 0.45, ey + Math.sin(ea - 0.35) * e.radius * 0.45, 2.4, 0, Math.PI * 2);
    ctx.arc(ex + Math.cos(ea + 0.35) * e.radius * 0.45, ey + Math.sin(ea + 0.35) * e.radius * 0.45, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // HP bar for tough enemies.
    if ((e.type === 'brute' || e.type === 'elite' || e.type === 'boss') && e.hp < e.maxHp) {
      const bw = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(ex - bw / 2, ey - e.radius - 12, bw, 5);
      ctx.fillStyle = PALETTE.red;
      ctx.fillRect(ex - bw / 2, ey - e.radius - 12, bw * (e.hp / e.maxHp), 5);
    }
    if (e.type === 'boss') {
      ctx.fillStyle = PALETTE.red;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GLOOMHEART', ex, ey - e.radius - 22);
    }
  }

  // --- foe shots
  for (const sh of w.foeShots) {
    ctx.fillStyle = '#7fe0c0';
    ctx.beginPath();
    ctx.arc(sh.x - camX, sh.y - camY, sh.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- player shots (ember bolts)
  for (const sh of w.shots) {
    ctx.save();
    ctx.shadowColor = PALETTE.gold;
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(sh.x - camX, sh.y - camY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- orbit embers
  const s = w.stats;
  if (s.orbitCount > 0) {
    for (let i = 0; i < s.orbitCount; i++) {
      const a = w.orbitAngle + (i * Math.PI * 2) / s.orbitCount;
      const ex = p.x + Math.cos(a) * 72 - camX;
      const ey = p.y + Math.sin(a) * 72 - camY;
      ctx.save();
      ctx.shadowColor = '#ff9d00';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffae3d';
      ctx.beginPath();
      ctx.arc(ex, ey, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- player: Luma, a lantern wisp
  const blink = p.invulnT > 0 && Math.floor(viewT * 14) % 2 === 0;
  if (!blink) {
    const pulse = 1 + Math.sin(viewT * 4) * 0.08;
    const glowR = 90 + Math.sin(viewT * 2.2) * 10;
    const glow = ctx.createRadialGradient(p.x - camX, p.y - camY, 4, p.x - camX, p.y - camY, glowR);
    glow.addColorStop(0, 'rgba(255, 209, 102, 0.35)');
    glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = PALETTE.gold;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, 15 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#7a5b12';
    ctx.beginPath();
    ctx.arc(p.x - camX - 5, p.y - camY - 2, 2.6, 0, Math.PI * 2);
    ctx.arc(p.x - camX + 5, p.y - camY - 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a5b12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY + 3, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  drawParticles(ctx, w.particles, camX, camY);

  // --- full-screen flash (hurt / dawn)
  if (w.flash > 0) {
    ctx.globalAlpha = Math.min(0.45, w.flash * 1.6);
    ctx.fillStyle = w.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, w);
  if (w.messageT > 0) {
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, w.messageT);
    ctx.fillText(w.message, W / 2, 108);
    ctx.globalAlpha = 1;
  }
}

function drawHud(ctx, w) {
  const s = w.stats;
  const p = w.player;
  ctx.textAlign = 'left';
  // Health bar.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 20, 18, 260, 22, 8);
  ctx.fill();
  ctx.fillStyle = '#ff5d73';
  roundRect(ctx, 22, 20, 256 * Math.max(0, p.hp / s.maxHp), 18, 6);
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`♥ ${Math.ceil(p.hp)} / ${s.maxHp}   Lv ${s.level}`, 28, 35);

  // Timer.
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = 'bold 30px system-ui, sans-serif';
  const left = Math.max(0, Math.ceil(SURVIVE_TIME - w.time));
  ctx.fillText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, W / 2, 38);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('SURVIVE UNTIL DAWN', W / 2, 58);

  // XP bar (under the timer).
  const xpW = 320;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, W / 2 - xpW / 2, 66, xpW, 10, 5);
  ctx.fill();
  ctx.fillStyle = PALETTE.cyan;
  roundRect(ctx, W / 2 - xpW / 2 + 1, 67, (xpW - 2) * Math.min(1, s.xp / s.xpNext), 8, 4);
  ctx.fill();

  // Kills + score.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`☠ ${w.kills} kills`, W - 24, 30);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`score ${w.score}`, W - 24, 52);

  // Dawn meter.
  const dw = 300;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, W / 2 - dw / 2, H - 34, dw, 14, 7);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  roundRect(ctx, W / 2 - dw / 2 + 1, H - 33, (dw - 2) * (w.dawn / 100), 12, 6);
  ctx.fill();
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('☼ DAWN', W / 2, H - 40);

  // Boss bar.
  const boss = w.enemies.find((e) => e.type === 'boss' && e.hp > 0);
  if (boss) {
    const bw = 420;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, W / 2 - bw / 2, 86, bw, 12, 6);
    ctx.fill();
    ctx.fillStyle = PALETTE.red;
    roundRect(ctx, W / 2 - bw / 2 + 1, 87, (bw - 2) * (boss.hp / boss.maxHp), 10, 5);
    ctx.fill();
  }
}

function dimScreen(ctx) {
  ctx.fillStyle = 'rgba(5, 6, 20, 0.72)';
  ctx.fillRect(0, 0, W, H);
}

export function drawTitle(ctx, w, best) {
  dimScreen(ctx);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('LUMENFALL', W / 2, 210);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '26px system-ui, sans-serif';
  ctx.fillText('a little light against the dark', W / 2, 256);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Move with WASD or arrow keys — your light fights for you.', W / 2, 330);
  ctx.fillText('Gather star shards, choose blessings, survive 5 minutes until dawn.', W / 2, 360);
  ctx.fillText('Beware Gloomheart at 4:30. Press M to mute.', W / 2, 390);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 24px system-ui, sans-serif';
  const pulse = 0.7 + Math.sin(Date.now() / 400) * 0.3;
  ctx.globalAlpha = pulse;
  ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', W / 2, 470);
  ctx.globalAlpha = 1;
  if (best > 0) {
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`best score: ${best}`, W / 2, 510);
  }
  ctx.fillStyle = 'rgba(154, 163, 199, 0.8)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('An original game — every pixel drawn in code, every sound synthesized.', W / 2, 690);
}

export function drawLevelUp(ctx, w) {
  dimScreen(ctx);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText(`LEVEL ${w.stats.level} — CHOOSE A BLESSING`, W / 2, 130);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Click a card, or press 1, 2 or 3', W / 2, 162);
  const cardW = 300, cardH = 300, gap = 28;
  const total = cardW * 3 + gap * 2;
  const x0 = (W - total) / 2, y0 = 210;
  w.offers.forEach((offer, i) => {
    const x = x0 + i * (cardW + gap);
    const rank = (w.stats.ranks[offer.id] || 0) + 1;
    ctx.fillStyle = PALETTE.card;
    roundRect(ctx, x, y0, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.cardEdge;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y0, cardW, cardH, 14);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '54px system-ui, sans-serif';
    ctx.fillText(offer.icon, x + cardW / 2, y0 + 84);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(offer.name, x + cardW / 2, y0 + 132);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`Rank ${rank} / ${offer.max}`, x + cardW / 2, y0 + 162);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '15px system-ui, sans-serif';
    wrapText(ctx, offer.desc, x + cardW / 2, y0 + 196, cardW - 40, 21);
    ctx.fillStyle = '#7fe0c0';
    ctx.font = 'bold 14px system-ui, sans-serif';
    wrapText(ctx, offer.rankDesc(rank), x + cardW / 2, y0 + 252, cardW - 40, 19);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`[${i + 1}]`, x + cardW / 2, y0 + cardH - 18);
  });
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH));
}

export function drawEnd(ctx, w, won, best) {
  dimScreen(ctx);
  ctx.textAlign = 'center';
  if (won) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('☼ DAWN BREAKS', W / 2, 220);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('You survived the night. The little light held.', W / 2, 268);
  } else {
    ctx.fillStyle = PALETTE.red;
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('THE LIGHT FADES', W / 2, 220);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('The dark was patient. Light it again.', W / 2, 268);
  }
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '20px system-ui, sans-serif';
  const mins = Math.floor(w.time / 60);
  const secs = Math.floor(w.time % 60);
  ctx.fillText(`survived ${mins}:${String(secs).padStart(2, '0')}   •   ${w.kills} Shades burned   •   level ${w.stats.level}`, W / 2, 340);
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(`SCORE ${w.score}`, W / 2, 400);
  ctx.fillStyle = PALETTE.dim;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText(`best score: ${best}`, W / 2, 436);
  const pulse = 0.7 + Math.sin(Date.now() / 400) * 0.3;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = PALETTE.ink;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('PRESS ENTER TO PLAY AGAIN', W / 2, 510);
  ctx.globalAlpha = 1;
}

export function drawPaused(ctx) {
  dimScreen(ctx);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, 350);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('Press P to resume', W / 2, 390);
}
