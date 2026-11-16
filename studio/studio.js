/* W.PROJECT — studio experience
 * Vanilla JS, no dependencies (same approach as the POS app): one requestAnimationFrame loop that only runs
 * while something is moving, CSS transitions for one-shot reveals, transforms/opacity for everything that moves.
 *
 * Data: studio/works.json (the public portfolio) plus, on a device where the W Project POS is used, the finished
 * orders already saved on that device. From those orders only the body type, paint spec, quantity and finish date
 * are read; customer name, phone and address are never touched.
 */
(() => {
'use strict';

const D = document, R = D.documentElement;
const RM = R.classList.contains('rm');
const FINE = R.classList.contains('fine');
const $ = (s, r = D) => r.querySelector(s);
const $$ = (s, r = D) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pad2 = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const E = {
  out: t => 1 - Math.pow(1 - t, 3),
  outQuad: t => 1 - (1 - t) * (1 - t),
  expo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  io: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  smooth: t => t * t * (3 - 2 * t),
  back: (t, s = 1.4) => { const c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
};
let VW = innerWidth, VH = innerHeight;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* =====================================================================
   COLOR — OKLab mixing, WCAG contrast, palettes
   ===================================================================== */
const hex2rgb = h => { h = String(h).replace('#', '').trim(); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
const s2l = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
const l2s = c => { c = clamp(c); return 255 * (c <= .0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - .055); };
function rgb2lab(c) {
  const r = s2l(c[0]), g = s2l(c[1]), b = s2l(c[2]);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s];
}
function lab2rgb(c) {
  const L = c[0], a = c[1], b = c[2];
  const l = Math.pow(L + .3963377774 * a + .2158037573 * b, 3);
  const m = Math.pow(L - .1055613458 * a - .0638541728 * b, 3);
  const s = Math.pow(L - .0894841775 * a - 1.2914855480 * b, 3);
  return [l2s(4.0767416621 * l - 3.3077115913 * m + .2309699292 * s), l2s(-1.2684380046 * l + 2.6097574011 * m - .3413193965 * s), l2s(-.0041960863 * l - .7034186147 * m + 1.7076147010 * s)];
}
const lab2lch = c => [c[0], Math.hypot(c[1], c[2]), (Math.atan2(c[2], c[1]) * 180 / Math.PI + 360) % 360];
const lch2rgb = (L, C, h) => lab2rgb([L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)]);
const lchOf = rgb => lab2lch(rgb2lab(rgb));
const mixLab = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mixRgb = (a, b, t) => lab2rgb(mixLab(rgb2lab(a), rgb2lab(b), t));
const lum = c => .2126 * s2l(c[0]) + .7152 * s2l(c[1]) + .0722 * s2l(c[2]);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const toRgb = v => (Array.isArray(v) ? v : hex2rgb(v));
const BLACK = [10, 10, 18], WHITE = [255, 255, 255];

// Move a color toward black or white until it reaches the contrast ratio against the background.
function ensure(fg, bg, min) {
  if (contrast(fg, bg) >= min) return fg;
  const to = lum(bg) > .2 ? BLACK : WHITE;
  const a = rgb2lab(fg), b = rgb2lab(to);
  for (let i = 1; i <= 30; i++) { const c = lab2rgb(mixLab(a, b, i / 30)); if (contrast(c, bg) >= min) return c; }
  return to;
}

const KEYS = ['bg', 'ink', 'mut', 'acc', 'acc2', 'acct', 'acs', 'on'];
function makePal(o) {
  const bg = toRgb(o.bg);
  const ink = ensure(toRgb(o.ink), bg, 7);
  const acc = toRgb(o.acc), acc2 = toRgb(o.acc2 || o.acc);
  const mut = ensure(mixRgb(ink, bg, .36), bg, 4.6);
  const acct = ensure(acc, bg, 3.2);                         // accent for large type and UI marks
  const acs = ensure(acc, bg, 4.6);                          // accent for small text
  const on = contrast(acc, BLACK) >= contrast(acc, WHITE) ? BLACK : WHITE;   // text on an accent fill
  const rgb = { bg, ink, mut, acc, acc2, acct, acs, on };
  const p = { lab: {}, hex: {} };
  KEYS.forEach(k => { p.lab[k] = rgb2lab(rgb[k]); p.hex[k] = rgb2hex(rgb[k]); });
  return p;
}
function mixPal(a, b, t) {
  if (t <= 0) return a; if (t >= 1) return b;
  const p = { lab: {}, hex: null };
  KEYS.forEach(k => { p.lab[k] = mixLab(a.lab[k], b.lab[k], t); });
  // Text never goes through a low-contrast midpoint: if the blended text color would fail against the blended
  // background (dark ↔ light), it snaps to whichever end color reads better.
  const bg = lab2rgb(p.lab.bg), acc = lab2rgb(p.lab.acc);
  [['ink', bg, 4.5], ['mut', bg, 4.5], ['acct', bg, 3], ['acs', bg, 4.5], ['on', acc, 4.5]].forEach(([k, ref, min]) => {
    if (contrast(lab2rgb(p.lab[k]), ref) >= min) return;
    p.lab[k] = contrast(lab2rgb(a.lab[k]), ref) >= contrast(lab2rgb(b.lab[k]), ref) ? a.lab[k] : b.lab[k];
  });
  return p;
}
// A section that always shows one palette, whatever the page is doing around it.
function localPal(el, p) {
  const hx = palHex(p), prev = el._pal || {};
  KEYS.forEach(k => { if (prev[k] !== hx[k]) el.style.setProperty(VAR[k], hx[k]); });
  if (prev.ink !== hx.ink) {
    el.style.setProperty('--line', `color-mix(in oklab, ${hx.ink} 17%, transparent)`);
    el.style.setProperty('--line-2', `color-mix(in oklab, ${hx.ink} 30%, transparent)`);
  }
  el._pal = hx;
}

// The brand palettes come straight from the logo (navy #074D96, pink #EF3C6B) and the POS app's color set.
const P = {
  heroMono: makePal({ bg: '#07080F', ink: '#F3F1EC', acc: '#F3F1EC', acc2: '#F3F1EC' }),
  hero: makePal({ bg: '#07080F', ink: '#F3F1EC', acc: '#EF3C6B', acc2: '#2C7BD6' }),
  paper: makePal({ bg: '#ECE9E2', ink: '#0B1430', acc: '#074D96', acc2: '#EF3C6B' }),
  navy: makePal({ bg: '#074D96', ink: '#F5F3EE', acc: '#EF3C6B', acc2: '#23AAE1' }),
  plum: makePal({ bg: '#93278F', ink: '#FFF7FB', acc: '#FFC53D', acc2: '#EF3C6B' }),
  night: makePal({ bg: '#06070B', ink: '#EEF3F7', acc: '#23AAE1', acc2: '#EF3C6B' }),
  amber: makePal({ bg: '#E8A50C', ink: '#0B0A08', acc: '#0B0A08', acc2: '#074D96' }),
  ink: makePal({ bg: '#0B0C10', ink: '#F1EFEA', acc: '#EF3C6B', acc2: '#23AAE1' }),
  wall: makePal({ bg: '#F1EFEA', ink: '#0B0C10', acc: '#EF3C6B', acc2: '#074D96' }),
  pink: makePal({ bg: '#EF3C6B', ink: '#0A0A12', acc: '#0A0A12', acc2: '#074D96' }),
};
const CRAFT_PALS = [P.navy, P.plum, P.night, P.amber];

/* ---------- applying a palette to the page ---------- */
const VAR = { bg: '--bg', ink: '--ink', mut: '--mut', acc: '--acc', acc2: '--acc2', acct: '--acct', acs: '--acs', on: '--on' };
const applied = {};
let lastPal = P.heroMono, metaT = 0;
const metaTheme = $('meta[name="theme-color"]');
function palHex(p) { if (!p.hex) { p.hex = {}; KEYS.forEach(k => { p.hex[k] = rgb2hex(lab2rgb(p.lab[k])); }); } return p.hex; }
// The page palette is written only to the elements that follow it (header, progress, cursor, menu, the open
// detail, and the hero during its opening), never to :root: a custom property change on :root would re-style
// every element on the page on every blended frame.
const chromeEls = new Set();
let chromeDirty = true;
function followPal(el, on) { if (on) chromeEls.add(el); else chromeEls.delete(el); chromeDirty = true; }
function applyPal(p) {
  lastPal = p;
  const hx = palHex(p);
  let changed = chromeDirty;
  KEYS.forEach(k => { if (applied[k] !== hx[k]) { applied[k] = hx[k]; changed = true; } });
  if (!changed) return;
  chromeDirty = false;
  chromeEls.forEach(el => localPal(el, p));
  D.body.style.backgroundColor = hx.bg; R.style.backgroundColor = hx.bg;
  const now = performance.now();
  if (now - metaT > 160 && metaTheme && metaTheme.content !== applied.bg) { metaT = now; metaTheme.content = applied.bg; }
}

/* ---------- image color extraction (k-means in OKLab) ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function extractImage(img) {
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) return null;
  const s = Math.min(1, 96 / Math.max(nw, nh)), w = Math.max(1, Math.round(nw * s)), h = Math.max(1, Math.round(nh * s));
  const cv = D.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data;             // throws on a cross-site image without CORS
  // Every pixel is weighted towards the centre (where the body sits) and flagged when it lies on the photo's edge,
  // so the table, cutting mat or backdrop around the body can be recognised and left out of the palette.
  const pts = [], wt = [], edge = [];
  const bw = Math.max(2, Math.round(w * .09)), bh = Math.max(2, Math.round(h * .09));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (px[i + 3] <= 200) continue;
    pts.push(rgb2lab([px[i], px[i + 1], px[i + 2]]));
    const dx = Math.abs((x + .5) / w * 2 - 1), dy = Math.abs((y + .5) / h * 2 - 1);
    wt.push(1 - .7 * Math.max(dx, dy) ** 2);
    edge.push(x < bw || x >= w - bw || y < bh || y >= h - bh ? 1 : 0);
  }
  if (pts.length < 8) return null;
  const K = Math.min(8, pts.length), rand = rng(7), cent = [pts[Math.floor(rand() * pts.length)]];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  while (cent.length < K) {                                 // k-means++ seeding, deterministic
    const ds = pts.map(p => Math.min(...cent.map(c => d2(p, c))));
    let r = rand() * ds.reduce((a, b) => a + b, 0), j = 0;
    for (; j < ds.length - 1 && (r -= ds[j]) > 0; j++);
    cent.push(pts[j]);
  }
  const asg = new Int16Array(pts.length);
  for (let it = 0; it < 9; it++) {
    const sum = cent.map(() => [0, 0, 0, 0]);
    pts.forEach((p, i) => { let b = 0, bd = Infinity; cent.forEach((c, k) => { const d = d2(p, c); if (d < bd) { bd = d; b = k; } }); asg[i] = b; const s = sum[b]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
    sum.forEach((s, k) => { if (s[3]) cent[k] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  const n = cent.map(() => 0), cw = cent.map(() => 0), ce = cent.map(() => 0);
  let tw = 0, te = 0;
  asg.forEach((k, i) => { n[k]++; cw[k] += wt[i]; ce[k] += edge[i]; tw += wt[i]; te += edge[i]; });
  const cl = cent.map((c, k) => {
    const lch = lab2lch(c);
    // bg: this color covers a real part of the photo's edge (mat, table, backdrop) rather than the painted body
    return { lab: c, rgb: lab2rgb(c), share: cw[k] / tw, bg: te ? ce[k] / te > .14 : false, L: lch[0], C: lch[1], h: lch[2] };
  }).filter((c, k) => n[k] > 0);
  let subject = cl.filter(c => !c.bg);
  if (!subject.some(c => c.share > .04)) subject = cl;      // the body fills the frame: nothing to leave out
  // A paint color is usually split into lit and shaded clusters: group clusters of the same hue before comparing,
  // then let the most vivid member of the winning group speak for it.
  const groups = [];
  subject.filter(c => c.C > .05).sort((a, b) => b.share - a.share).forEach(c => {
    const g = groups.find(o => hueDist(o.h, c.h) < 24);
    if (g) { g.m.push(c); g.share += c.share; g.cs += c.share * c.C; } else groups.push({ h: c.h, share: c.share, cs: c.share * c.C, m: [c] });
  });
  const pick = g => g.m.slice().sort((a, b) => b.C * Math.sqrt(b.share) - a.C * Math.sqrt(a.share))[0];
  const ranked = groups.filter(g => g.share > .015).sort((a, b) => b.share * (.3 + 6 * b.cs / b.share) - a.share * (.3 + 6 * a.cs / a.share));
  const byShare = subject.slice().sort((a, b) => b.share - a.share);
  const lead = ranked.length ? pick(ranked[0]) : byShare[0];
  const g2 = ranked.find(g => hueDist(g.h, lead.h) > 35);
  const second = g2 ? pick(g2) : byShare.find(c => c !== lead && Math.abs(c.L - lead.L) > .25);
  // swatches: the body's colors, near-duplicates merged
  const sw = [];
  byShare.forEach(c => { if (c.share > .012 && sw.length < 5 && !sw.some(o => Math.hypot(o.lab[0] - c.lab[0], o.lab[1] - c.lab[1], o.lab[2] - c.lab[2]) < .05)) sw.push(c); });
  return { cols: [lead.rgb].concat(second ? [second.rgb] : []), swatches: sw.map(c => rgb2hex(c.rgb)), from: 'photo' };
}

/* ---------- reading colors and finish out of a paint spec ("Candy red to blue fade, gold flakes") ---------- */
const LEX = [
  ['candy red|merah candy', '#B3121F'], ['candy blue|biru candy', '#0E3FA8'], ['candy purple|ungu candy', '#5B168C'], ['candy green|hijau candy', '#0F7A3A'],
  ['rose gold', '#C98B7A'], ['baby blue|light blue|sky blue|biru muda|biru langit', '#7CC4EE'], ['navy|dark blue|biru tua|biru dongker|dongker', '#0B2A6B'],
  ['gun metal|gunmetal', '#4A4F57'], ['army green|hijau army|army|olive', '#5B6B2F'], ['lime|stabilo|hijau stabilo|neon green', '#A6D608'], ['dark green|hijau tua', '#165B33'],
  ['tosca|teal|turquoise|turkis', '#12A594'], ['mint', '#7FD8B6'], ['maroon|marun', '#6E1423'], ['burgundy', '#7A1630'], ['merah muda|pink|rose', '#EF3C6B'],
  ['red|merah', '#D7263D'], ['orange|oranye|oren|jingga', '#F26A1B'], ['yellow|kuning', '#F2C40F'], ['gold|golden|emas', '#C9A227'],
  ['green|hijau', '#2E9D4F'], ['cyan', '#19B5C9'], ['blue|biru', '#1F5FD1'], ['purple|ungu', '#6D2FA8'], ['violet|lavender|lilac', '#8E6BE0'],
  ['magenta|fuchsia|fuschia', '#D02F8A'], ['black|hitam', '#121216'], ['white|putih', '#F1F0EB'], ['grey|gray|abu-abu|abu', '#8A8C93'],
  ['silver|perak|chrome|krom|chrom', '#C5C9CF'], ['bronze|perunggu', '#A0642E'], ['copper|tembaga', '#B7653B'], ['brown|coklat|cokelat', '#6B4226'], ['cream|krem|beige', '#E8DCC0'],
];
const LEX_MAP = new Map(); LEX.forEach(([words, hex]) => words.split('|').forEach(w => LEX_MAP.set(w, hex)));
const LEX_RE = new RegExp('(?<![a-z])(' + [...LEX_MAP.keys()].sort((a, b) => b.length - a.length).map(w => w.replace(/ /g, '\\s+')).join('|') + ')(?![a-z])', 'g');
const FIN = {
  candy: /candy/, pearl: /pearl|mutiara/, matte: /\bmatte?\b|\bdoff?\b|\bdof\b/, metal: /chrome|krom|chrom|mirror|metal(?:lic|ik)?|silver|perak/,
  flake: /flake|glitter|sparkle|holo|prism/, fade: /fade|gradasi|gradient|gradiasi|ombre|\bto\b|\bke\b|->|→/, stripe: /stripe|\bstrip\b|garis|livery|\bline/,
};
function readSpec(text) {
  const s = String(text || '').toLowerCase();
  const cols = [], seen = new Set();
  let m; LEX_RE.lastIndex = 0;
  while ((m = LEX_RE.exec(s))) { const hex = LEX_MAP.get(m[1].replace(/\s+/g, ' ')); if (hex && !seen.has(hex)) { seen.add(hex); cols.push(hex2rgb(hex)); } }
  const fin = {}; Object.keys(FIN).forEach(k => { fin[k] = FIN[k].test(s); });
  return { cols, fin };
}

/* ---------- a palette for a work, from its colors (the color rules from the brief) ---------- */
const family = h => (h < 12 || h >= 345 ? 'pink' : h < 45 ? 'red' : h < 75 ? 'orange' : h < 120 ? 'yellow' : h < 175 ? 'green' : h < 225 ? 'cyan' : h < 285 ? 'blue' : h < 330 ? 'purple' : 'pink');
const NEUTRAL = makePal({ bg: '#121317', ink: '#F1EFEA', acc: '#EF3C6B', acc2: '#2C7BD6' });
function paletteFrom(cols, i) {
  if (!cols || !cols.length) return NEUTRAL;
  const base = cols[0], bl = lchOf(base);
  const chrom = cols.filter(c => lchOf(c)[1] > .045);
  const lead = bl[1] > .045 ? base : chrom[0];
  const ll = lead ? lchOf(lead) : null;
  const second = lead ? (chrom.find(c => c !== lead && hueDist(lchOf(c)[2], ll[2]) > 30) || cols.find(c => c !== lead)) : cols[1];
  const inv = i % 2 === 1;
  if (bl[1] <= .045) {                                      // black, white, silver, grey base
    const light = bl[0] > .62;
    const bg = light ? (bl[0] > .9 ? base : mixRgb(base, WHITE, .55)) : lch2rgb(Math.min(bl[0], .19), .012, ll ? ll[2] : 260);
    const ink = light ? '#0B0C10' : '#F1EFEA';
    const acc = lead || ink;
    return makePal({ bg, ink, acc, acc2: second || acc });
  }
  // The artwork's dominant color is never used as the full background: the work has to keep its edges.
  // Alternate works flip between a dark and a light ground where the brief allows it.
  const [L, C, h] = ll, fam = family(h);
  const paper = lch2rgb(.95, .012, h), night = lch2rgb(.15, .028, h);
  if (fam === 'red' || fam === 'orange' || fam === 'pink') {
    if (inv) return makePal({ bg: paper, ink: '#0B0A0C', acc: lead, acc2: second || '#0B0A0C' });
    return makePal({ bg: night, ink: '#F4F1EC', acc: lead, acc2: second || '#F4F1EC' });
  }
  if (fam === 'yellow') return makePal({ bg: '#0C0C0B', ink: '#F7F3E6', acc: lead, acc2: second || lead });
  if (fam === 'green') {
    if (inv) return makePal({ bg: paper, ink: '#0B0D0B', acc: lead, acc2: second || lead });
    return makePal({ bg: lch2rgb(.17, .035, h), ink: '#EEF2EC', acc: lead, acc2: second || lead });
  }
  if (fam === 'blue' || fam === 'cyan') {
    if (inv) return makePal({ bg: lch2rgb(.14, .04, h), ink: '#F4F6FA', acc: L < .5 ? lch2rgb(.68, Math.min(C, .17), h) : lead, acc2: second || '#F4F6FA' });
    return makePal({ bg: '#F2F3F5', ink: '#0A0F1E', acc: lead, acc2: second || lead });
  }
  // purple leads as a deep ground, paired with neutrals
  return makePal({ bg: lch2rgb(Math.min(L * .55, .26), Math.min(C, .12), h), ink: '#F2EFEA', acc: '#E9E3D8', acc2: second || lch2rgb(.75, .12, h) });
}

/* =====================================================================
   LOOP — one rAF that sleeps when nothing moves
   ===================================================================== */
const jobs = new Set();
let raf = 0, scrollDirty = true;
function wake() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) {
  raf = 0;
  if (scrollDirty) { scrollDirty = false; onScrollFrame(now); }
  jobs.forEach(j => { if (!j(now)) jobs.delete(j); });
  renderTheme(now);
  if (jobs.size || themeBusy) wake();
}
const addJob = fn => { jobs.add(fn); wake(); };
function tween(dur, fn, ease = E.io, delay = 0) {
  const t0 = performance.now() + delay;
  return new Promise(res => addJob(now => {
    if (now < t0) return true;
    const t = clamp((now - t0) / dur); fn(ease(t));
    if (t >= 1) { res(); return false; }
    return true;
  }));
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* =====================================================================
   SPLIT TEXT
   ===================================================================== */
function splitInto(el, mode, html) {
  if (html != null) el.innerHTML = html;
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  const vis = D.createElement('span'); vis.setAttribute('aria-hidden', 'true');
  let ci = 0, wi = 0;
  const walk = (node, into) => {
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { into.appendChild(D.createTextNode(' ')); return; }
          const w = D.createElement('span'); w.className = 'w'; w.style.setProperty('--wi', wi++);
          if (mode === 'chars') [...part].forEach(ch => { const c = D.createElement('span'); c.className = 'c'; c.textContent = ch; c.style.setProperty('--i', ci++); w.appendChild(c); });
          else w.textContent = part;
          into.appendChild(w);
        });
      } else if (n.nodeName === 'BR') into.appendChild(D.createElement('br'));
      else if (n.nodeType === 1) { const c = n.cloneNode(false); walk(n, c); into.appendChild(c); }
    });
  };
  walk(el, vis);
  el.textContent = '';
  el.appendChild(vis);
  if (!/^H\d$/.test(el.tagName) || el.closest('[aria-hidden="true"]')) { const sr = D.createElement('span'); sr.className = 'sr'; sr.textContent = label; el.appendChild(sr); }
  else el.setAttribute('aria-label', label);
  return el;
}
$$('.split').forEach(el => splitInto(el, el.dataset.split || 'chars'));

