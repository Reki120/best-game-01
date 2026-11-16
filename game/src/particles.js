// Pooled particles and floating damage numbers: fixed-size arrays, no
// allocation in the hot loop. Dead slots are swapped with the last live one.
const MAX_PARTICLES = 420;
const MAX_TEXTS = 48;

export function makeParticles() {
  return {
    count: 0,
    x: new Float32Array(MAX_PARTICLES),
    y: new Float32Array(MAX_PARTICLES),
    vx: new Float32Array(MAX_PARTICLES),
    vy: new Float32Array(MAX_PARTICLES),
    life: new Float32Array(MAX_PARTICLES),
    maxLife: new Float32Array(MAX_PARTICLES),
    size: new Float32Array(MAX_PARTICLES),
    color: new Array(MAX_PARTICLES).fill('#ffffff'),
    texts: [],
  };
}

export function spawnParticle(p, x, y, vx, vy, life, size, color) {
  if (p.count >= MAX_PARTICLES) return;
  const i = p.count++;
  p.x[i] = x; p.y[i] = y; p.vx[i] = vx; p.vy[i] = vy;
  p.life[i] = life; p.maxLife[i] = life; p.size[i] = size; p.color[i] = color;
}

export function burst(p, x, y, color, n, speed) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    spawnParticle(p, x, y, Math.cos(a) * s, Math.sin(a) * s,
      0.35 + Math.random() * 0.35, 2 + Math.random() * 3, color);
  }
}

export function spawnText(p, x, y, text, color) {
  if (p.texts.length >= MAX_TEXTS) p.texts.shift();
  p.texts.push({ x, y, text, color, life: 0.8, maxLife: 0.8 });
}

export function updateParticles(p, dt) {
  let i = 0;
  while (i < p.count) {
    p.life[i] -= dt;
    if (p.life[i] <= 0) {
      const last = --p.count;
      p.x[i] = p.x[last]; p.y[i] = p.y[last];
      p.vx[i] = p.vx[last]; p.vy[i] = p.vy[last];
      p.life[i] = p.life[last]; p.maxLife[i] = p.maxLife[last];
      p.size[i] = p.size[last]; p.color[i] = p.color[last];
      continue;
    }
    p.x[i] += p.vx[i] * dt;
    p.y[i] += p.vy[i] * dt;
    p.vx[i] *= 0.96; p.vy[i] *= 0.96;
    i++;
  }
  for (let t = p.texts.length - 1; t >= 0; t--) {
    const txt = p.texts[t];
    txt.life -= dt;
    txt.y -= 34 * dt;
    if (txt.life <= 0) p.texts.splice(t, 1);
  }
}

export function drawParticles(ctx, p, camX, camY) {
  for (let i = 0; i < p.count; i++) {
    const a = p.life[i] / p.maxLife[i];
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color[i];
    ctx.fillRect(p.x[i] - camX - p.size[i] / 2, p.y[i] - camY - p.size[i] / 2, p.size[i], p.size[i]);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, sans-serif';
  for (const txt of p.texts) {
    ctx.globalAlpha = Math.min(1, txt.life / txt.maxLife * 1.6);
    ctx.fillStyle = txt.color;
    ctx.fillText(txt.text, txt.x - camX, txt.y - camY);
  }
  ctx.globalAlpha = 1;
}
