/* ============================================================
   PERLIN NOISE
   Generates smooth pseudo-random values across 3 dimensions
   (x, y, time) used to drive the contour animation.
   ============================================================ */

(function () {
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14) ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  window.noise3 = function (x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A  = perm[X] + Y,     AA = perm[A] + Z,     AB = perm[A + 1] + Z;
    const B  = perm[X + 1] + Y, BA = perm[B] + Z,     BB = perm[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(perm[AA],     x,     y,     z), grad(perm[BA],     x - 1, y,     z), u),
        lerp(grad(perm[AB],     x,     y - 1, z), grad(perm[BB],     x - 1, y - 1, z), u), v),
      lerp(
        lerp(grad(perm[AA + 1], x,     y,     z - 1), grad(perm[BA + 1], x - 1, y,     z - 1), u),
        lerp(grad(perm[AB + 1], x,     y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
})();


/* ============================================================
   CANVAS SETUP
   ============================================================ */

const canvas = document.getElementById('bg-canvas');
const ctx    = canvas.getContext('2d');
let W, H;

function resizeCanvas() {
  W = canvas.width  = window.innerWidth  * devicePixelRatio;
  H = canvas.height = window.innerHeight * devicePixelRatio;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);


/* ============================================================
   ANIMATION CONFIG
   ============================================================ */

const config = {
  speed:      1 * 0.00006,
  numLines:   15,
  noiseScale: 370,
};

const STROKE = [78, 204, 163];
const BG     = [10, 14, 26];


/* ============================================================
   SETTINGS PANEL & SLIDERS
   ============================================================ */

const panel       = document.getElementById('panel');
const toggleBtn   = document.getElementById('toggleBtn');
const slidersEl   = document.getElementById('sliders');
const speedSlider = document.getElementById('speedSlider');
const linesSlider = document.getElementById('linesSlider');
const scaleSlider = document.getElementById('scaleSlider');
const speedVal    = document.getElementById('speedVal');
const linesVal    = document.getElementById('linesVal');
const scaleVal    = document.getElementById('scaleVal');

function updateSliderLabels() {
  speedVal.textContent = speedSlider.value;
  linesVal.textContent = linesSlider.value;
  scaleVal.textContent = scaleSlider.value;
}
updateSliderLabels();

speedSlider.addEventListener('input', (e) => { config.speed      = e.target.value * 0.00006; updateSliderLabels(); });
linesSlider.addEventListener('input', (e) => { config.numLines   = +e.target.value;           updateSliderLabels(); });
scaleSlider.addEventListener('input', (e) => { config.noiseScale = +e.target.value;           updateSliderLabels(); });

let panelOpen = false;

toggleBtn.addEventListener('click', () => {
  panelOpen = !panelOpen;
  slidersEl.classList.toggle('open', panelOpen);
  toggleBtn.textContent = panelOpen ? '× Close' : '+ Open Me';
});

// Show panel only while the hero section is visible
const heroSection = document.getElementById('hero');

const heroVisibilityObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
      // Auto-close sliders when scrolling away
      panelOpen = false;
      slidersEl.classList.remove('open');
      toggleBtn.textContent = '+ Open Me';
    }
  });
}, { threshold: 0.3 });

heroVisibilityObserver.observe(heroSection);


/* ============================================================
   MARCHING SQUARES
   Finds contour lines in the noise field via linear
   interpolation at each grid cell edge.
   ============================================================ */

function interpolate(v0, v1, level) {
  if (Math.abs(v1 - v0) < 1e-6) return 0;
  return (level - v0) / (v1 - v0);
}