/* =====================================================================
   SCENES — scroll-linked sections, measured once per resize
   ===================================================================== */
const scenes = [];
const scene = (el, fn, pre) => { const s = { el, fn, pre, top: 0, h: 0, sh: 0 }; scenes.push(s); return s; };
let lastSy = scrollY, scrollVel = 0, docH = 1;

function onScrollFrame() {
  const sy = scrollY;
  scrollVel += sy - lastSy; lastSy = sy;
  scenes.forEach(s => { if (sy + VH > s.top - VH * .25 && sy < s.top + s.h + VH * .25) s.fn(sy, s); });
  chrome(sy);
  themeDirty = true;
}
addEventListener('scroll', () => { scrollDirty = true; wake(); }, { passive: true });

/* =====================================================================
   SURFACES — every section paints its own palette; the fixed chrome (header, progress, cursor, body)
   follows the surface under the header. Full-screen interpolation happens inside surfaces that fill
   the viewport: the studio chapters, the exhibition (work to work) and the work detail.
   ===================================================================== */
let surfaces = [], craftZones = [], worksZones = [], themeDirty = true, themeBusy = false, ovr = null;
const HL = () => (VW <= 760 ? 31 : 36);                     // header line
function zoneAt(zs, c) {
  if (!zs.length) return null;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i], b = zs[i + 1];
    if (!b) return a.pal;
    const w = Math.abs(a.pal.lab.bg[0] - b.pal.lab.bg[0]) > .3 ? Math.min(b.w, VH * .2) : b.w;
    const s = a.end - w / 2, e = b.start + w / 2;
    if (c < s) return a.pal;
    if (c <= e) return e - s < 1 ? (c < b.start ? a.pal : b.pal) : mixPal(a.pal, b.pal, E.smooth((c - s) / (e - s)));
  }
  return zs[zs.length - 1].pal;
}
function buildSurfaces() {
  const top = el => el.getBoundingClientRect().top + scrollY;
  surfaces = []; craftZones = []; worksZones = [];
  const S = (el, get, paint) => { const t = top(el); const s = { el, top: t, bottom: t + el.offsetHeight, get, paint, last: null }; surfaces.push(s); return s; };
  // studio chapters: four palettes along the sticky range
  const cr = $('#craft'), ct = top(cr), ch = cr.offsetHeight, cs = $('.stick', cr).offsetHeight, seg = (ch - cs) / 4;
  CRAFT_PALS.forEach((p, k) => craftZones.push({ start: ct + cs / 2 + k * seg, end: ct + cs / 2 + (k + 1) * seg, pal: p, w: Math.min(seg * .5, VH * .34) }));
  const craftPal = sy => zoneAt(craftZones, clamp(sy + VH / 2, ct + cs / 2, ct + ch - cs / 2));
  // exhibition: the wall, then one palette per work around its center
  const ws = $('#works');
  let worksPal = () => P.ink;
  if (!ws.hidden) {
    const wt = top(ws), wb = wt + ws.offsetHeight, head = $('.works-head', ws), he = top(head) + head.offsetHeight;
    worksZones.push({ start: wt, end: he, pal: P.ink, w: 0 });
    const tiles = workTiles.map(t => ({ i: +t.dataset.i, c: top(t) + t.offsetHeight / 2 })).sort((a, b) => a.c - b.c);
    let st = he;
    tiles.forEach((o, k) => {
      const nx = tiles[k + 1], en = nx ? (o.c + nx.c) / 2 : wb;
      worksZones.push({ start: st, end: en, pal: works[o.i] ? works[o.i].pal : P.ink, w: Math.min(VH * .45, (en - st) * .8), work: o.i });
      st = en;
    });
    worksPal = sy => zoneAt(worksZones, clamp(sy + VH / 2, wt, wb));
  }
  const band = $('.band');
  S($('#hero'), () => P.hero);
  S($('#manifesto'), () => P.paper);
  S(band, (sy, s) => (sy + HL() < (s.top + s.bottom) / 2 ? P.paper : CRAFT_PALS[0]));
  S(cr, craftPal, true);
  S($('#process'), () => P.ink);
  if (!ws.hidden) S(ws, worksPal, true);
  S($('#preorder'), () => P.pink);
  S($('.foot'), () => P.hero);
  surfaces.sort((a, b) => a.top - b.top);
  band.style.setProperty('--b1', P.paper.hex.bg); band.style.setProperty('--b2', CRAFT_PALS[0].hex.bg);
  themeDirty = true;
}
function renderTheme(now) {
  if (!themeDirty && !ovr) { themeBusy = false; return; }
  themeDirty = false;
  const sy = scrollY;
  surfaces.forEach(s => {
    if (!s.paint || sy + VH < s.top || sy > s.bottom) return;
    const p = s.get(sy, s);
    if (p !== s.last) { s.last = p; localPal(s.el, p); }
  });
  const line = sy + HL();
  let cur = surfaces[0];
  surfaces.forEach(s => { if (s.top <= line) cur = s; });
  const base = cur ? (cur.paint && cur.last ? cur.last : cur.get(sy, cur)) : P.hero;
  if (ovr) {
    const t = clamp((now - ovr.t0) / ovr.dur), target = ovr.live ? base : ovr.pal;
    applyPal(t >= 1 ? target : mixPal(ovr.from, target, ovr.ease(t)));
    themeBusy = t < 1;
    if (t >= 1 && ovr.live) ovr = null;
    return;
  }
  themeBusy = false;
  applyPal(base);
}
function themeTo(pal, dur = 800, delay = 0) { ovr = { from: lastPal, pal, live: false, t0: performance.now() + delay, dur, ease: E.io }; themeBusy = true; wake(); }
function themeRelease(dur = 700) { ovr = { from: lastPal, pal: null, live: true, t0: performance.now(), dur, ease: E.io }; themeBusy = true; wake(); }

