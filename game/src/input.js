// Keyboard + pointer input, polled by the sim each fixed step.
// Keys are tracked in a Set; the game reads a normalized move vector.
const keys = new Set();
let clickX = -1;
let clickY = -1;
let clicked = false;
let anyKey = false;

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (MOVE_KEYS[e.code] || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    if (!e.repeat) {
      keys.add(e.code);
      anyKey = true;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    clickY = (e.clientY - rect.top) * (canvas.height / rect.height);
    clicked = true;
    anyKey = true;
  });
}

export function moveVector() {
  let x = 0, y = 0;
  for (const code of keys) {
    const v = MOVE_KEYS[code];
    if (v) { x += v[0]; y += v[1]; }
  }
  if (x === 0 && y === 0) return null;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}

export function consumeClick() {
  if (!clicked) return null;
  clicked = false;
  return { x: clickX, y: clickY };
}

export function consumeAnyKey() {
  const had = anyKey;
  anyKey = false;
  return had;
}

export function isDown(code) {
  return keys.has(code);
}
