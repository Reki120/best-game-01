// Level-up upgrades: each has 5 ranks. Choosing one changes the player's
// build; the three offered cards are drawn fresh every level.
export const UPGRADES = [
  {
    id: 'bolt', name: 'Ember Bolt', icon: '✦',
    desc: 'Auto-fires a searing bolt at the nearest Shade.',
    max: 5,
    rankDesc: (r) => `+1 bolt, +18% damage`,
    apply: (s, r) => { s.boltCount = 1 + r; s.boltDamage = 13 + r * 4; s.boltRate = Math.max(0.22, 0.55 - r * 0.05); },
  },
  {
    id: 'orbit', name: 'Orbiting Embers', icon: '☀',
    desc: 'Burning embers circle you and scorch anything they touch.',
    max: 5,
    rankDesc: (r) => `+1 ember, +14% orbit damage`,
    apply: (s, r) => { s.orbitCount = r; s.orbitDamage = 8 + r * 3; },
  },
  {
    id: 'nova', name: 'Nova Pulse', icon: '◎',
    desc: 'Every few seconds a shockwave bursts out and knocks Shades back.',
    max: 5,
    rankDesc: (r) => `+30% nova damage, −0.7s cooldown`,
    apply: (s, r) => { s.novaDamage = 18 + r * 9; s.novaCooldown = Math.max(2.2, 6 - r * 0.7); s.novaRadius = 130 + r * 18; },
  },
  {
    id: 'boots', name: 'Swift Boots', icon: '»',
    desc: 'Luma moves faster and slips through the dark.',
    max: 5,
    rankDesc: (r) => `+10% move speed`,
    apply: (s, r) => { s.speed = 200 * (1 + r * 0.10); },
  },
  {
    id: 'heart', name: 'Heart Lantern', icon: '♥',
    desc: 'A sturdier flame: more health, and a little healing each level.',
    max: 5,
    rankDesc: (r) => `+25 max health, heal 25`,
    apply: (s, r) => { s.maxHp = 100 + r * 25; s.hp = Math.min(s.maxHp, s.hp + 25); },
  },
  {
    id: 'magnet', name: 'Star Magnet', icon: '🧲',
    desc: 'XP shards fly to you from farther away.',
    max: 5,
    rankDesc: (r) => `+45% pickup radius`,
    apply: (s, r) => { s.pickup = 140 * (1 + r * 0.45); },
  },
  {
    id: 'thorns', name: 'Thorn Shield', icon: '✚',
    desc: 'Shades that touch you are burned in return.',
    max: 5,
    rankDesc: (r) => `+9 contact damage`,
    apply: (s, r) => { s.thorns = r * 9; },
  },
  {
    id: 'frost', name: 'Frost Gleam', icon: '❄',
    desc: 'Your attacks chill Shades, slowing them for a short while.',
    max: 5,
    rankDesc: (r) => `+10% slow, +0.4s chill`,
    apply: (s, r) => { s.chill = 0.15 + r * 0.10; s.chillTime = 0.8 + r * 0.4; },
  },
  {
    id: 'chain', name: 'Chain Spark', icon: '⚡',
    desc: 'Ember Bolts leap to a second Shade nearby.',
    max: 5,
    rankDesc: (r) => `+1 chain jump, +20% chain damage`,
    apply: (s, r) => { s.chain = r; },
  },
  {
    id: 'dawn', name: 'Daybreak Charge', icon: '☼',
    desc: 'Kills fill the Dawn meter faster; the Dawn burst hits harder.',
    max: 5,
    rankDesc: (r) => `+25% Dawn charge, +20% burst damage`,
    apply: (s, r) => { s.dawnRate = 1 + r * 0.25; s.dawnDamage = 40 + r * 16; },
  },
];

// Draw three distinct upgrade offers the player has not maxed out.
export function drawOffers(rng, ranks) {
  const pool = UPGRADES.filter((u) => (ranks[u.id] || 0) < u.max);
  const offers = [];
  const copy = pool.slice();
  while (offers.length < 3 && copy.length > 0) {
    const i = Math.floor(rng() * copy.length);
    offers.push(copy.splice(i, 1)[0]);
  }
  return offers;
}