/* =====================================================================
   HERO
   ===================================================================== */
const hero = $('#hero');
const SPL = {"queue":{"cx":230.5,"cy":214.0,"reveal":129.5,"drops":[[352.0,401.2],[338.7,372.4],[344.8,362.4],[336.1,367.1],[319.9,376.8],[325.0,366.0],[322.0,356.7],[310.4,353.1],[303.2,365.6],[318.3,348.0],[316.1,344.3],[336.7,316.5],[332.9,323.1],[330.1,318.4],[302.7,340.6],[301.7,337.6],[351.3,286.3],[328.6,306.7],[217.2,414.2],[299.5,332.8],[262.3,369.2],[260.1,364.3],[295.6,323.5],[287.5,327.2],[260.6,350.8],[181.7,427.1],[260.3,348.2],[184.0,421.3],[184.5,418.4],[222.5,359.8],[202.5,357.0],[204.1,351.8],[203.6,349.6],[419.0,126.0],[370.6,170.8],[209.0,319.7],[391.1,125.0],[193.8,318.3],[142.8,369.2],[340.3,167.8],[198.2,310.3],[192.2,312.9],[397.8,108.0],[177.8,317.9],[364.7,132.3],[157.1,326.4],[347.2,112.2],[131.1,255.8],[280.9,103.3],[93.7,274.5],[251.6,107.7],[86.8,266.3],[243.5,86.8],[227.3,97.7],[239.7,72.7],[115.1,206.8],[224.8,92.3],[86.4,225.2],[224.8,84.3],[225.9,75.9],[84.8,225.0],[238.9,71.7],[158.2,327.0],[369.9,169.7],[367.7,127.0],[343.3,362.1]]},"order":{"cx":236.0,"cy":233.0,"reveal":91.0,"drops":[[138.4,111.8],[168.9,125.1],[191.5,121.7],[198.4,121.6],[189.2,123.1],[190.8,137.4],[202.6,136.9],[199.8,138.2],[323.2,162.1],[374.3,179.0],[334.1,184.9],[341.9,188.4],[379.5,190.3],[370.4,198.6],[373.4,200.9],[373.5,204.9],[339.5,209.7],[343.9,213.9],[434.7,232.2],[375.2,293.2],[360.5,313.4],[363.3,316.0],[165.8,316.0],[320.2,317.1],[371.5,318.9],[396.8,332.4],[179.7,321.2],[374.0,178.9],[343.8,279.2],[170.1,123.2],[176.4,328.9]]}};

