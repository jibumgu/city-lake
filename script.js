(() => {
  // Two cities face each other. The colored city hangs from the top edge, and its mirror image stands on the bottom edge in black.
  // One drop at a time leaves the tip of the needle tower, and the bottom city fills with color from its base upward.
  // The fill takes exactly three minutes. When it is full, drops rise back and the colors return to the top city.
  const N = 90;                  // drops per phase, about one every two seconds
  const PHASE_S = 180;           // seconds for all the color to cross (three minutes)
  const PAUSE_S = 2;             // rest between the two directions
  const BEAD_S = 0.35;           // a bead swells on the tip before it lets go
  const FALL_S = 1.0;            // flight time between the two tips
  const SETTLE_S = 0.55;         // time for the color to settle after a drop lands
  const GAP_S = (PHASE_S - BEAD_S - FALL_S - SETTLE_S) / (N - 1);
  const CYCLE = 2 * (PHASE_S + PAUSE_S);
  const NEEDLE_X = 0.62;         // needle tower position, as a fraction of the width
  const INK = '#090a10';
  // One dusk gradient runs across the whole skyline; each building takes the hue at its position.
  const STOPS = [
    [0.0, [78, 92, 214]],    // indigo
    [0.3, [168, 78, 208]],   // violet
    [0.55, [255, 96, 128]],  // rose
    [0.8, [255, 150, 74]],   // orange
    [1.0, [255, 204, 92]],   // gold
  ];

  const canvas = document.getElementById('art');
  const ctx = canvas.getContext('2d');

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rgb = c => `rgb(${c.map(v => Math.round(clamp(v, 0, 255))).join(',')})`;
  const mix = (c, d, t) => c.map((v, i) => v + (d[i] - v) * t);
  function sampleStops(x) {
    x = clamp(x, 0, 1);
    for (let i = 1; i < STOPS.length; i++) {
      if (x <= STOPS[i][0]) {
        const [x0, c0] = STOPS[i - 1], [x1, c1] = STOPS[i];
        return mix(c0, c1, (x - x0) / (x1 - x0));
      }
    }
    return STOPS[STOPS.length - 1][1];
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Skyline description (fractions of the screen, so it scales) ----------
  const ROOFS = ['flat', 'flat', 'flat', 'stepped', 'stepped', 'setback', 'setback', 'slanted', 'slanted', 'mast', 'mast', 'spire', 'tank'];
  function makeSpecs() {
    const rnd = mulberry32(21);
    const specs = [];
    let x = -0.015;
    while (x < 1.03) {
      const w = 0.015 + rnd() * 0.03;
      let h = 0.46 + 0.2 * Math.sin(x * 6.1 + 0.7) + 0.1 * Math.sin(x * 17.3) + (rnd() - 0.5) * 0.3;
      if (rnd() < 0.18) h += 0.18 + rnd() * 0.14;
      if (Math.abs(x + w / 2 - NEEDLE_X) < 0.07) h = Math.min(h, 0.45);
      h = clamp(h, 0.2, 0.88);
      specs.push({ x, w, h, roof: ROOFS[Math.floor(rnd() * ROOFS.length)], tone: clamp(x + w / 2 + (rnd() - 0.5) * 0.08, 0, 1), light: rnd(), seed: rnd() });
      x += w * (0.82 + rnd() * 0.16);
    }
    return specs;
  }
  const SPECS = makeSpecs();

  // ---------- Layout ----------
  // The skyline is built standing on the bottom edge. The top city is the same drawing, turned upside down.
  let W = 0, H = 0, dpr = 1;
  let Vw = 0, offsetX = 0;       // skyline width, and how far its left edge is cropped off the screen
  let groundY = 0, Ht = 0, tipX = 0, topTipY = 0, botTipY = 0;
  let buildings = [], cityPath = null;

  function roofPath(p, spec, x0, w, top) {
    const Hh = Ht;
    switch (spec.roof) {
      case 'stepped': {
        const up = Hh * 0.1;
        p.rect(x0 + w * 0.18, top - up, w * 0.64, up + 1);
        p.rect(x0 + w * 0.34, top - up * 1.7, w * 0.32, up * 0.7 + 1);
        break;
      }
      case 'spire': p.moveTo(x0 + w * 0.38, top + 1); p.lineTo(x0 + w / 2, top - Hh * 0.14); p.lineTo(x0 + w * 0.62, top + 1); p.closePath(); break;
      case 'slanted': p.moveTo(x0, top + 1); p.lineTo(x0, top - w * 0.1); p.lineTo(x0 + w, top - w * 0.75); p.lineTo(x0 + w, top + 1); p.closePath(); break;
      case 'mast': {
        p.rect(x0 + w * 0.46, top - Hh * 0.12, Math.max(2, w * 0.07), Hh * 0.12 + 1);
        p.rect(x0 + w * 0.3, top - Hh * 0.075, w * 0.4, 2);
        break;
      }
      case 'tank': {
        p.rect(x0 + w * 0.3, top - Hh * 0.045, w * 0.4, Hh * 0.045 + 1);
        p.moveTo(x0 + w * 0.26, top - Hh * 0.045); p.lineTo(x0 + w * 0.5, top - Hh * 0.085); p.lineTo(x0 + w * 0.74, top - Hh * 0.045); p.closePath();
        break;
      }
      case 'setback': p.rect(x0 + w * 0.12, top - Hh * 0.06, w * 0.76, Hh * 0.06 + 1); break;
      default: p.rect(x0 - 1, top - 3, w + 2, 4);
    }
  }

  function buildCity() {
    buildings = [];
    const cw = clamp(Vw * 0.0042, 3, 6.5);
    const ch = cw * 1.5;
    const px = cw * 1.9, py = ch * 1.75;

    SPECS.forEach(spec => {
      const x0 = spec.x * W, w = spec.w * W;
      const top = groundY - spec.h * Ht;
      const p = new Path2D();
      p.rect(x0, top, w, groundY - top);
      roofPath(p, spec, x0, w, top);
      const windows = [];
      const cols = Math.max(0, Math.floor((w - cw) / px) + 1);
      const rows = Math.max(0, Math.floor((groundY - top - ch * 2) / py));
      const mx = (w - ((cols - 1) * px + cw)) / 2;
      let s = spec.seed * 9973;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          s = (s * 16807) % 2147483647;
          const q = s / 2147483647;
          if (q < 0.5) windows.push({ x: x0 + mx + c * px, y: top + ch * 1.3 + r * py, w: cw, h: ch, ph: (q * 977) % 1 });
        }
      }
      const base = sampleStops(spec.tone);
      const colors = [rgb(mix(base, [255, 255, 255], 0.05 + spec.light * 0.12)), rgb(mix(base, [10, 6, 30], 0.28 + spec.light * 0.12))];
      buildings.push({ path: p, windows, top, colors });
    });

    // The needle tower: a tapered shaft, an observation disc, a thin upper shaft, and a needle.
    const cx = NEEDLE_X * W;
    tipX = cx;
    botTipY = groundY - Ht;
    topTipY = Ht;
    const wb = Vw * 0.034, wt = Vw * 0.013;
    const yDisc = groundY - Ht * 0.6, yUp = groundY - Ht * 0.85;
    const n = new Path2D();
    n.moveTo(cx - wb / 2, groundY); n.lineTo(cx - wt / 2, yDisc); n.lineTo(cx + wt / 2, yDisc); n.lineTo(cx + wb / 2, groundY); n.closePath();
    n.ellipse(cx, yDisc - Ht * 0.012, Vw * 0.03, Ht * 0.03, 0, 0, 2 * Math.PI);
    n.rect(cx - Vw * 0.0035, yUp, Vw * 0.007, yDisc - yUp);
    n.ellipse(cx, yUp + Ht * 0.02, Vw * 0.014, Ht * 0.014, 0, 0, 2 * Math.PI);
    n.moveTo(cx - Vw * 0.0035, yUp + 1); n.lineTo(cx, botTipY); n.lineTo(cx + Vw * 0.0035, yUp + 1); n.closePath();
    buildings.push({ path: n, windows: [], top: botTipY, colors: ['#ffe08a', '#ff8a3d'] });

    cityPath = new Path2D();
    buildings.forEach(b => cityPath.addPath(b.path));
    buildings.forEach(b => {
      const g = ctx.createLinearGradient(0, b.top, 0, groundY);
      g.addColorStop(0, b.colors[0]);
      g.addColorStop(1, b.colors[1]);
      b.grad = g;
    });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    groundY = H;
    Ht = H * 0.32;
    // On narrow screens the skyline stays as wide as it is on a wide screen and is cropped around the needle tower.
    Vw = Math.max(W, H * 1.25);
    const needleOnScreen = Vw > W ? 0.5 : NEEDLE_X;
    offsetX = clamp(NEEDLE_X * Vw - needleOnScreen * W, 0, Vw - W);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildCity();
  }

  // ---------- Schedule ----------
  const launchAt = k => k * GAP_S + BEAD_S;
  const landAt = k => launchAt(k) + FALL_S;
  function sourceLevel(tp) {      // fraction already given up by the source city
    let s = 0;
    for (let k = 0; k < N; k++) s += smooth((tp - k * GAP_S) / (BEAD_S + 0.25));
    return s / N;
  }
  function destLevel(tp) {        // fraction already received by the destination city
    let s = 0;
    for (let k = 0; k < N; k++) s += smooth((tp - landAt(k)) / SETTLE_S);
    return s / N;
  }

  // ---------- Drawing ----------
  // Rolling waves along the surface of the color, on both cities.
  const waveY = (x, line, t) =>
    line + Math.sin(x * 0.014 + t * 1.6) * 6.5 + Math.sin(x * 0.037 - t * 2.2) * 3.2 + Math.sin(x * 0.083 + t * 3.1) * 1.2;

  function wavePath(line, t, far) {
    const p = new Path2D();
    p.moveTo(0, waveY(0, line, t));
    for (let x = 6; x <= W + 6; x += 6) p.lineTo(x, waveY(x, line, t));
    p.lineTo(W + 6, far); p.lineTo(0, far); p.closePath();
    return p;
  }

  function waveLine(line, t) {
    ctx.beginPath();
    ctx.moveTo(0, waveY(0, line, t));
    for (let x = 6; x <= W + 6; x += 6) ctx.lineTo(x, waveY(x, line, t));
  }

  function drawWindows(b, t) {
    for (const w of b.windows) {
      let a = 0.82;
      if (w.ph > 0.8) a *= 0.6 + 0.4 * Math.sin(t * 2.6 + w.ph * 60);
      ctx.fillStyle = `rgba(255, 247, 224, ${a.toFixed(3)})`;
      ctx.fillRect(w.x, w.y, w.w, w.h);
    }
  }

  // f is the colored fraction. The hanging city is the same skyline mirrored about the screen's center line.
  function drawCity(f, t, hanging) {
    const mirror = () => { ctx.translate(0, H); ctx.scale(1, -1); };

    ctx.save();
    if (hanging) mirror();
    ctx.fillStyle = INK;
    ctx.fill(cityPath);
    ctx.restore();

    if (f <= 0.0005) return;
    // Standing city: color rises from the base. Hanging city: color is held at the base and empties from the tips.
    const line = hanging ? lerp(-16, Ht + 16, f) : lerp(H + 16, H - Ht - 16, f);
    const region = wavePath(line, t, hanging ? -30 : H + 30);

    ctx.save();
    ctx.clip(region);
    if (hanging) mirror();
    buildings.forEach(b => {
      ctx.fillStyle = b.grad;
      ctx.fill(b.path);
      drawWindows(b, t);
    });
    ctx.restore();

    // Bright wave lines where the color meets the black, only inside the buildings.
    if (f < 0.9995) {
      ctx.save();
      if (hanging) mirror();
      ctx.clip(cityPath);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const into = hanging ? -1 : 1;     // direction toward the colored side
      waveLine(line, t);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      waveLine(line + into * 7, t + 0.8);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      waveLine(line + into * 15, t + 1.7);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  // A plain, flat drop: one color from the city's palette, stretched slightly along its direction of travel.
  // Neighboring drops step around the palette by the golden ratio, so the colors keep varying.
  const dropColor = k => sampleStops((k * 0.618034) % 1);
  function drawDrop(x, y, r, rising, color) {
    ctx.save();
    ctx.fillStyle = rgb(color);
    ctx.beginPath();
    ctx.ellipse(x, y + (rising ? -r * 0.4 : r * 0.4), r * 0.78, r * 1.45, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // What happens where a drop arrives: a ring spreading from the tip and a small spray.
  function drawArrival(x, y, age, sprayDir, r, color) {
    if (age < 0) return;
    if (age < 0.9) {
      const a = age / 0.9;
      ctx.strokeStyle = `rgba(${color.map(Math.round).join(',')}, ${(0.75 * (1 - a)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * (1.2 + a * 9), 0, 2 * Math.PI);
      ctx.stroke();
    }
    if (age < 0.7) {
      const fade = Math.pow(1 - age / 0.7, 0.6).toFixed(3);
      for (let j = 0; j < 7; j++) {
        const ang = (j - 3) * 0.32;
        const sp = 190 + j * 18;
        const px = x + Math.sin(ang) * sp * age * 0.7;
        const py = y + sprayDir * (Math.cos(ang) * sp * age - 450 * age * age);
        // The spray fans across the whole palette, from indigo to gold.
        ctx.fillStyle = `rgba(${sampleStops(j / 6).map(Math.round).join(',')}, ${fade})`;
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  function drawBackdrop() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#f2ece0');
    sky.addColorStop(0.5, '#f7f3ea');
    sky.addColorStop(1, '#f2ece0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  function frame(now) {
    const t = now / 1000;
    const cyc = t % CYCLE;
    let phase = -1, tp = 0, fTop = 1, fBot = 0;
    if (cyc < PHASE_S) {
      phase = 0; tp = cyc;
      fTop = 1 - sourceLevel(tp); fBot = destLevel(tp);
    } else if (cyc < PHASE_S + PAUSE_S) {
      fTop = 0; fBot = 1;
    } else if (cyc < 2 * PHASE_S + PAUSE_S) {
      phase = 1; tp = cyc - PHASE_S - PAUSE_S;
      fBot = 1 - sourceLevel(tp); fTop = destLevel(tp);
    } else {
      fTop = 1; fBot = 0;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackdrop();
    drawCity(fBot, t, false);
    drawCity(fTop, t, true);

    // The two cities rest on the screen edges.
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, 4);
    ctx.fillRect(0, H - 4, W, 4);

    // Drops, beads, rings, and sprays
    const r = clamp(Vw * 0.0042, 3.6, 6.5);
    if (phase >= 0) {
      const srcY = phase === 0 ? topTipY : botTipY;
      const dstY = phase === 0 ? botTipY : topTipY;
      const dir = phase === 0 ? 1 : -1;          // +1 moves down the screen
      for (let k = 0; k < N; k++) {
        const l = launchAt(k), land = landAt(k);
        if (tp >= k * GAP_S && tp < l) {
          const s = smooth((tp - k * GAP_S) / BEAD_S);
          drawDrop(tipX, srcY + dir * r * 1.6 * s, r * s, phase === 1, dropColor(k));
        } else if (tp >= l && tp < land) {
          const u = (tp - l) / FALL_S;
          const start = srcY + dir * r * 1.6;
          const travel = dstY - start;
          // Falling speeds up; rising slows down, like the same fall played backward.
          const e = phase === 0 ? u * u : 1 - (1 - u) * (1 - u);
          drawDrop(tipX, start + travel * e, r, phase === 1, dropColor(k));
        }
        if (tp >= land) drawArrival(tipX, dstY, tp - land, phase === 0 ? -1 : 1, r, dropColor(k));
      }
    }
    requestAnimationFrame(frame);
  }

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