function drawContour(field, cols, rows, cellW, cellH, level) {
  ctx.beginPath();

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const i  = row * cols + col;
      const tl = field[i];
      const tr = field[i + 1];
      const bl = field[i + cols];
      const br = field[i + cols + 1];
      const x  = col * cellW;
      const y  = row * cellH;

      const tlAbove = tl >= level ? 1 : 0;
      const trAbove = tr >= level ? 1 : 0;
      const blAbove = bl >= level ? 1 : 0;
      const brAbove = br >= level ? 1 : 0;
      const idx = tlAbove * 8 + trAbove * 4 + brAbove * 2 + blAbove;

      // All corners same side — no contour line through this cell
      if (idx === 0 || idx === 15) continue;

      // Edge midpoint functions
      const top    = () => [x + interpolate(tl, tr, level) * cellW, y];
      const right  = () => [x + cellW, y + interpolate(tr, br, level) * cellH];
      const bottom = () => [x + interpolate(bl, br, level) * cellW, y + cellH];
      const left   = () => [x, y + interpolate(tl, bl, level) * cellH];

      // Segment table: each entry is [pointA, pointB] or [pointA, pointB, pointC, pointD] for saddle cases
      const segments = {
        1:  [left, bottom],
        2:  [bottom, right],
        3:  [left, right],
        4:  [right, top],
        5:  [left, top, right, bottom],
        6:  [bottom, top],
        7:  [left, top],
        8:  [top, left],
        9:  [top, bottom],
        10: [right, bottom, top, left],
        11: [top, right],
        12: [right, left],
        13: [bottom, right],
        14: [left, bottom],
      };

      const seg = segments[idx];
      if (!seg) continue;

      if (seg.length === 2) {
        const [x1, y1] = seg[0]();
        const [x2, y2] = seg[1]();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      } else {
        // Saddle point — draw two separate line segments
        const [x1, y1] = seg[0]();
        const [x2, y2] = seg[1]();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const [x3, y3] = seg[2]();
        const [x4, y4] = seg[3]();
        ctx.moveTo(x3, y3);
        ctx.lineTo(x4, y4);
      }
    }
  }

  ctx.stroke();
}


/* ============================================================
   ANIMATION LOOP
   ============================================================ */

const GRID_SIZE = 4; // px per noise sample — lower = more detail, slower
let   elapsedTime = 0;
let   lastTimestamp = null;

function frame(timestamp) {
  if (lastTimestamp === null) lastTimestamp = timestamp;
  elapsedTime += (timestamp - lastTimestamp) * config.speed;
  lastTimestamp = timestamp;

  const [br, bg, bb] = BG;
  const [sr, sg, sb] = STROKE;

  // Clear
  ctx.fillStyle = `rgb(${br}, ${bg}, ${bb})`;
  ctx.fillRect(0, 0, W, H);

  // Build noise field
  const cellW  = GRID_SIZE;
  const cellH  = GRID_SIZE;
  const cols   = Math.ceil(W / cellW) + 1;
  const rows   = Math.ceil(H / cellH) + 1;
  const scale  = config.noiseScale * devicePixelRatio;
  const field  = new Float32Array(cols * rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const nx = (col * cellW) / scale;
      const ny = (row * cellH) / scale;
      // Three octaves for organic layering
      field[row * cols + col] =
        noise3(nx,        ny,        elapsedTime)        * 0.6 +
        noise3(nx * 2.1,  ny * 2.1,  elapsedTime * 1.3)  * 0.3 +
        noise3(nx * 4.3,  ny * 4.3,  elapsedTime * 1.7)  * 0.1;
    }
  }

  // Draw contour lines
  const minLevel = -0.7;
  const maxLevel =  0.7;

  for (let i = 0; i < config.numLines; i++) {
    const level      = minLevel + (i / (config.numLines - 1)) * (maxLevel - minLevel);
    const midFalloff = Math.pow(1 - Math.abs(i / (config.numLines - 1) - 0.5) * 2, 0.7);
    const alpha      = (0.15 + 0.55 * midFalloff) * 0.75;
    const lineWidth  = (i % 5 === 0) ? 1.5 * devicePixelRatio : 0.7 * devicePixelRatio;

    ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${alpha})`;
    ctx.lineWidth   = lineWidth;
    drawContour(field, cols, rows, cellW, cellH, level);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);


/* ============================================================
   TYPEWRITER EFFECT
   ============================================================ */

const HERO_TEXT  = "I'm Anna";
const typewriterEl = document.getElementById('typewriter');
const cursorEl     = document.getElementById('cursor');
const heroSubEl    = document.getElementById('heroSub');
let charIndex = 0;

function typeNextChar() {
  if (charIndex < HERO_TEXT.length) {
    typewriterEl.textContent += HERO_TEXT[charIndex++];
    const delay = charIndex === 1 ? 120 : 80 + Math.random() * 60;
    setTimeout(typeNextChar, delay);
  } else {
    // Typing done — hide cursor, reveal subtitle
    setTimeout(() => {
      cursorEl.classList.add('done');
      heroSubEl.classList.add('visible');
    }, 500);
  }
}

setTimeout(typeNextChar, 800);


/* ============================================================
   SCROLL BUTTON
   ============================================================ */

document.getElementById('scrollBtn').addEventListener('click', () => {
  document.getElementById('work').scrollIntoView({ behavior: 'smooth' });
});


/* ============================================================
   SCROLL REVEAL
   Fades elements in as they enter the viewport.
   ============================================================ */

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));