// A splash lands: the blob grows from its centre, droplets fly out, then the drips run down (same motion as the POS icons).
function spiller(svg, d) {
  const body = $('.body', svg), rev = $('.rev', svg), drops = $$('.drops path', svg), MS = 1150;
  let run = 0;
  function at(t) {
    const { cx, cy, reveal } = d, pb = clamp(t / 430);
    if (t <= 0) body.setAttribute('opacity', '0'); else body.removeAttribute('opacity');
    if (pb >= 1) body.removeAttribute('transform');
    else { const s = .1 + .9 * E.back(pb, 1.6); body.setAttribute('transform', `translate(${cx} ${cy}) scale(${s.toFixed(4)}) translate(${-cx} ${-cy})`); }
    drops.forEach((p, i) => {
      const [dx, dy] = d.drops[i] || [cx, cy], q = clamp((t - 70 - Math.hypot(dx - cx, dy - cy) * .75) / 360);
      if (q <= 0) { p.setAttribute('opacity', '0'); return; }
      p.removeAttribute('opacity');
      if (q >= 1) { p.removeAttribute('transform'); return; }
      const e = E.out(q), k = 1 - e, s = .2 + .8 * e;
      p.setAttribute('transform', `translate(${((cx - dx) * k).toFixed(2)} ${((cy - dy) * k).toFixed(2)}) translate(${dx} ${dy}) scale(${s.toFixed(3)}) translate(${-dx} ${-dy})`);
    });
    rev.setAttribute('height', (reveal * E.outQuad(clamp((t - 360) / 760))).toFixed(1));
  }
  function play(delay = 0) {
    if (RM) { at(MS); return; }
    const id = ++run, t0 = performance.now() + delay;
    at(0);
    addJob(now => { if (id !== run) return false; const t = now - t0; if (t < 0) return true; at(Math.min(t, MS)); return t < MS; });
  }
  return { at, play, MS };
}
const splashQ = spiller($('.hero .splash'), SPL.queue);
const splashO = spiller($('.g-art .splash'), SPL.order);

const lines = $$('.hero .cbl-line');
$$('.hero .cbl .ch').forEach((c, i) => c.style.setProperty('--i', i));
const heroDim = $('.hero-dim');
const heroSo = { logo: $('.hero-logo > .so'), splash: $('.hero-splash .so'), type: $('.hero-type > .so'), marks: $('.hero-marks') };
let heroP = -1;
const heroScene = scene(hero, (sy, s) => {
  if (RM) return;
  const p = clamp(sy / s.h);
  if (Math.abs(p - heroP) < .0005) return;
  heroP = p;
  const e = p * p * (3 - 2 * p) * .4 + p * .6;
  lines[0].style.transform = `translate3d(${(-e * VW * .26).toFixed(1)}px,0,0)`;
  lines[1].style.transform = `translate3d(${(e * VW * .16).toFixed(1)}px,0,0)`;
  lines[2].style.transform = `translate3d(${(-e * VW * .09).toFixed(1)}px,0,0)`;
  heroSo.type.style.transform = `translate3d(0,${(-p * VH * .1).toFixed(1)}px,0)`;
  heroSo.logo.style.transform = `translate3d(0,${(-p * VH * .2).toFixed(1)}px,0) scale(${(1 - p * .16).toFixed(4)}) rotate(${(-p * 9).toFixed(2)}deg)`;
  heroSo.splash.style.transform = `scale(${(1 + p * .55).toFixed(4)}) rotate(${(p * 16).toFixed(2)}deg)`;
  heroSo.splash.style.opacity = (1 - p * .7).toFixed(3);
  heroSo.marks.style.opacity = clamp(1 - p * 1.8).toFixed(3);
  heroSo.marks.style.transform = `translate3d(0,${(-p * VH * .08).toFixed(1)}px,0)`;
  hero.style.transform = p > 0 ? `scale(${(1 - p * .07).toFixed(4)})` : '';
  heroDim.style.opacity = (p * .72).toFixed(3);
  if (p < 1) startParallax();
});

/* pointer parallax, spotlight and the live ruler */
const pxEls = $$('.hero .px').map(el => ({ el, d: +el.dataset.depth || 0, tilt: el.classList.contains('tilt') }));
const dots = $('.hero-dots'), rulerCur = $('.ruler-cur'), coords = $('.coords'), ruler = { l: 0, w: 0 };
const ptr = { x: 0, y: 0, cx: 0, cy: 0, ax: .5, ay: .5 };
let heroVisible = true, parallaxOn = false, coordT = '';
function parallaxJob(now) {
  if (!FINE) { ptr.x = Math.sin(now * .00042) * .6; ptr.y = Math.cos(now * .00031) * .5; }
  ptr.cx += (ptr.x - ptr.cx) * .075; ptr.cy += (ptr.y - ptr.cy) * .075;
  const x = ptr.cx, y = ptr.cy;
  pxEls.forEach(o => {
    let t = `translate3d(${(x * o.d).toFixed(2)}px,${(y * o.d).toFixed(2)}px,0)`;
    if (o.tilt) t += ` rotateY(${(x * 9).toFixed(2)}deg) rotateX(${(-y * 7).toFixed(2)}deg)`;
    o.el.style.transform = t;
  });
  const mx = FINE ? ptr.ax : (x + 1) / 2, my = FINE ? ptr.ay : (y + 1) / 2;
  dots.style.setProperty('--mx', (mx * 100).toFixed(1) + '%');
  dots.style.setProperty('--my', (my * 100).toFixed(1) + '%');
  if (rulerCur && ruler.w) {
    const rx = FINE ? clamp(ptr.ax * VW - ruler.l, 0, ruler.w) : mx * ruler.w;
    rulerCur.style.transform = `translateX(${rx.toFixed(1)}px)`;
    const txt = `X ${mx.toFixed(3)}  Y ${my.toFixed(3)}`;
    if (txt !== coordT) { coordT = txt; coords.textContent = txt; }
  }
  const moving = Math.abs(ptr.x - ptr.cx) + Math.abs(ptr.y - ptr.cy) > .0008;
  parallaxOn = heroVisible && scrollY < VH && (!FINE || moving);
  return parallaxOn;
}
function startParallax() { if (RM || parallaxOn || !heroVisible || !R.classList.contains('settled')) return; parallaxOn = true; addJob(parallaxJob); }
if (FINE) {
  addEventListener('pointermove', e => {
    if (!heroVisible) return;
    ptr.ax = e.clientX / VW; ptr.ay = e.clientY / VH;
    ptr.x = ptr.ax * 2 - 1; ptr.y = ptr.ay * 2 - 1;
    startParallax();
  }, { passive: true });
}
$('.logo-rv').addEventListener('click', () => splashQ.play(0));

/* hero opening */
function decode(el, dur) {
  const txt = el.dataset.text || el.textContent, pool = 'W#/_0123456789ABCDEFX+';
  el.textContent = txt.replace(/\S/g, () => pool[(Math.random() * pool.length) | 0]);
  return tween(dur, t => {
    const n = Math.floor(t * txt.length);
    let s = txt.slice(0, n);
    for (let i = n; i < txt.length; i++) s += txt[i] === ' ' ? ' ' : pool[(Math.random() * pool.length) | 0];
    el.textContent = t >= 1 ? txt : s;
  }, x => x);
}
function count(el, dur) { const to = +el.dataset.to || 0; return tween(dur, t => { el.textContent = pad2(Math.round(to * t)); }, E.out); }
function intro() {
  $$('.yr').forEach(e => { e.textContent = new Date().getFullYear(); });
  if (RM) { R.classList.add('go', 'done', 'settled'); splashQ.at(splashQ.MS); localPal(hero, P.hero); return; }
  followPal(hero, true);
  applyPal(P.heroMono);
  ovr = { from: P.heroMono, pal: null, live: true, t0: performance.now() + 1e7, dur: 1100, ease: E.io }; themeBusy = true;
  let started = false;
  const start = () => {
    if (started) return; started = true;
    R.classList.add('go');
    splashQ.play(640);
    if (ovr && ovr.live) { ovr.t0 = performance.now() + (scrollY > 40 ? 0 : 900); wake(); }
    setTimeout(() => $$('.hero .dec').forEach(el => decode(el, 900)), 1050);
    setTimeout(() => $$('.hero .num').forEach(el => count(el, 1000)), 1200);
    setTimeout(() => R.classList.add('done'), 1400);
    setTimeout(() => { R.classList.add('settled'); startParallax(); followPal(hero, false); localPal(hero, P.hero); }, 2500);
  };
  const fonts = D.fonts && D.fonts.ready ? D.fonts.ready : Promise.resolve();
  if (scrollY > 40) { start(); R.classList.add('done'); followPal(hero, false); localPal(hero, P.hero); return; }
  Promise.race([fonts, wait(650)]).then(start);
  // If the visitor scrolls before the opening ends, finish it right away.
  addEventListener('scroll', function skip() { if (scrollY > 40) { removeEventListener('scroll', skip); start(); R.classList.add('done'); } }, { passive: true });
}

/* =====================================================================
   MANIFESTO — headline rises with the scroll, then the words light up one by one
   ===================================================================== */
const mf = $('#manifesto');
localPal(mf, P.paper);
localPal($('#process'), P.ink);
localPal($('.foot'), P.hero);
localPal($('.po-in'), P.pink);
const mfChars = $$('.mf-title .c'), mfWords = $$('.mf-text .w');
const mfCache = new Map();
const setT = (el, v) => { if (mfCache.get(el) !== v) { mfCache.set(el, v); el.style.transform = v; } };
const setO = (el, v) => { if (mfCache.get(el) !== v) { mfCache.set(el, v); el.style.opacity = v; } };
scene(mf, (sy, s) => {
  if (RM) return;
  const range = s.h - s.sh;
  const q = clamp((sy - (s.top - VH * .7)) / (VH * .7 + range * .16));
  const n = mfChars.length;
  mfChars.forEach((c, i) => { const l = E.out(clamp(q * 1.7 - (i / n) * .7)); setT(c, l >= 1 ? 'none' : `translate3d(0,${((1 - l) * 112).toFixed(1)}%,0)`); });
  const p = clamp((sy - s.top) / range), m = mfWords.length;
  const w = clamp((p - .1) / .7) * (m + 3);
  mfWords.forEach((el, i) => setO(el, (.13 + .87 * clamp((w - i) / 3)).toFixed(3)));
});

/* =====================================================================
   BAND — a racing stripe opens, two marquees run, scroll speed pushes them
   ===================================================================== */
const strip = $('#bandStrip');
let stripQ = -1;
scene($('.band'), (sy, s) => {
  if (RM) return;
  const q = E.out(clamp((sy + VH - s.top - VH * .05) / (VH * .5)));
  if (Math.abs(q - stripQ) < .001) return; stripQ = q;
  const k = ((1 - q) * 50).toFixed(2);
  strip.style.clipPath = `inset(${k}% 0 ${k}% 0)`;
});
const mqs = $$('.mq').map(el => ({ el, track: $('.mq-track', el), dir: +el.dataset.dir || -1, x: 0, seg: 0 }));
function fillMarquees() {
  mqs.forEach(m => {
    const base = m.base || (m.base = [...m.track.children].map(n => n.cloneNode(true)));
    m.track.textContent = '';
    base.forEach(n => m.track.appendChild(n.cloneNode(true)));
    m.seg = m.track.scrollWidth || 1;
    let guard = 0;
    while (m.track.scrollWidth < VW * 1.25 + m.seg && guard++ < 40) base.forEach(n => m.track.appendChild(n.cloneNode(true)));
  });
}
let bandVisible = false, mqOn = false, mqLast = 0, vel = 0;
function marqueeJob(now) {
  const dt = Math.min(48, now - (mqLast || now)); mqLast = now;
  vel += (scrollVel - vel) * .12; scrollVel = 0;
  const boost = clamp(Math.abs(vel) * 9, 0, 900);
  mqs.forEach(m => {
    m.x += m.dir * (70 + boost) * dt / 1000 * (m.dir < 0 ? 1 : .8);
    if (m.x <= -m.seg) m.x += m.seg; if (m.x > 0) m.x -= m.seg;
    m.track.style.transform = `translate3d(${m.x.toFixed(2)}px,0,0) skewX(${clamp(-vel * .25, -10, 10).toFixed(2)}deg)`;
  });
  mqOn = bandVisible;
  if (!mqOn) mqLast = 0;
  return mqOn;
}

/* =====================================================================
   CRAFT — sticky chapters: typography, graphic and color change together
   ===================================================================== */
const craft = $('#craft');
const chT = $$('.ch-t', craft), chP = $$('.ch-p', craft), gs = $$('.g', craft), rails = $$('.rail b', craft);
const odo = $('.odo-col', craft), ghost = $('.ghost-col', craft), pnum = $('.pnum', craft), pname = $('.pl-name', craft);
const CH_NAMES = ['Craft', 'Art', 'Precision', 'Timeline'];
let chap = 0, gfxOn = false;
(function buildGraphics() {
  const dial = $('.g-prec .dial');
  let s = '';
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, lg = i % 6 === 0, r1 = lg ? 160 : 165, r2 = 174;
    s += `<line class="${lg ? 'lg' : ''}" x1="${(200 + Math.cos(a) * r1).toFixed(1)}" y1="${(200 + Math.sin(a) * r1).toFixed(1)}" x2="${(200 + Math.cos(a) * r2).toFixed(1)}" y2="${(200 + Math.sin(a) * r2).toFixed(1)}"/>`;
  }
  dial.innerHTML = s;
  const cal = $('.g-time .cal');
  let c = '', k = 0;
  for (let i = 0; i < 35; i++) {
    const col = i % 7, row = (i / 7) | 0, x = 39 + col * 47, y = 84 + row * 47, f = i >= 3 && i <= 25;
    c += `<rect x="${x}" y="${y}" width="40" height="40"/>`;
    if (f) c += `<rect class="cf" x="${x}" y="${y}" width="40" height="40" style="--i:${k++}"/>`;
    c += `<text class="${f ? 'f' : ''}" x="${x + 5}" y="${y + 13}">${pad2(i + 1)}</text>`;
    if (i === 25) c += `<rect class="dl" x="${x - 4}" y="${y - 4}" width="48" height="48"/>`;
  }
  cal.innerHTML = c;
  $$('.pp-g').forEach(g => [...g.children].forEach((el, i) => el.style.setProperty('--i', i)));
})();
function setChapter(k) {
  if (k === chap) return;
  const prev = chap; chap = k;
  chT.forEach((t, i) => { t.classList.toggle('on', i === k); t.classList.toggle('out', i === prev && i !== k); });
  setTimeout(() => chT.forEach((t, i) => { if (i !== chap) t.classList.remove('out'); }), 750);
  chP.forEach((p, i) => p.classList.toggle('on', i === k));
  if (gfxOn) gs.forEach((g, i) => g.classList.toggle('on', i === k));
  odo.style.transform = `translateY(${-k * 25}%)`;
  ghost.style.transform = `translateY(${-k * 25}%)`;
  pnum.textContent = pad2(k + 1);
  pname.textContent = CH_NAMES[k];
  if (k === 1 && gfxOn) splashO.play(120);
}
scene(craft, (sy, s) => {
  const p = clamp((sy - s.top) / (s.h - s.sh));
  setChapter(Math.min(3, Math.floor(p * 4 + .0001)));
  // graphics play when the stage comes into view, and re-arm once it has left, so they replay next time
  const arm = sy >= s.top - VH * .55 && sy <= s.top + s.h - VH * .4;
  if (arm !== gfxOn) {
    gfxOn = arm;
    gs.forEach((g, i) => g.classList.toggle('on', arm && i === chap));
    if (arm && chap === 1) splashO.play(120); else if (!arm) splashO.at(0);
  }
  rails.forEach((b, i) => { b.style.transform = `scaleX(${clamp(p * 4 - i).toFixed(3)})`; });
});
splashO.at(0);

/* =====================================================================
   PROCESS — vertical scroll drives a horizontal track (wide screens)
   ===================================================================== */
const proc = $('#process'), track = $('#track'), pps = $$('.pp', track), steps = pps.filter(p => !p.classList.contains('pp-intro'));
const procBar = $('.proc-bar i'), procStep = $('.proc-step');
const wideMQ = matchMedia('(min-width: 761px)');
let horiz = false, dist = 0, ppLeft = [], curStep = -1;
function measureProcess() {
  horiz = !RM && wideMQ.matches;
  if (!horiz) { proc.style.height = ''; track.style.transform = ''; return; }
  track.style.transform = 'none';
  dist = Math.max(0, track.scrollWidth - VW);
  ppLeft = pps.map(p => p.offsetLeft);
  proc.style.height = (dist + $('.stick', proc).offsetHeight) + 'px';
}
scene(proc, (sy, s) => {
  if (!horiz) return;
  const p = clamp((sy - s.top) / (s.h - s.sh)), x = p * dist;
  track.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
  procBar.style.transform = `scaleX(${p.toFixed(4)})`;
  let k = -1;
  steps.forEach((st, i) => { if (ppLeft[i + 1] - x < VW * .62) k = i; });
  if (k !== curStep) {
    curStep = k;
    steps.forEach((st, i) => { st.classList.toggle('cur', i === k); if (i <= k) st.classList.add('on'); });
    procStep.textContent = 'Step ' + pad2(k + 1);
  }
});

/* =====================================================================
   PRE-ORDER — the section floods in pink from the top edge
   ===================================================================== */
const flood = $('.po-flood'), poTitle = $('.po-title'), poMark = $('.po-mark');
let floodQ = -1;
scene($('#preorder'), (sy, s) => {
  if (RM) return;
  const q = clamp((sy + VH - s.top) / (VH * .9));
  if (Math.abs(q - floodQ) < .0008) return; floodQ = q;
  flood.style.clipPath = q >= 1 ? 'none' : `circle(${(E.io(q) * 142).toFixed(2)}% at 50% 0%)`;
  s.el.classList.toggle('flooded', q >= 1);
  poTitle.style.transform = `scale(${(.86 + .14 * E.out(q)).toFixed(4)})`;
  const q2 = clamp((sy + VH - s.top) / (VH * 1.6));
  poMark.style.transform = `translate3d(0,${((1 - q2) * (VW <= 760 ? 6 : 30)).toFixed(1)}vh,0) rotate(${(9 - (1 - E.out(q2)) * 40).toFixed(2)}deg) scale(${(.7 + .3 * E.out(q2)).toFixed(3)})`;
});

/* =====================================================================
   THE RESULT — works.json + finished orders on this device
   ===================================================================== */
let works = [], workTiles = [];
const grid = $('#worksGrid'), worksSec = $('#works');
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'work';
const monthYear = s => { const m = /^(\d{4})-(\d{2})/.exec(String(s || '')); return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : ''; };
function waNumber(phone) { let d = String(phone || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d; return d.length >= 9 ? d : ''; }

async function loadWorks() {
  const out = [];
  let studio = {};
  const base = new URL('works.json', location.href);
  try {
    const r = await fetch(base, { cache: 'no-cache' });
    if (r.ok) {
      const j = await r.json();
      studio = (j && j.studio) || {};
      ((j && j.works) || []).forEach(w => {
        if (!w || !(w.image || w.body || w.title)) return;
        let image = '';
        try { image = w.image ? new URL(String(w.image), base).href : ''; } catch (e) {}
        out.push({
          source: 'studio', title: String(w.title || w.body || '').slice(0, 90), body: String(w.body || '').slice(0, 90),
          spec: String(w.spec || '').slice(0, 400), image, alt: String(w.alt || ''),
          qty: Number.isFinite(+w.qty) && +w.qty > 0 ? Math.round(+w.qty) : null,
          when: String(w.year || monthYear(w.date) || ''), whenLabel: w.year ? 'Year' : 'Finished',
          colors: Array.isArray(w.colors) ? w.colors.filter(c => /^#?[0-9a-f]{6}$/i.test(c)).map(hex2rgb) : null,
        });
      });
    }
  } catch (e) {}
  // Finished orders from the POS on this same device. Only body, spec, qty and dates are read.
  try {
    const raw = JSON.parse(localStorage.getItem('wpos-orders-v1') || '[]');
    if (Array.isArray(raw)) raw
      .filter(o => o && o.done === true && typeof o.body === 'string' && o.body.trim())
      .sort((a, b) => String(b.doneAt || b.deadline || '').localeCompare(String(a.doneAt || a.deadline || '')))
      .slice(0, 24)
      .forEach(o => out.push({
        source: 'board', title: o.body.trim().slice(0, 80), body: o.body.trim().slice(0, 80), spec: typeof o.details === 'string' ? o.details.slice(0, 400) : '',
        image: '', alt: '', qty: Number.isFinite(+o.qty) && +o.qty > 0 ? Math.round(+o.qty) : null,
        when: monthYear(o.doneAt) || monthYear(o.deadline), whenLabel: o.doneAt ? 'Finished' : 'Deadline', colors: null,
      }));
  } catch (e) {}
  const used = new Map();
  out.forEach((w, i) => {
    const sp = readSpec(`${w.spec} ${w.title}`);
    w.fin = sp.fin;
    w.specCols = w.colors && w.colors.length ? w.colors : sp.cols;
    w.swatches = w.specCols.map(rgb2hex);
    w.palFrom = w.colors && w.colors.length ? 'listed' : w.specCols.length ? 'spec' : 'studio';
    w.pal = paletteFrom(w.specCols, i);
    let sl = slugify(w.title); const n = (used.get(sl) || 0) + 1; used.set(sl, n); if (n > 1) sl += '-' + n;
    w.slug = sl;
  });
  return { studio, list: out };
}

function specHTML(w) {
  const cols = w.specCols.length ? w.specCols : [[24, 25, 31]];
  const c1 = cols[0], c2 = cols[1] || mixRgb(c1, lum(c1) > .3 ? BLACK : WHITE, .35), c3 = cols[2] || c2;
  const f = w.fin;
  const mode = cols.length > 1 ? (f.stripe && !f.fade ? 'stripe' : f.fade ? 'fade' : 'split') : 'solid';
  const sheen = f.metal ? 'metal' : f.matte ? 'matte' : f.pearl ? 'pearl' : f.candy ? 'candy' : 'gloss';
  const sn = rgb2hex(contrast(c1, BLACK) > contrast(c1, WHITE) ? BLACK : WHITE);
  const tag = w.source === 'board' ? 'Spec render · from the order sheet' : 'Spec render';
  return `<div class="spec spec-${mode} sh-${sheen}${f.flake ? ' flk' : ''}" style="--c1:${rgb2hex(c1)};--c2:${rgb2hex(c2)};--c3:${rgb2hex(c3)};--sn:${sn}"><i class="sp-paint"></i><i class="sp-sheen"></i><i class="sp-flk"></i><span class="sp-tag">${tag}</span><svg class="sp-w" viewBox="0 0 479.9 423.9" aria-hidden="true"><use href="#wlogo"/></svg><span class="sp-name" aria-hidden="true">${esc(w.body || w.title)}</span></div>`;
}
function mediaHTML(w, lazy) {
  if (w.image) return `<img src="${esc(w.image)}" alt="${esc(w.alt || w.title)}"${lazy ? ' loading="lazy"' : ''} decoding="async">`;
  return specHTML(w);
}

const palCache = new Map();
function paletteForImage(w, i, img) {
  const apply = res => {
    if (!res) return;
    w.pal = paletteFrom(res.cols, i); w.swatches = res.swatches; w.palFrom = 'photo';
    const t = workTiles[i]; if (t) { t.style.setProperty('--wacc', w.pal.hex.acc); t.style.setProperty('--won', w.pal.hex.on); }
    worksZones.forEach(z => { if (z.work === i) z.pal = w.pal; });
    surfaces.forEach(s => { s.last = null; });
    themeDirty = true; wake();
    if (dIdx === i && ovr && !ovr.live) { themeTo(w.pal, 500); renderPalette(w); }
  };
  if (palCache.has(w.image)) { apply(palCache.get(w.image)); return; }
  const run = im => { let res = null; try { res = extractImage(im); } catch (e) { res = null; } palCache.set(w.image, res); apply(res); };
  const sameOrigin = new URL(w.image).origin === location.origin;
  if (sameOrigin) { if (img.complete && img.naturalWidth) run(img); else img.addEventListener('load', () => run(img), { once: true }); return; }
  const probe = new Image(); probe.crossOrigin = 'anonymous';
  probe.onload = () => run(probe); probe.onerror = () => palCache.set(w.image, null);
  probe.src = w.image;
}

function renderWorks(list, studio) {
  works = list;
  const any = list.length > 0;
  worksSec.hidden = !any;
  $$('[data-nav="works"]').forEach(a => { a.hidden = !any; });
  renumber();
  renderContact(studio);
  if (!any) { workTiles = []; return; }
  const nStudio = list.filter(w => w.source === 'studio').length, nBoard = list.length - nStudio;
  $('.works-count').textContent = `${pad2(list.length)} ${list.length === 1 ? 'work' : 'works'}`;
  $('.works-src').innerHTML = nBoard && !nStudio
    ? `Finished orders from the order board <b>on this device</b>, shown as spec renders drawn from each paint spec. Only you can see these; add photos to <b>works.json</b> to publish them.`
    : nBoard ? `Studio portfolio, followed by finished orders from the order board <b>on this device</b> (only visible here).`
    : `Work from the studio. Each piece sets its own colors, taken from the paint in the photo.`;
  grid.innerHTML = list.map((w, i) => `
    <a class="work lay-${i % 6}" href="#work/${encodeURIComponent(w.slug)}" data-i="${i}" data-cursor="view" data-cursor-label="View" style="--wacc:${w.pal.hex.acc};--won:${w.pal.hex.on}">
      <div class="work-media"><div class="wm-in">${mediaHTML(w, true)}</div><i class="wk-cor a"></i><i class="wk-cor b"></i><span class="work-view"><span>View work</span><span class="arr" aria-hidden="true">→</span></span></div>
      <div class="work-meta"><span class="wk-n" style="--i:0">${pad2(i + 1)}</span><span class="wk-t" style="--i:1">${esc(w.title)}</span><span class="wk-y" style="--i:2">${esc(w.when)}</span>${w.spec ? `<span class="wk-s" style="--i:3">${esc(w.spec)}</span>` : ''}</div>
    </a>`).join('');
  workTiles = $$('.work', grid);
  workTiles.forEach((t, i) => {
    revealIO.observe(t);
    const img = $('img', t);
    if (img && !(list[i].colors && list[i].colors.length)) paletteForImage(list[i], i, img);
  });
  revealIO.observe($('.works-title'));
}
function renderContact(studio) {
  const box = $('#poCta'); if (!box) return;
  const wa = waNumber(studio && studio.whatsapp), ig = String((studio && studio.instagram) || '').replace(/^@/, '').replace(/[^\w.]/g, '');
  const arr = '<span class="arr" aria-hidden="true"><span>→</span><span>→</span></span>';
  let h = '';
  if (wa) h += `<a class="btn mag" href="https://wa.me/${wa}" target="_blank" rel="noopener"><span>Pre-order on WhatsApp</span>${arr}</a>`;
  if (ig) h += `<a class="btn mag" href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener"><span>@${esc(ig)}</span>${arr}</a>`;
  box.innerHTML = h; box.hidden = !h;
  $$('.mag', box).forEach(magnet);
}

/* =====================================================================
   WORK DETAIL — shared-element open, color-led transitions between works
   ===================================================================== */
const detail = $('#detail'), dMedia = $('#dMedia'), dTitle = $('#dTitle'), dFields = $('#dFields'), dPal = $('#dPal');
let dIdx = -1, dBusy = false, dByNav = false, dReturn = null;
const inView = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < VH && r.right > 0 && r.left < VW; };
function renderPalette(w) {
  const lbl = w.palFrom === 'photo' ? 'Palette — extracted from the photo' : w.palFrom === 'spec' ? 'Palette — read from the paint spec' : w.palFrom === 'listed' ? 'Palette' : '';
  dPal.innerHTML = w.swatches.length ? `<p>${lbl}</p><div class="d-sw">${w.swatches.slice(0, 5).map(h => `<span><i style="background:${h}"></i>${h}</span>`).join('')}</div>` : '';
}
function fillDetail(i) {
  const w = works[i], n = works.length;
  $('.d-idx', detail).innerHTML = `<b>${pad2(i + 1)}</b> / ${pad2(n)}`;
  $('.d-kick', detail).textContent = w.source === 'board' ? 'From the order board · this device only' : 'W.PROJECT · Studio work';
  splitInto(dTitle, 'chars', esc(w.title));
  const rows = [];
  if (w.body) rows.push(['Body', w.body]);
  if (w.spec) rows.push(['Paint spec', w.spec]);
  if (w.qty) rows.push(['Quantity', `${w.qty} ${w.qty === 1 ? 'body' : 'bodies'}`]);
  if (w.when) rows.push([w.whenLabel, w.when]);
  dFields.innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  renderPalette(w);
  dMedia.innerHTML = mediaHTML(w, false);
  const img = $('img', dMedia);
  const setAr = () => { if (img && img.naturalWidth) dMedia.style.setProperty('--ar', `${img.naturalWidth}/${img.naturalHeight}`); };
  dMedia.style.setProperty('--ar', '4/5');
  if (img) { if (img.complete) setAr(); else img.addEventListener('load', setAr, { once: true }); if (w.palFrom !== 'photo' && !(w.colors && w.colors.length)) paletteForImage(w, i, img); }
  const nx = works[(i + 1) % n];
  $('#dNextCard .dn-t').textContent = nx.title;
  $('#dNextCard').href = '#work/' + encodeURIComponent(nx.slug);
  $('#dPrev').disabled = $('#dNext').disabled = n < 2;
  $('#dNextCard').hidden = n < 2;
}
function flip(fromEl, toRect, fromRect, dur) {
  const c = D.createElement('div'); c.className = 'flip';
  c.innerHTML = fromEl.innerHTML;
  Object.assign(c.style, { left: fromRect.left + 'px', top: fromRect.top + 'px', width: fromRect.width + 'px', height: fromRect.height + 'px' });
  D.body.appendChild(c);
  const a = c.animate([
    { left: fromRect.left + 'px', top: fromRect.top + 'px', width: fromRect.width + 'px', height: fromRect.height + 'px' },
    { left: toRect.left + 'px', top: toRect.top + 'px', width: toRect.width + 'px', height: toRect.height + 'px' },
  ], { duration: dur, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'forwards' });
  return a.finished.then(() => c, () => c);
}
function openWork(i) {
  if (!works[i]) return;
  const first = dIdx < 0;
  if (!first) { if (i !== dIdx) stepTo(i, i > dIdx ? 1 : -1); return; }
  dIdx = i; dBusy = true;
  dReturn = D.activeElement;
  resetCursor();
  fillDetail(i);
  detail.hidden = false; detail.scrollTop = 0;
  followPal(detail, true);
  detail.classList.add('pre');
  R.classList.add('lock');
  closeMenu();
  themeTo(works[i].pal, RM ? 1 : 850);
  const tile = workTiles[i], tm = tile && $('.wm-in', tile);
  const go = () => { detail.classList.add('show'); requestAnimationFrame(() => requestAnimationFrame(() => detail.classList.remove('pre'))); };
  if (!RM && tm && inView(tm)) {
    const from = tm.getBoundingClientRect();
    dMedia.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const to = dMedia.getBoundingClientRect();
      go();
      flip(tm, to, from, 900).then(c => { dMedia.style.visibility = ''; c.remove(); dBusy = false; });
    });
  } else {
    go();
    if (!RM) dMedia.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 900, easing: 'cubic-bezier(.76,0,.24,1)' });
    setTimeout(() => { dBusy = false; }, RM ? 0 : 700);
  }
  setTimeout(() => $('#dClose').focus({ preventScroll: true }), RM ? 0 : 450);
}
async function stepTo(ni, dir) {
  if (dBusy || ni === dIdx) return;
  dBusy = true;
  const w = works[ni];
  if (RM) { dIdx = ni; fillDetail(ni); themeTo(w.pal, 1); detail.scrollTop = 0; dBusy = false; history.replaceState(null, '', '#work/' + encodeURIComponent(w.slug)); return; }
  // 1. the current work scales out while the text leaves
  detail.classList.add('leave');
  const old = dMedia.firstElementChild;
  if (old) old.animate([{ transform: 'none', opacity: 1 }, { transform: `scale(.86) translate3d(${-dir * 6}%,0,0)`, opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'forwards' });
  // 2–4. the whole environment moves to the next work's colors; corners and frame follow
  themeTo(w.pal, 1000, 120);
  $$('.d-cor', detail).forEach(c => c.animate([{ transform: 'none' }, { transform: `translate3d(${dir * 28}px,0,0)` }, { transform: 'none' }], { duration: 1000, easing: 'cubic-bezier(.65,0,.35,1)' }));
  await wait(330);
  detail.scrollTo({ top: 0 });
  dIdx = ni;
  fillDetail(ni);
  detail.classList.remove('leave'); detail.classList.add('pre');
  void detail.offsetWidth;
  requestAnimationFrame(() => detail.classList.remove('pre'));
  // 5. the next work enters with a directional mask
  const nw = dMedia.firstElementChild;
  dMedia.animate([{ clipPath: dir > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 950, easing: 'cubic-bezier(.76,0,.24,1)' });
  if (nw) nw.animate([{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 1400, easing: 'cubic-bezier(.16,1,.3,1)' });
  history.replaceState(null, '', '#work/' + encodeURIComponent(w.slug));
  await wait(650);
  dBusy = false;
}
function closeWork() {
  if (dIdx < 0) return;
  const i = dIdx; dIdx = -1;
  resetCursor();
  const tile = workTiles[i], tm = tile && $('.wm-in', tile);
  if (tile && !inView(tile)) { const r = tile.getBoundingClientRect(); scrollTo({ top: scrollY + r.top - (VH - r.height) / 2, behavior: 'instant' }); }
  scrollDirty = true; themeDirty = true;
  themeRelease(RM ? 1 : 800);
  detail.classList.add('leave');
  const end = () => {
    detail.hidden = true; detail.classList.remove('show', 'leave', 'pre');
    followPal(detail, false);
    dMedia.innerHTML = ''; R.classList.remove('lock'); dBusy = false;
    const back = tile || dReturn; if (back && back.focus) back.focus({ preventScroll: true });
  };
  if (!RM && tm && dMedia.firstElementChild) {
    const from = dMedia.getBoundingClientRect(), to = tm.getBoundingClientRect();
    dMedia.style.visibility = 'hidden';
    detail.classList.remove('show');
    flip(dMedia, to, from, 800).then(c => { dMedia.style.visibility = ''; c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 }).finished.then(() => c.remove(), () => c.remove()); end(); });
  } else { detail.classList.remove('show'); setTimeout(end, RM ? 0 : 420); }
}
function requestClose() {
  if (dByNav) { dByNav = false; history.back(); }
  else { history.replaceState(null, '', location.pathname + location.search + '#works'); closeWork(); }
}
function onHash() {
  const m = /^#work\/(.+)$/.exec(location.hash);
  if (m) {
    const slug = decodeURIComponent(m[1]), i = works.findIndex(w => w.slug === slug);
    if (i >= 0) openWork(i);
    return;
  }
  if (dIdx >= 0) closeWork();
}
addEventListener('hashchange', onHash);
grid.addEventListener('click', e => { if (e.target.closest('.work')) dByNav = true; });
$('#dClose').addEventListener('click', requestClose);
$('#dPrev').addEventListener('click', () => stepTo((dIdx - 1 + works.length) % works.length, -1));
$('#dNext').addEventListener('click', () => stepTo((dIdx + 1) % works.length, 1));
$('#dNextCard').addEventListener('click', e => { e.preventDefault(); stepTo((dIdx + 1) % works.length, 1); });
detail.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); requestClose(); }
  else if (e.key === 'ArrowRight' && works.length > 1) stepTo((dIdx + 1) % works.length, 1);
  else if (e.key === 'ArrowLeft' && works.length > 1) stepTo((dIdx - 1 + works.length) % works.length, -1);
  else if (e.key === 'Tab') trap(e, detail);
});
function trap(e, box) {
  const f = $$('a[href]:not([hidden]),button:not([disabled])', box).filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && D.activeElement === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && D.activeElement === z) { e.preventDefault(); a.focus(); }
}

/* =====================================================================
   HEADER, NAV, MENU, PROGRESS
   ===================================================================== */
const hdr = $('#hdr'), prog = $('#progress'), navInk = $('.nav-ink'), navLinks = $$('#nav a[data-nav]');
let navTargets = [], activeNav = null, hdrUp = false, lastDir = 0;
function renumber() {
  let n = 0;
  ['manifesto', 'craft', 'process', 'works', 'preorder'].forEach(id => {
    const sec = D.getElementById(id); if (!sec || sec.hidden) return;
    const k = pad2(++n);
    $$(`[data-sec="${id}"]`).forEach(e => { e.textContent = k; });
    $$(`[data-nav="${id}"] .n`).forEach(e => { e.textContent = k; });
  });
}
function measureNav() {
  navTargets = navLinks.filter(a => !a.hidden).map(a => { const s = D.getElementById(a.dataset.nav); return { a, id: a.dataset.nav, top: s.getBoundingClientRect().top + scrollY }; });
}
function chrome(sy) {
  prog.style.transform = `scaleX(${clamp(sy / Math.max(1, docH - VH)).toFixed(4)})`;
  hdr.classList.toggle('solid', sy > 30);
  const dy = sy - (chrome.y || 0); chrome.y = sy;
  if (Math.abs(dy) > 2) lastDir = dy > 0 ? 1 : -1;
  const up = sy > VH * .9 && lastDir > 0 && !R.classList.contains('menu-open');
  if (up !== hdrUp) { hdrUp = up; hdr.classList.toggle('up', up); }
  let act = null;
  navTargets.forEach(t => { if (t.top <= sy + VH * .45) act = t; });
  if (act !== activeNav) {
    activeNav = act;
    navLinks.forEach(a => a.removeAttribute('aria-current'));
    $$('.menu-nav a').forEach(a => a.removeAttribute('aria-current'));
    if (act) { act.a.setAttribute('aria-current', 'true'); const m = $(`.menu-nav a[data-nav="${act.id}"]`); if (m) m.setAttribute('aria-current', 'true'); }
    placeInk();
  }
}
function placeInk() {
  if (!activeNav) { navInk.style.transform = `translateX(${navInk.style.getPropertyValue('--x') || 0}px) scaleX(0)`; return; }
  const a = activeNav.a, t = $('.t', a);
  const x = a.offsetLeft + t.offsetLeft, w = t.offsetWidth;
  navInk.style.setProperty('--x', x);
  navInk.style.transform = `translateX(${x}px) scaleX(${w / 100})`;
}
const menu = $('#menu'), menuBtn = $('#menuBtn');
[hdr, $('.progress'), menu, $('#cursor')].forEach(el => followPal(el, true));
$$('.menu-nav a').forEach((a, i) => a.style.setProperty('--i', i));
function openMenu() {
  const r = menuBtn.getBoundingClientRect();
  menu.style.setProperty('--ox', (r.left + r.width / 2) + 'px'); menu.style.setProperty('--oy', (r.top + r.height / 2) + 'px');
  R.classList.add('menu-open', 'lock'); menu.classList.add('open'); hdr.classList.remove('up'); hdrUp = false;
  menuBtn.setAttribute('aria-expanded', 'true'); $('.mb-t', menuBtn).textContent = 'Close';
  setTimeout(() => { const f = $('.menu-nav a:not([hidden])', menu); if (f) f.focus({ preventScroll: true }); }, 300);
}
function closeMenu(focusBtn) {
  if (!menu.classList.contains('open')) return;
  menu.classList.remove('open'); R.classList.remove('menu-open'); if (dIdx < 0) R.classList.remove('lock');
  menuBtn.setAttribute('aria-expanded', 'false'); $('.mb-t', menuBtn).textContent = 'Menu';
  if (focusBtn) menuBtn.focus({ preventScroll: true });
}
menuBtn.addEventListener('click', () => (menu.classList.contains('open') ? closeMenu() : openMenu()));
menu.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
D.addEventListener('keydown', e => {
  if (!menu.classList.contains('open')) return;
  if (e.key === 'Escape') closeMenu(true);
  else if (e.key === 'Tab') { const f = [menuBtn, ...$$('.menu-nav a:not([hidden])', menu)]; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && D.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && D.activeElement === z) { e.preventDefault(); a.focus(); } }
});

/* =====================================================================
   CURSOR + MAGNETIC ELEMENTS (mouse / trackpad only)
   ===================================================================== */
const cursor = $('#cursor'), cLabel = $('.cursor-label', cursor);
const cur = { x: -100, y: -100, rx: -100, ry: -100, on: false };
function cursorJob() {
  cur.rx += (cur.x - cur.rx) * .2; cur.ry += (cur.y - cur.ry) * .2;
  cursor.style.transform = `translate3d(${cur.rx.toFixed(1)}px,${cur.ry.toFixed(1)}px,0)`;
  cur.on = Math.abs(cur.x - cur.rx) + Math.abs(cur.y - cur.ry) > .3;
  return cur.on;
}
if (FINE && !RM) {
  addEventListener('pointermove', e => {
    if ((e.pointerType !== 'mouse' && e.pointerType !== 'pen') || (!e.clientX && !e.clientY)) return;
    cur.x = e.clientX; cur.y = e.clientY;
    cursor.classList.remove('off');
    const t = e.target.closest && e.target.closest('[data-cursor],a,button,input,label');
    const s = t ? (t.dataset.cursor && t.dataset.cursor !== 'link' ? t.dataset.cursor : 'link') : '';
    if (cursor.dataset.s !== s) {
      cursor.dataset.s = s; cLabel.textContent = t && t.dataset.cursorLabel ? t.dataset.cursorLabel : '';
      const wa = t && t.style.getPropertyValue('--wacc');
      cursor.style.setProperty('--cacc', wa || ''); cursor.style.setProperty('--con', (t && t.style.getPropertyValue('--won')) || '');
    }
    if (!cur.on) { cur.on = true; addJob(cursorJob); }
  }, { passive: true });
  addEventListener('mouseout', e => { if (!e.relatedTarget) cursor.classList.add('off'); });
  addEventListener('pointerdown', () => cursor.classList.add('down'));
  addEventListener('pointerup', () => cursor.classList.remove('down'));
}
function resetCursor() { if (cursor) { cursor.dataset.s = ''; cLabel.textContent = ''; } }
function magnet(el) {
  if (!FINE || RM || el.dataset.mag) return;
  el.dataset.mag = '1';
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    el.style.transform = `translate3d(${(dx * Math.min(18, r.width * .22)).toFixed(1)}px,${(dy * Math.min(14, r.height * .3)).toFixed(1)}px,0)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
}
$$('.mag').forEach(magnet);

/* =====================================================================
   OBSERVERS
   ===================================================================== */
const revealIO = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  revealIO.unobserve(e.target);
}), { rootMargin: '0px 0px -12% 0px', threshold: .08 });
$$('.split[data-split="chars"]:not(.mf-title)').forEach(el => revealIO.observe(el));

const stepIO = new IntersectionObserver(es => es.forEach(e => {
  if (horiz || !e.isIntersecting) return;
  e.target.classList.add('on', 'cur');
}), { threshold: .3 });
steps.forEach(s => stepIO.observe(s));

new IntersectionObserver(es => es.forEach(e => { heroVisible = e.isIntersecting; if (heroVisible) startParallax(); })).observe(hero);
new IntersectionObserver(es => es.forEach(e => {
  bandVisible = e.isIntersecting;
  if (bandVisible && !RM && !mqOn) { mqOn = true; scrollVel = 0; vel = 0; addJob(marqueeJob); }
})).observe($('.band'));

/* =====================================================================
   FIT TEXT + MEASURE
   ===================================================================== */
function fitText() {
  $$('.fit').forEach(el => {
    const inner = $('.fit-in', el); if (!inner) return;
    el.style.fontSize = '100px';
    const w = inner.getBoundingClientRect().width;
    if (w) el.style.fontSize = (100 * el.clientWidth / w * .995).toFixed(2) + 'px';
  });
}
function measureAll() {
  VW = innerWidth; VH = innerHeight;
  if (rulerCur) { const r = rulerCur.parentNode.getBoundingClientRect(); ruler.l = r.left; ruler.w = r.width - 2; }
  fitText();
  measureProcess();
  fillMarquees();
  const sy = scrollY;
  scenes.forEach(s => {
    const r = s.el.getBoundingClientRect();
    s.top = r.top + sy; s.h = s.el.offsetHeight;
    const st = $('.stick', s.el); s.sh = st ? st.offsetHeight : 0;
  });
  docH = R.scrollHeight;
  measureNav(); placeInk();
  buildSurfaces();
  heroP = -1; stripQ = -1; floodQ = -1; mfCache.clear();
  scrollDirty = true; wake();
}
let rzT = 0, lastW = innerWidth, lastH = innerHeight;
addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    // Phones resize the window as the address bar shows and hides; only re-measure for real changes.
    if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120 && !FINE) return;
    lastW = innerWidth; lastH = innerHeight;
    measureAll();
  }, 140);
});
wideMQ.addEventListener && wideMQ.addEventListener('change', measureAll);

/* =====================================================================
   BOOT
   ===================================================================== */
renumber();
measureAll();
intro();
if (D.fonts && D.fonts.ready) D.fonts.ready.then(measureAll);
addEventListener('load', measureAll);
loadWorks().then(({ studio, list }) => {
  renderWorks(list, studio);
  measureAll();
  if (/^#work\//.test(location.hash)) onHash();
});
})();
