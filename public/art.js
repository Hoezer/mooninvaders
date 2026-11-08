// Top-down "cutaway" floor-plan illustrations for every piece.
// Each piece is drawn as a room seen from above: thick walls, a floor texture per race,
// furniture with soft shadows, and doorways exactly where the piece has entrances/exits.
// Art.get(type, w, h) returns a cached canvas for the piece at rotation 0 (render.js rotates it).
(function () {
  const MI = window.MI;
  const TAU = Math.PI * 2;
  const cache = new Map();

  // ---------- helpers ----------
  function rng(seed) { let s = Math.abs(seed) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function hash(str) { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 2147483647; return h; }
  const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); };
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); else c.rect(x, y, w, h); }
  function lin(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  function rad(c, x, y, r, stops) { const g = c.createRadialGradient(x, y, 0, x, y, Math.max(0.1, r)); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; }
  function glow(c, x, y, r, col, a = 1) { c.save(); c.globalAlpha = a; c.fillStyle = rad(c, x, y, r, [col, 'rgba(0,0,0,0)']); circle(c, x, y, r); c.fill(); c.restore(); }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  // soft drop shadow for furniture
  function sh(c, u, on = true) {
    if (!on) { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0; return; }
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = u * 0.6; c.shadowOffsetX = u * 0.18; c.shadowOffsetY = u * 0.25;
  }

  // ---------- sci-fi palette per race (set per drawing) ----------
  const PAL = {
    humans:   { base: '#273142', seam: '#141a24', led: '#38bdf8', wall: '#2b3647', rim: '#4a5a72' },
    lustroms: { base: '#173236', seam: '#0b1c1f', led: '#2dd4bf', wall: '#1d3b3c', rim: '#3f6f6a' },
    machines: { base: '#2e3238', seam: '#15181c', led: '#f59e0b', wall: '#30353c', rim: '#555c66' },
    bozob:    { base: '#2a1636', seam: '#12081a', led: '#a3e635', wall: '#2e1840', rim: '#57306b' },
    shared:   { base: '#262e3a', seam: '#121820', led: '#39ff9f', wall: '#262f3d', rim: '#4b5a6e' },
  };
  let P = PAL.shared;

  // bevelled station floor plates with vents and bolts
  function scifiFloor(c, x, y, w, h, u, r) {
    c.fillStyle = P.seam; c.fillRect(x, y, w, h);
    const p = u * 7.5;
    for (let py = y; py < y + h; py += p) for (let px = x; px < x + w; px += p) {
      const q = p - u * 0.35;
      c.fillStyle = shade(P.base, (r() - 0.5) * 0.06); c.fillRect(px, py, q, q);
      c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(px, py, q, u * 0.3); c.fillRect(px, py, u * 0.3, q);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(px, py + q - u * 0.3, q, u * 0.3); c.fillRect(px + q - u * 0.3, py, u * 0.3, q);
      const k = r();
      if (k < 0.22) { c.fillStyle = 'rgba(0,0,0,.28)'; for (let i = 0; i < 4; i++) rr(c, px + q * 0.2, py + q * (0.22 + i * 0.16), q * 0.6, q * 0.07, u * 0.2), c.fill(); }
      else if (k < 0.32) { c.strokeStyle = 'rgba(0,0,0,.22)'; c.lineWidth = u * 0.25; circle(c, px + q / 2, py + q / 2, q * 0.28); c.stroke(); circle(c, px + q / 2, py + q / 2, q * 0.12); c.stroke(); }
      else if (k < 0.5) { c.fillStyle = 'rgba(0,0,0,.3)'; [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].forEach(([a, b]) => { circle(c, px + q * a, py + q * b, u * 0.3); c.fill(); }); }
      else if (k < 0.56) { c.fillStyle = P.led; c.globalAlpha = 0.8; c.fillRect(px + q * 0.1, py + q * 0.46, q * 0.8, u * 0.3); c.globalAlpha = 1; }
    }
  }

  // ---------- floors ----------
  const FLOOR = {
    wood(c, x, y, w, h, u, r, tone = '#a9784a') {
      c.fillStyle = tone; c.fillRect(x, y, w, h);
      const pw = u * 1.6;
      for (let px = x, i = 0; px < x + w; px += pw, i++) {
        let py = y - r() * u * 6;
        while (py < y + h) {
          const len = u * (5 + r() * 6);
          c.fillStyle = shade(tone, (r() - 0.5) * 0.25);
          c.fillRect(px, py, pw - 0.6, len - 0.6);
          c.strokeStyle = 'rgba(60,30,10,.18)'; c.lineWidth = 0.5;
          for (let g = 0; g < 2; g++) { const gx = px + pw * (0.25 + g * 0.45); c.beginPath(); c.moveTo(gx, py); c.bezierCurveTo(gx + u * 0.2, py + len * 0.3, gx - u * 0.2, py + len * 0.6, gx, py + len); c.stroke(); }
          py += len;
        }
      }
    },
    tile(c, x, y, w, h, u, r, base = '#cfcac2', size = 4) {
      c.fillStyle = base; c.fillRect(x, y, w, h);
      const ts = u * size;
      for (let ty = y; ty < y + h; ty += ts) for (let tx = x; tx < x + w; tx += ts) {
        c.fillStyle = shade(base, (r() - 0.5) * 0.12); c.fillRect(tx + 0.5, ty + 0.5, ts - 1, ts - 1);
        c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 0.5;
        for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(tx + ts * r(), ty + ts * r(), ts * (0.2 + r() * 0.4), r() * 6, r() * 6 + 1.5); c.stroke(); }
      }
    },
    metal(c, x, y, w, h, u, r) {
      c.fillStyle = lin(c, x, y, x + w, y + h, ['#7c8592', '#5b636e', '#6e7783']); c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(255,255,255,.18)';
      const st = u * 1.6;
      for (let yy = y, row = 0; yy < y + h; yy += st, row++) for (let xx = x + (row % 2) * st / 2; xx < x + w; xx += st) {
        c.save(); c.translate(xx, yy); c.rotate(row % 2 ? 0.7 : -0.7); c.fillRect(-u * 0.45, -u * 0.12, u * 0.9, u * 0.24); c.restore();
      }
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 0.8;
      for (let xx = x + u * 8; xx < x + w; xx += u * 8) { c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y + h); c.stroke(); }
    },
    pearl(c, x, y, w, h, u, r) {
      c.fillStyle = '#0b1f22'; c.fillRect(x, y, w, h);
      const R = u * 2.2, hgt = R * Math.sqrt(3);
      for (let row = 0, yy = y; yy < y + h + hgt; yy += hgt / 2, row++) for (let xx = x + (row % 2) * R * 1.5; xx < x + w + R; xx += R * 3) {
        c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6; c.lineTo(xx + Math.cos(a) * R * 0.94, yy + Math.sin(a) * R * 0.94); } c.closePath();
        c.fillStyle = rad(c, xx - R * 0.3, yy - R * 0.3, R * 1.2, [r() > 0.85 ? '#5eead4' : '#1f6b68', '#0f3a3c']); c.fill();
      }
      for (let i = 0; i < 6; i++) glow(c, x + r() * w, y + r() * h, u * 3, r() > 0.5 ? 'rgba(255,150,230,.5)' : 'rgba(160,255,240,.5)');
    },
    slime(c, x, y, w, h, u, r) {
      c.fillStyle = '#2a1036'; c.fillRect(x, y, w, h);
      for (let i = 0; i < 26; i++) {
        const sx = x + r() * w, sy = y + r() * h, sr = u * (1.5 + r() * 2.5);
        c.fillStyle = shade('#4a1f5c', (r() - 0.5) * 0.4); c.beginPath(); c.ellipse(sx, sy, sr, sr * 0.75, r() * 3, 0, TAU); c.fill();
      }
      c.strokeStyle = 'rgba(160,255,60,.5)'; c.lineWidth = u * 0.25;
      for (let i = 0; i < 4; i++) { let px = x + r() * w, py = y + r() * h; c.beginPath(); c.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * u * 8; py += (r() - 0.5) * u * 8; c.lineTo(px, py); } c.stroke(); }
      for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(140,240,40,.55)'; c.beginPath(); c.ellipse(x + r() * w, y + r() * h, u * 2.5, u * 1.5, r() * 3, 0, TAU); c.fill(); }
    },
    carpet(c, x, y, w, h, u, r, col = '#5b6b8c') {
      c.fillStyle = col; c.fillRect(x, y, w, h);
      for (let i = 0; i < 400; i++) { c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; c.fillRect(x + r() * w, y + r() * h, 1, 1); }
    },
    grass(c, x, y, w, h, u, r) {
      c.fillStyle = '#3f7d3a'; c.fillRect(x, y, w, h);
      for (let i = 0; i < 260; i++) { c.strokeStyle = r() > 0.5 ? '#5aa04f' : '#2f6a2c'; c.lineWidth = 0.7; const gx = x + r() * w, gy = y + r() * h; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + (r() - 0.5) * u, gy - u * 0.8); c.stroke(); }
    },
  };

  // space-station look: every "normal" floor becomes station plating in the race palette
  const themeFloor = (c, x, y, w, h, u, r) => (RACE === 'lustroms' ? PEARL : RACE === 'bozob' ? SLIME : scifiFloor)(c, x, y, w, h, u, r);
  const PEARL = FLOOR.pearl, SLIME = FLOOR.slime;
  FLOOR.wood = FLOOR.tile = FLOOR.carpet = FLOOR.metal = themeFloor;

  // ---------- furniture (top view) ----------
  const F = {
    plant(c, x, y, r, rnd, col = '#2f8f46') {
      sh(c, r * 0.4); c.fillStyle = '#e5e7eb'; circle(c, x, y, r * 0.55); c.fill(); sh(c, 0, false);
      c.save(); c.strokeStyle = P.led; c.shadowColor = P.led; c.shadowBlur = r * 0.4; c.lineWidth = Math.max(0.6, r * 0.08); circle(c, x, y, r * 0.5); c.stroke(); c.restore();
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU + rnd(), l = r * (0.7 + rnd() * 0.4);
        c.fillStyle = shade(col, (rnd() - 0.4) * 0.5);
        c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.ellipse(l * 0.55, 0, l * 0.55, r * 0.22, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(l, 0); c.stroke(); c.restore();
      }
    },
    rug(c, x, y, r, col = '#9a9187') {
      c.fillStyle = col; circle(c, x, y, r); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 0.8;
      for (let k = 1; k < 5; k++) { circle(c, x, y, r * k / 5); c.stroke(); }
    },
    bed(c, x, y, w, h, u, col = '#6b5aa6', sheet = '#f1f1ee') {
      sh(c, u); c.fillStyle = shade(col, -0.2); rr(c, x, y, w, h, u * 0.6); c.fill(); sh(c, 0, false);
      c.fillStyle = col; rr(c, x + u * 0.3, y + u * 0.3, w - u * 0.6, h - u * 0.6, u * 0.5); c.fill();
      c.fillStyle = '#fafaf7'; rr(c, x + w * 0.12, y + u * 0.8, w * 0.34, h * 0.16, u * 0.6); c.fill(); rr(c, x + w * 0.54, y + u * 0.8, w * 0.34, h * 0.16, u * 0.6); c.fill();
      c.fillStyle = sheet; c.beginPath(); c.moveTo(x + u * 0.5, y + h * 0.32); c.lineTo(x + w - u * 0.5, y + h * 0.28); c.lineTo(x + w - u * 0.5, y + h - u * 0.6); c.lineTo(x + u * 0.5, y + h - u * 0.6); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 0.6;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x + w * (0.15 + i * 0.2), y + h * 0.35); c.quadraticCurveTo(x + w * (0.25 + i * 0.2), y + h * 0.6, x + w * (0.12 + i * 0.22), y + h * 0.9); c.stroke(); }
      c.fillStyle = shade(sheet, -0.1); c.fillRect(x + u * 0.5, y + h * 0.28, w - u, h * 0.06);
      c.save(); c.strokeStyle = P.led; c.shadowColor = P.led; c.shadowBlur = u * 2; c.lineWidth = u * 0.3; rr(c, x - u * 0.2, y - u * 0.2, w + u * 0.4, h + u * 0.4, u * 0.8); c.stroke(); c.restore();
    },
    sofa(c, x, y, w, h, u, col = '#8b8f94', cush = '#3f8f7c') {
      sh(c, u); c.fillStyle = shade(col, -0.15); rr(c, x, y, w, h, u * 0.7); c.fill(); sh(c, 0, false);
      c.fillStyle = col; rr(c, x + u * 0.9, y + u * 0.9, w - u * 1.8, h - u * 0.9, u * 0.4); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + w / 2, y + u * 0.9); c.lineTo(x + w / 2, y + h); c.stroke();
      c.fillStyle = cush; c.save(); c.translate(x + w * 0.27, y + h * 0.45); c.rotate(0.3); rr(c, -u * 0.9, -u * 0.9, u * 1.8, u * 1.8, u * 0.4); c.fill(); c.restore();
    },
    table(c, x, y, w, h, u, wood = '#9b6a3f', chairs = '#3d6b5e') {
      c.fillStyle = chairs;
      const cw = u * 1.6;
      for (let i = 0; i < 2; i++) { sh(c, u * 0.6); rr(c, x + w * (0.2 + i * 0.45), y - cw * 0.6, cw, cw, u * 0.4); c.fill(); rr(c, x + w * (0.2 + i * 0.45), y + h - cw * 0.4, cw, cw, u * 0.4); c.fill(); }
      sh(c, u); c.fillStyle = lin(c, x, y, x + w, y + h, ['#f8fafc', '#cbd5e1']); rr(c, x, y, w, h, u * 0.8); c.fill(); sh(c, 0, false);
      c.save(); c.strokeStyle = P.led; c.shadowColor = P.led; c.shadowBlur = u * 2; c.lineWidth = u * 0.3; rr(c, x + u * 0.5, y + u * 0.5, w - u, h - u, u * 0.5); c.stroke(); c.restore();
      c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 0.5; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x, y + h * i / 4); c.lineTo(x + w, y + h * i / 4); c.stroke(); }
    },
    roundTable(c, x, y, r, u, top = '#e8dcc8', chair = '#b0413e', n = 4) {
      c.fillStyle = chair; for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.4; sh(c, u * 0.5); circle(c, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, r * 0.38); c.fill(); }
      sh(c, u); c.fillStyle = top; circle(c, x, y, r); c.fill(); sh(c, 0, false);
    },
    desk(c, x, y, w, h, u) {
      sh(c, u); c.fillStyle = '#d7dbe0'; rr(c, x, y, w, h, u * 0.2); c.fill(); sh(c, 0, false);
      c.fillStyle = '#1f2937'; rr(c, x + w * 0.3, y + h * 0.15, w * 0.4, h * 0.18, u * 0.1); c.fill();
      c.fillStyle = '#38bdf8'; c.fillRect(x + w * 0.32, y + h * 0.17, w * 0.36, h * 0.12);
      c.fillStyle = '#4b5563'; rr(c, x + w * 0.35, y + h + u * 0.3, w * 0.3, u * 2, u * 0.5); c.fill();
    },
    counter(c, x, y, w, h, u, top = '#8a8580') {
      sh(c, u); c.fillStyle = top; c.fillRect(x, y, w, h); sh(c, 0, false);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x, y, w, h * 0.15);
    },
    sink(c, x, y, s) { c.fillStyle = '#e6e2dc'; rr(c, x, y, s, s * 0.8, s * 0.15); c.fill(); c.fillStyle = '#b9b3aa'; rr(c, x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.56, s * 0.12); c.fill(); c.fillStyle = '#555'; circle(c, x + s / 2, y + s * 0.08, s * 0.06); c.fill(); },
    stove(c, x, y, s) { c.fillStyle = '#1f1f1f'; c.fillRect(x, y, s, s); c.strokeStyle = '#f5f5f5'; c.lineWidth = s * 0.04; [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].forEach(([a, b]) => { circle(c, x + s * a, y + s * b, s * 0.13); c.stroke(); }); },
    toilet(c, x, y, s) { sh(c, s * 0.2); c.fillStyle = '#f4f4f2'; rr(c, x, y, s, s * 0.35, s * 0.08); c.fill(); c.beginPath(); c.ellipse(x + s / 2, y + s * 0.7, s * 0.4, s * 0.45, 0, 0, TAU); c.fill(); sh(c, 0, false); c.fillStyle = '#dcdcd8'; c.beginPath(); c.ellipse(x + s / 2, y + s * 0.72, s * 0.25, s * 0.3, 0, 0, TAU); c.fill(); },
    crate(c, x, y, s, u, col = '#a0703c') {
      sh(c, u); c.fillStyle = col; c.fillRect(x, y, s, s); sh(c, 0, false);
      c.strokeStyle = shade(col, -0.4); c.lineWidth = s * 0.07; c.strokeRect(x + s * 0.05, y + s * 0.05, s * 0.9, s * 0.9);
      c.beginPath(); c.moveTo(x + s * 0.1, y + s * 0.1); c.lineTo(x + s * 0.9, y + s * 0.9); c.stroke();
    },
    barrel(c, x, y, r, u, col = '#2f5f8a') {
      sh(c, u); c.fillStyle = col; circle(c, x, y, r); c.fill(); sh(c, 0, false);
      c.strokeStyle = shade(col, -0.4); c.lineWidth = r * 0.12; circle(c, x, y, r * 0.75); c.stroke();
      c.fillStyle = rad(c, x - r * 0.3, y - r * 0.3, r, ['rgba(255,255,255,.35)', 'rgba(255,255,255,0)']); circle(c, x, y, r); c.fill();
    },
    machine(c, x, y, w, h, u, col = '#6b7280') {
      sh(c, u); c.fillStyle = col; rr(c, x, y, w, h, u * 0.4); c.fill(); sh(c, 0, false);
      c.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 4; i++) c.fillRect(x + w * 0.15, y + h * (0.2 + i * 0.12), w * 0.5, h * 0.05);
      c.fillStyle = '#ef4444'; circle(c, x + w * 0.82, y + h * 0.2, u * 0.4); c.fill();
      c.fillStyle = '#22c55e'; circle(c, x + w * 0.82, y + h * 0.36, u * 0.4); c.fill();
    },
    gear(c, x, y, r, teeth, col, rot = 0) {
      c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.beginPath();
      for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * TAU, d = i % 2 ? r * 0.78 : r; c.lineTo(Math.cos(a - 0.13) * d, Math.sin(a - 0.13) * d); c.lineTo(Math.cos(a + 0.13) * d, Math.sin(a + 0.13) * d); }
      c.closePath(); c.fill(); c.fillStyle = 'rgba(0,0,0,.4)'; circle(c, 0, 0, r * 0.3); c.fill(); c.restore();
    },
    tree(c, x, y, r, rnd, col = '#2e8b57') {
      sh(c, r * 0.3);
      for (let i = 0; i < 6; i++) { c.fillStyle = shade(col, (rnd() - 0.5) * 0.4); circle(c, x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r, r * (0.45 + rnd() * 0.3)); c.fill(); }
      sh(c, 0, false);
      c.fillStyle = 'rgba(255,255,255,.12)'; circle(c, x - r * 0.25, y - r * 0.25, r * 0.35); c.fill();
    },
    eye(c, x, y, r, iris = '#b4ff39') {
      c.fillStyle = '#f5f0ff'; c.beginPath(); c.ellipse(x, y, r, r * 0.72, 0, 0, TAU); c.fill();
      c.fillStyle = iris; circle(c, x, y, r * 0.5); c.fill();
      c.fillStyle = '#100018'; c.beginPath(); c.ellipse(x, y, r * 0.14, r * 0.42, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; circle(c, x - r * 0.22, y - r * 0.22, r * 0.12); c.fill();
    },
    lamp(c, x, y, u, col = 'rgba(255,220,150,.7)') { glow(c, x, y, u * 5, col); c.fillStyle = '#fff6da'; circle(c, x, y, u * 0.7); c.fill(); },
    screen(c, x, y, w, h, u) { sh(c, u); c.fillStyle = '#0f172a'; c.fillRect(x, y, w, h); sh(c, 0, false); c.fillStyle = lin(c, x, y, x + w, y, ['#22d3ee', '#6366f1', '#ec4899']); c.fillRect(x + u * 0.3, y + u * 0.3, w - u * 0.6, h - u * 0.6); },
  };

  // ---- 3D recording: in floor-only mode, solid furniture is recorded (position, size, colours) instead of painted,
  // so the 3D view can build it as real objects at exactly the same spot as the 2D art.
  let REC = null;
  const SOLID = { bed: 'rect', sofa: 'rect', table: 'rect', desk: 'rect', counter: 'rect', machine: 'rect', screen: 'rect',
    sink: 'sq', stove: 'sq', toilet: 'sq', crate: 'sq', plant: 'circ', barrel: 'circ', tree: 'circ', roundTable: 'circ' };
  for (const k of Object.keys(F)) {
    const orig = F[k];
    F[k] = function (c, ...a) {
      if (!REC || !SOLID[k]) return orig.call(this, c, ...a);
      const m = c.getTransform(), kind = SOLID[k];
      let cx, cy, w, h, r = 0;
      if (kind === 'rect') { cx = a[0] + a[2] / 2; cy = a[1] + a[3] / 2; w = a[2]; h = a[3]; }
      else if (kind === 'sq') { const sz = a[2]; cx = a[0] + sz / 2; cy = a[1] + sz / 2; w = h = sz; }
      else { cx = a[0]; cy = a[1]; r = a[2]; w = h = r * 2; }
      const px = m.a * cx + m.c * cy + m.e, py = m.b * cx + m.d * cy + m.f;
      const sc = Math.hypot(m.a, m.b) || 1;
      REC.push({ k, x: px, y: py, w: w * sc, h: h * sc, r: r * sc, ang: Math.atan2(m.b, m.a), cols: a.filter((v) => typeof v === 'string'), n: k === 'roundTable' ? (a[6] || 4) : 0 });
    };
  }

  // ---------- room frame in perspective: rim, inner wall faces, windows, sliding doors ----------
  function frame(c, type, w, h, u) {
    const d = MI.PIECES[type], cells = d.cells;
    const mx = Math.max(...cells.map((k) => k.dx)), my = Math.max(...cells.map((k) => k.dy));
    const cw = w / (mx + 1), ch = h / (my + 1);
    const t = Math.max(1.5, u * 1.6), T = u * 6.5;
    const pt = (s, a, dd) => {
      if (s === 0 || s === 2) { const sc = dd <= t ? 1 : (w - 2 * dd) / (w - 2 * t); return [w / 2 + (a - w / 2) * sc, s === 0 ? dd : h - dd]; }
      const sc = dd <= t ? 1 : (h - 2 * dd) / (h - 2 * t); return [s === 3 ? dd : w - dd, h / 2 + (a - h / 2) * sc];
    };
    const quad = (s, a0, a1, d0, d1) => { c.beginPath(); [[a0, d0], [a1, d0], [a1, d1], [a0, d1]].forEach(([a, dd], i) => { const [x, y] = pt(s, a, dd); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); };
    const line = (s, a0, d0, a1, d1) => { const [x0, y0] = pt(s, a0, d0), [x1, y1] = pt(s, a1, d1); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); };
    const glowStroke = (col, lw, blur) => { c.save(); c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = blur; c.lineWidth = lw; c.stroke(); c.restore(); };
    const SIDES = [
      { s: 0, L: w, segs: cells.filter((k) => k.dy === 0).map((k) => [k.dx * cw, (k.dx + 1) * cw, k.e[0]]), f: 0.02 },
      { s: 3, L: h, segs: cells.filter((k) => k.dx === 0).map((k) => [k.dy * ch, (k.dy + 1) * ch, k.e[3]]), f: -0.08 },
      { s: 1, L: h, segs: cells.filter((k) => k.dx === mx).map((k) => [k.dy * ch, (k.dy + 1) * ch, k.e[1]]), f: -0.16 },
      { s: 2, L: w, segs: cells.filter((k) => k.dy === my).map((k) => [k.dx * cw, (k.dx + 1) * cw, k.e[2]]), f: -0.24 },
    ];
    const rnd = rng(hash(type + RACE));
    for (const S of SIDES) {
      const { s, L } = S;
      // inner wall face
      quad(s, t, L - t, t, T);
      const [gx0, gy0] = pt(s, L / 2, t), [gx1, gy1] = pt(s, L / 2, T);
      c.fillStyle = lin(c, gx0, gy0, gx1, gy1, [shade(P.wall, S.f + 0.06), shade(P.wall, S.f - 0.14)]); c.fill();
      // race decoration on the face
      c.save(); quad(s, t, L - t, t, T); c.clip();
      if (RACE === 'humans') {
        c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = Math.max(0.5, u * 0.15);
        line(s, t, t + (T - t) * 0.55, L - t, t + (T - t) * 0.55); c.stroke();
        for (let a = t + u * 6; a < L - t; a += u * 6) { line(s, a, t, a, T); c.stroke(); }
      } else if (RACE === 'lustroms') {
        c.strokeStyle = 'rgba(16,120,100,.55)'; c.lineWidth = u * 0.4;
        c.beginPath(); for (let a = t; a <= L - t; a += u) { const [x, y] = pt(s, a, t + (T - t) * (0.5 + 0.25 * Math.sin(a / u * 0.6))); a === t ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
        for (let a = t + u * 3; a < L - t; a += u * 5) { const [x, y] = pt(s, a, t + (T - t) * (0.5 + 0.25 * Math.sin(a / u * 0.6))); glow(c, x, y, u * 1.4, 'rgba(244,114,182,.9)'); }
      } else if (RACE === 'machines') {
        for (let a = t, k = 0; a < L - t; a += u * 1.6, k++) { quad(s, a, a + u * 0.8, t + (T - t) * 0.72, T); c.fillStyle = '#facc15'; c.fill(); }
        c.strokeStyle = '#8b949e'; c.lineWidth = u * 0.6; line(s, t, t + (T - t) * 0.3, L - t, t + (T - t) * 0.3); c.stroke();
        c.strokeStyle = '#b45309'; c.lineWidth = u * 0.4; line(s, t, t + (T - t) * 0.45, L - t, t + (T - t) * 0.45); c.stroke();
      } else if (RACE === 'bozob') {
        for (let a = t + u * 2; a < L - t; a += u * (2 + rnd() * 4)) { const len = (T - t) * (0.3 + rnd() * 0.6); quad(s, a, a + u * 0.9, t, t + len); c.fillStyle = 'rgba(132,204,22,.75)'; c.fill(); const [x, y] = pt(s, a + u * 0.45, t + len); c.fillStyle = '#a3e635'; circle(c, x, y, u * 0.6); c.fill(); }
      }
      c.restore();
      // things on the wall: windows and screens; doors in the openings
      for (const [a0, a1, e] of S.segs) {
        const segL = a1 - a0, mid = (a0 + a1) / 2;
        if (e === 'w') {
          const kind = rnd();
          if (kind < 0.62) { // viewport window
            const wa0 = a0 + segL * 0.2, wa1 = a1 - segL * 0.2, wd0 = t + (T - t) * 0.16, wd1 = t + (T - t) * 0.8;
            quad(s, wa0, wa1, wd0, wd1); c.fillStyle = RACE === 'bozob' ? '#12001f' : '#030a1f'; c.fill();
            c.save(); quad(s, wa0, wa1, wd0, wd1); c.clip();
            for (let i = 0; i < 14; i++) { const [x, y] = pt(s, wa0 + (wa1 - wa0) * rnd(), wd0 + (wd1 - wd0) * rnd()); c.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; c.fillRect(x, y, 0.9, 0.9); }
            if (rnd() < 0.5) { const [x, y] = pt(s, wa1, wd1); c.fillStyle = rad(c, x, y, segL * 0.35, ['#60a5fa', '#1d4ed8', 'rgba(0,0,0,0)']); circle(c, x, y, segL * 0.35); c.fill(); }
            c.restore();
            quad(s, wa0, wa1, wd0, wd1); c.strokeStyle = RACE === 'machines' ? '#9ca3af' : '#f8fafc'; c.lineWidth = u * 0.45; c.stroke();
            if (RACE === 'machines') { c.lineWidth = u * 0.3; for (let k = 1; k < 4; k++) { line(s, wa0 + (wa1 - wa0) * k / 4, wd0, wa0 + (wa1 - wa0) * k / 4, wd1); c.stroke(); } }
            else { line(s, mid, wd0, mid, wd1); c.lineWidth = u * 0.3; c.stroke(); }
            if (RACE === 'lustroms') { quad(s, wa0, wa1, wd0, wd1); glowStroke('#5eead4', u * 0.3, u * 2); }
          } else { // wall console / screen
            const wa0 = a0 + segL * 0.3, wa1 = a1 - segL * 0.3, wd0 = t + (T - t) * 0.2, wd1 = t + (T - t) * 0.65;
            quad(s, wa0, wa1, wd0, wd1); c.fillStyle = '#0f172a'; c.fill();
            quad(s, wa0 + u * 0.4, wa1 - u * 0.4, wd0 + u * 0.3, wd1 - u * 0.3); c.fillStyle = lin(c, ...pt(s, wa0, wd0), ...pt(s, wa1, wd1), [P.led, '#1e293b']); c.fill();
            for (let k = 0; k < 3; k++) { const [x, y] = pt(s, wa0 + (wa1 - wa0) * (0.25 + k * 0.25), t + (T - t) * 0.82); c.fillStyle = ['#ef4444', '#22c55e', '#facc15'][k]; circle(c, x, y, u * 0.35); c.fill(); }
          }
        } else if (e === 'i' || e === 'o') { // open sci-fi sliding door
          const hw = segL * 0.19;
          // the main floor simply continues through the doorway to the edge of the piece
          c.save(); quad(s, mid - hw, mid + hw, 0, T + u * 2.6); c.clip();
          themeFloor(c, 0, 0, w, h, u, rng(hash(type + RACE)));
          c.restore();
          // the door panels are slid away into the wall on both sides
          for (const [b0, b1] of [[mid - hw - hw * 0.6, mid - hw], [mid + hw, mid + hw + hw * 0.6]]) {
            quad(s, b0, b1, t, T); c.fillStyle = shade(P.wall, 0.15); c.fill(); c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = u * 0.2; c.stroke();
          }
        }
      }
    }
    // wall-top rim (cut) with outlines
    c.fillStyle = P.rim;
    for (const S of SIDES) {
      for (const [a0, a1, e] of S.segs) {
        const segL = a1 - a0, mid = (a0 + a1) / 2, hw = segL * 0.19;
        const parts = e === 'w' ? [[a0, a1]] : [[a0, mid - hw], [mid + hw, a1]];
        for (const [b0, b1] of parts) { quad(S.s, b0, b1, 0, t); c.fill(); }
      }
    }
    // edge lines of the wall top and the floor, interrupted at every doorway
    for (const [dd, col, lw] of [[t, 'rgba(20,24,30,.8)', Math.max(0.6, u * 0.25)], [T, 'rgba(0,0,0,.35)', Math.max(0.5, u * 0.2)]]) {
      c.strokeStyle = col; c.lineWidth = lw;
      for (const S of SIDES) for (const [a0, a1, e] of S.segs) {
        const segL = a1 - a0, mid = (a0 + a1) / 2, hw = segL * 0.19;
        const parts = e === 'w' ? [[a0, a1]] : [[a0, mid - hw], [mid + hw, a1]];
        for (const [b0, b1] of parts) { line(S.s, Math.max(b0, t), dd, Math.min(b1, S.L - t), dd); c.stroke(); }
      }
    }
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = Math.max(0.5, u * 0.2);
    for (const [ax, ay] of [[t, t], [w - t, t], [t, h - t], [w - t, h - t]]) { c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax < w / 2 ? T : w - T, ay < h / 2 ? T : h - T); c.stroke(); }
    return T;
  }

  // ---------- room contents. (c, x, y, w, h, u, r) = interior box inside the walls ----------
  const ROOM = {
    // shared
    hall_cross_out: hallway, hall_cross_in: hallway, hall_half: hallway, hall_corner: hallway,
    landing(c, x, y, w, h, u, r) {
      FLOOR.metal(c, x, y, w, h, u, r);
      const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.38;
      c.fillStyle = '#1f2937'; circle(c, cx, cy, R); c.fill();
      c.strokeStyle = '#facc15'; c.lineWidth = u * 0.8; circle(c, cx, cy, R * 0.92); c.stroke();
      c.setLineDash([u * 1.5, u]); c.strokeStyle = '#39ff9f'; c.lineWidth = u * 0.5; circle(c, cx, cy, R * 0.75); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#e5ffef'; c.font = `900 ${R * 0.8}px Orbitron, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', cx, cy + R * 0.04);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; F.lamp(c, cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12, u * 0.6, 'rgba(255,230,120,.8)'); }
      // parked capsule
      sh(c, u * 1.5); c.fillStyle = '#e2e8f0'; c.beginPath(); c.ellipse(cx + R * 0.95, cy - R * 0.95, R * 0.22, R * 0.38, 0.8, 0, TAU); c.fill(); sh(c, 0, false);
      c.fillStyle = '#38bdf8'; circle(c, cx + R * 0.88, cy - R * 1.02, R * 0.08); c.fill();
      F.crate(c, x + u * 2, y + h - u * 8, u * 5, u, '#b45309'); F.crate(c, x + u * 7.5, y + h - u * 6, u * 4, u, '#92400e');
      F.barrel(c, x + w - u * 4, y + h - u * 4, u * 2.5, u, '#0e7490');
    },
    room_in: guestRoom, room_out: guestRoom,
    dead_end(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#8f8a83', 3);
      c.save(); c.beginPath(); c.rect(x + w * 0.15, y + h * 0.4, w * 0.7, h * 0.2); c.clip();
      c.fillStyle = '#facc15'; c.fillRect(x, y, w, h); c.fillStyle = '#111';
      for (let i = -h; i < w * 2; i += u * 3) { c.beginPath(); c.moveTo(x + i, y + h * 0.6); c.lineTo(x + i + u * 1.5, y + h * 0.6); c.lineTo(x + i + u * 3.5, y + h * 0.4); c.lineTo(x + i + u * 2, y + h * 0.4); c.fill(); }
      c.restore();
      F.barrel(c, x + w * 0.25, y + h * 0.22, u * 2.2, u, '#7f1d1d'); F.crate(c, x + w * 0.6, y + h * 0.68, u * 4, u);
    },
    solar(c, x, y, w, h, u, r) {
      FLOOR.metal(c, x, y, w, h, u, r);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
        const px = x + w * (0.08 + i * 0.46), py = y + h * (0.1 + j * 0.3);
        sh(c, u); c.fillStyle = '#1e3a8a'; c.fillRect(px, py, w * 0.4, h * 0.24); sh(c, 0, false);
        c.strokeStyle = 'rgba(147,197,253,.6)'; c.lineWidth = 0.6;
        for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(px + w * 0.1 * k, py); c.lineTo(px + w * 0.1 * k, py + h * 0.24); c.stroke(); }
        c.beginPath(); c.moveTo(px, py + h * 0.12); c.lineTo(px + w * 0.4, py + h * 0.12); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(px, py); c.lineTo(px + w * 0.15, py); c.lineTo(px, py + h * 0.1); c.fill();
      }
      c.strokeStyle = '#f59e0b'; c.lineWidth = u * 0.5; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.stroke();
    },
    antimatter(c, x, y, w, h, u, r) {
      FLOOR.metal(c, x, y, w, h, u, r);
      [[0.27, 0.5], [0.73, 0.5]].forEach(([fx, fy], i) => {
        const cx = x + w * fx, cy = y + h * fy, R = Math.min(w / 2, h) * 0.32;
        c.fillStyle = '#111827'; circle(c, cx, cy, R * 1.2); c.fill();
        glow(c, cx, cy, R * 1.5, 'rgba(236,72,153,.7)');
        c.strokeStyle = '#f0abfc'; c.lineWidth = u * 0.4;
        for (let k = 0; k < 3; k++) { c.save(); c.translate(cx, cy); c.rotate(k * Math.PI / 3 + i); c.beginPath(); c.ellipse(0, 0, R, R * 0.35, 0, 0, TAU); c.stroke(); c.restore(); }
        glow(c, cx, cy, R * 0.45, 'rgba(255,255,255,1)');
      });
      c.strokeStyle = '#facc15'; c.lineWidth = u * 1.2; c.setLineDash([u * 1.5, u * 1.5]); c.strokeRect(x + u * 1.5, y + u * 1.5, w - u * 3, h - u * 3); c.setLineDash([]);
      F.desk(c, x + w * 0.42, y + h * 0.08, w * 0.16, h * 0.18, u);
    },
    small_storage(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#9b968e', 5);
      const cols = ['#a0703c', '#7c5a34', '#0e7490', '#4d7c0f', '#92400e'];
      for (let i = 0; i < 7; i++) F.crate(c, x + w * (0.05 + i * 0.13), y + h * 0.1, Math.min(w * 0.11, h * 0.3), u, cols[i % 5]);
      for (let i = 0; i < 5; i++) F.barrel(c, x + w * (0.1 + i * 0.19), y + h * 0.72, Math.min(w * 0.06, h * 0.15), u, cols[(i + 2) % 5]);
      // forklift
      sh(c, u); c.fillStyle = '#facc15'; rr(c, x + w * 0.45, y + h * 0.45, w * 0.1, h * 0.18, u * 0.4); c.fill(); sh(c, 0, false);
      c.fillStyle = '#374151'; c.fillRect(x + w * 0.465, y + h * 0.36, w * 0.012, h * 0.1); c.fillRect(x + w * 0.522, y + h * 0.36, w * 0.012, h * 0.1);
    },
    star_meal(c, x, y, w, h, u, r) {
      FLOOR.carpet(c, x, y, w, h, u, r, '#3b2a5a');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const cx = x + w * (0.13 + i * 0.25), cy = y + h * (0.3 + j * 0.42);
        F.roundTable(c, cx, cy, Math.min(w * 0.06, h * 0.12), u, '#fefce8', '#7f1d1d');
        F.lamp(c, cx, cy, u * 0.5, 'rgba(255,190,80,.8)');
      }
      for (let i = 0; i < 9; i++) { c.fillStyle = '#fde047'; const sx = x + w * (0.05 + i * 0.11), sy = y + h * 0.06; c.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - Math.PI / 2, d = k % 2 ? u * 0.4 : u; c.lineTo(sx + Math.cos(a) * d, sy + Math.sin(a) * d); } c.fill(); }
    },
    sunny_bar(c, x, y, w, h, u, r) {
      FLOOR.wood(c, x, y, w, h, u, r, '#8a5a34');
      // curved bar counter
      sh(c, u); c.strokeStyle = '#1f2937'; c.lineWidth = h * 0.12; c.beginPath(); c.arc(x + w / 2, y + h * 0.95, w * 0.35, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); sh(c, 0, false);
      c.strokeStyle = '#fb923c'; c.lineWidth = h * 0.02; c.beginPath(); c.arc(x + w / 2, y + h * 0.95, w * 0.35 - h * 0.05, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      for (let i = 0; i < 5; i++) { const a = Math.PI * (1.15 + i * 0.17); c.fillStyle = '#f59e0b'; sh(c, u * 0.4); circle(c, x + w / 2 + Math.cos(a) * w * 0.47, y + h * 0.95 + Math.sin(a) * w * 0.47, u * 1.2); c.fill(); }
      sh(c, 0, false);
      glow(c, x + w * 0.5, y + h * 0.75, w * 0.3, 'rgba(255,170,60,.6)');
      F.plant(c, x + w * 0.12, y + h * 0.15, u * 3, r); F.plant(c, x + w * 0.88, y + h * 0.15, u * 3, r, '#65a30d');
      F.roundTable(c, x + w * 0.5, y + h * 0.3, u * 2, u, '#fde68a', '#be185d', 3);
    },
    galaxy_zoo(c, x, y, w, h, u, r) {
      FLOOR.grass(c, x, y, w, h, u, r);
      c.fillStyle = 'rgba(56,189,248,.8)'; c.beginPath(); c.ellipse(x + w * 0.7, y + h * 0.7, w * 0.2, h * 0.15, 0.3, 0, TAU); c.fill();
      F.tree(c, x + w * 0.2, y + h * 0.25, u * 4, r); F.tree(c, x + w * 0.8, y + h * 0.2, u * 3, r, '#15803d');
      // alien creature
      c.fillStyle = '#a3e635'; sh(c, u); c.beginPath(); c.ellipse(x + w * 0.42, y + h * 0.6, w * 0.13, h * 0.09, 0.4, 0, TAU); c.fill(); sh(c, 0, false);
      F.eye(c, x + w * 0.36, y + h * 0.54, u * 1.2, '#f472b6'); F.eye(c, x + w * 0.47, y + h * 0.56, u * 1.2, '#f472b6');
      c.strokeStyle = 'rgba(200,210,230,.9)'; c.lineWidth = u * 0.4;
      for (let i = 0; i <= 10; i++) { c.beginPath(); c.moveTo(x + w * i / 10, y + h * 0.85); c.lineTo(x + w * i / 10, y + h); c.stroke(); }
      c.beginPath(); c.moveTo(x, y + h * 0.85); c.lineTo(x + w, y + h * 0.85); c.stroke();
    },
    mim(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#d4cfc6', 4);
      F.counter(c, x + w * 0.08, y + h * 0.62, w * 0.84, h * 0.14, u, '#39ff9f');
      c.fillStyle = '#04150d'; c.font = `900 ${h * 0.1}px Orbitron, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MiM', x + w / 2, y + h * 0.69);
      for (let i = 0; i < 3; i++) { sh(c, u * 0.5); c.fillStyle = ['#facc15', '#93c5fd', '#f472b6'][i]; rr(c, x + w * (0.15 + i * 0.25), y + h * 0.82, w * 0.14, h * 0.1, u * 0.3); c.fill(); }
      sh(c, 0, false);
      for (let i = 0; i < 4; i++) { sh(c, u * 0.6); c.fillStyle = '#e5e7eb'; c.fillRect(x + w * (0.1 + i * 0.22), y + h * 0.2, w * 0.14, h * 0.24); sh(c, 0, false); c.fillStyle = '#2563eb'; c.fillRect(x + w * (0.12 + i * 0.22), y + h * 0.24, w * 0.1, h * 0.04); }
      F.plant(c, x + w * 0.9, y + h * 0.1, u * 2.5, r);
    },

    // boZob
    cake(c, x, y, w, h, u, r) {
      FLOOR.slime(c, x, y, w, h, u, r);
      F.counter(c, x + w * 0.05, y + h * 0.05, w * 0.9, h * 0.16, u, '#3b0764');
      for (let i = 0; i < 3; i++) { const cx = x + w * (0.25 + i * 0.25), cy = y + h * 0.55; sh(c, u); c.fillStyle = '#7c2d12'; circle(c, cx, cy, u * 3); c.fill(); sh(c, 0, false); c.fillStyle = '#f472b6'; circle(c, cx, cy, u * 2.4); c.fill(); for (let k = 0; k < 6; k++) { c.fillStyle = '#b4ff39'; circle(c, cx + Math.cos(k) * u * 1.6, cy + Math.sin(k) * u * 1.6, u * 0.4); c.fill(); } F.eye(c, cx, cy, u * 0.9); }
      F.stove(c, x + w * 0.1, y + h * 0.78, u * 4); F.stove(c, x + w * 0.75, y + h * 0.78, u * 4);
    },
    diet(c, x, y, w, h, u, r) {
      FLOOR.slime(c, x, y, w, h, u, r);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { sh(c, u * 0.6); c.fillStyle = '#b4ff39'; rr(c, x + w * (0.12 + i * 0.28), y + h * (0.2 + j * 0.4), w * 0.12, h * 0.2, u); c.fill(); sh(c, 0, false); c.fillStyle = '#3b0764'; circle(c, x + w * (0.18 + i * 0.28), y + h * (0.25 + j * 0.4), u * 0.8); c.fill(); }
      c.save(); c.translate(x + w / 2, y + h * 0.92); c.scale(-1, 1); c.fillStyle = '#fde047'; c.font = `900 ${h * 0.08}px Orbitron`; c.textAlign = 'center'; c.fillText('DIET', 0, 0); c.restore();
    },
    aura(c, x, y, w, h, u, r) {
      FLOOR.slime(c, x, y, w, h, u, r);
      const cx = x + w / 2, cy = y + h / 2;
      c.strokeStyle = '#d946ef'; c.lineWidth = u * 0.5; circle(c, cx, cy, w * 0.32); c.stroke();
      c.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU * 2 / 5; c.lineTo(cx + Math.cos(a) * w * 0.32, cy + Math.sin(a) * w * 0.32); } c.closePath(); c.stroke();
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; F.lamp(c, cx + Math.cos(a) * w * 0.32, cy + Math.sin(a) * w * 0.32, u * 0.6, 'rgba(180,255,57,.9)'); }
      glow(c, cx, cy, w * 0.2, 'rgba(217,70,239,.7)');
      sh(c, u); c.fillStyle = '#12001a'; circle(c, cx, cy, u * 2.5); c.fill(); sh(c, 0, false);
      c.fillStyle = '#ff2d55'; circle(c, cx - u * 0.7, cy - u * 0.4, u * 0.35); c.fill(); circle(c, cx + u * 0.7, cy - u * 0.4, u * 0.35); c.fill();
    },
    dorex(c, x, y, w, h, u, r) {
      FLOOR.slime(c, x, y, w, h, u, r);
      const cx = x + w / 2, cy = y + h / 2;
      for (let i = 6; i > 0; i--) { c.fillStyle = i % 2 ? '#1a0024' : '#5b1a7a'; circle(c, cx, cy, w * 0.05 * i); c.fill(); }
      c.strokeStyle = '#b4ff39'; c.lineWidth = u * 0.4; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx, cy, w * (0.12 + i * 0.08), i, i + 4); c.stroke(); }
      c.fillStyle = '#fff'; c.font = `900 ${h * 0.2}px Orbitron`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', cx, cy);
      c.strokeStyle = '#a21caf'; c.lineWidth = u * 1.2; c.lineCap = 'round';
      [[0.1, 0.9, 0.3, 0.6], [0.9, 0.9, 0.7, 0.62], [0.1, 0.1, 0.3, 0.35]].forEach(([a, b, d, e]) => { c.beginPath(); c.moveTo(x + w * a, y + h * b); c.quadraticCurveTo(x + w * (a + d) / 2 + u * 3, y + h * (b + e) / 2, x + w * d, y + h * e); c.stroke(); });
      F.eye(c, x + w * 0.85, y + h * 0.15, u * 1.3, '#ff2d55');
    },

    // Lustroms
    jelly(c, x, y, w, h, u, r) {
      FLOOR.pearl(c, x, y, w, h, u, r);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const cx = x + w * (0.2 + i * 0.3), cy = y + h * (0.2 + j * 0.3), R = u * 2.2;
        sh(c, u); c.fillStyle = (i + j) % 2 ? 'rgba(255,120,210,.9)' : 'rgba(120,255,220,.9)'; circle(c, cx, cy, R); c.fill(); sh(c, 0, false);
        c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(cx - R * 0.35, cy - R * 0.35, R * 0.3, R * 0.18, -0.7, 0, TAU); c.fill();
      }
    },
    lexius(c, x, y, w, h, u, r) {
      FLOOR.pearl(c, x, y, w, h, u, r);
      c.fillStyle = lin(c, x, y, x + w, y + h, ['#67e8f9', '#0284c7']); rr(c, x + w * 0.12, y + h * 0.15, w * 0.76, h * 0.6, u * 4); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = u * 0.3;
      for (let k = 1; k < 4; k++) { circle(c, x + w * 0.5, y + h * 0.45, u * k * 2); c.stroke(); }
      for (let i = 0; i < 6; i++) { sh(c, u * 0.4); c.fillStyle = '#bae6fd'; circle(c, x + w * (0.15 + r() * 0.7), y + h * (0.1 + r() * 0.8), u * 0.7); c.fill(); }
      sh(c, 0, false);
    },
    antigrav(c, x, y, w, h, u, r) {
      FLOOR.pearl(c, x, y, w, h, u, r);
      const cx = x + w / 2, cy = y + h / 2;
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = u * 0.3; for (let k = 1; k < 5; k++) { circle(c, cx, cy, w * 0.08 * k); c.stroke(); }
      glow(c, cx, cy, w * 0.3, 'rgba(255,255,255,.6)');
      // floating lustrom (with big soft shadow = it hovers)
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(cx + u * 3, cy + u * 4, u * 3.5, u * 2.5, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,200,240,.95)'; circle(c, cx, cy, u * 3); c.fill();
      c.fillStyle = '#4c1d95'; circle(c, cx - u, cy - u * 0.5, u * 0.45); c.fill(); circle(c, cx + u, cy - u * 0.5, u * 0.45); c.fill();
      [[0.18, 0.2], [0.82, 0.25], [0.2, 0.8], [0.8, 0.78]].forEach(([a, b]) => { c.fillStyle = 'rgba(0,0,0,.25)'; circle(c, x + w * a + u * 2, y + h * b + u * 2.5, u * 1.6); c.fill(); c.fillStyle = '#94a3b8'; circle(c, x + w * a, y + h * b, u * 1.6); c.fill(); });
    },
    matacc(c, x, y, w, h, u, r) {
      FLOOR.pearl(c, x, y, w, h, u, r);
      const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.33;
      sh(c, u); c.strokeStyle = '#e0f2fe'; c.lineWidth = u * 2; circle(c, cx, cy, R); c.stroke(); sh(c, 0, false);
      c.strokeStyle = '#ec4899'; c.lineWidth = u * 0.5; circle(c, cx, cy, R); c.stroke();
      for (let i = 0; i < 4; i++) { const a = i * 1.7; glow(c, cx + Math.cos(a) * R, cy + Math.sin(a) * R, u * 2.2, 'rgba(255,255,255,1)'); }
      F.desk(c, cx - u * 3, cy - u * 2, u * 6, u * 3, u);
    },
    rainforest(c, x, y, w, h, u, r) {
      FLOOR.grass(c, x, y, w, h, u, r);
      c.strokeStyle = '#7dd3fc'; c.lineWidth = u * 1.2; c.beginPath(); c.moveTo(x, y + h * 0.7); c.bezierCurveTo(x + w * 0.3, y + h * 0.5, x + w * 0.6, y + h * 0.95, x + w, y + h * 0.75); c.stroke();
      for (let i = 0; i < 6; i++) F.tree(c, x + w * (0.15 + (i % 3) * 0.35), y + h * (0.25 + Math.floor(i / 3) * 0.45) + r() * u * 2, u * (3 + r() * 1.5), r, ['#15803d', '#22c55e', '#0f766e'][i % 3]);
      for (let i = 0; i < 5; i++) { c.fillStyle = '#f472b6'; circle(c, x + r() * w, y + r() * h, u * 0.6); c.fill(); }
    },

    // Machines
    scrap(c, x, y, w, h, u, r) {
      FLOOR.metal(c, x, y, w, h, u, r);
      for (let i = 0; i < 9; i++) { c.fillStyle = shade('#78716c', (r() - 0.5) * 0.5); sh(c, u * 0.6); c.save(); c.translate(x + w * (0.1 + r() * 0.8), y + h * (0.5 + r() * 0.4)); c.rotate(r() * 3); c.fillRect(-u * 2, -u, u * 4, u * 2); c.restore(); }
      sh(c, 0, false);
      F.gear(c, x + w * 0.3, y + h * 0.3, u * 3, 9, '#a8a29e', 0.3); F.gear(c, x + w * 0.65, y + h * 0.28, u * 2.2, 7, '#d6d3d1', 1);
      c.strokeStyle = '#f59e0b'; c.lineWidth = u * 1.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + w * 0.9, y + h * 0.9); c.lineTo(x + w * 0.75, y + h * 0.6); c.lineTo(x + w * 0.85, y + h * 0.45); c.stroke();
    },
    oil(c, x, y, w, h, u, r) {
      FLOOR.metal(c, x, y, w, h, u, r);
      F.barrel(c, x + w * 0.35, y + h * 0.4, Math.min(w, h) * 0.25, u, '#1f2937');
      c.fillStyle = '#facc15'; circle(c, x + w * 0.35, y + h * 0.4, u * 1.2); c.fill();
      F.barrel(c, x + w * 0.78, y + h * 0.25, u * 2.4, u, '#b91c1c'); F.barrel(c, x + w * 0.78, y + h * 0.6, u * 2.4, u, '#b91c1c');
      c.fillStyle = 'rgba(0,0,0,.6)'; c.beginPath(); c.ellipse(x + w * 0.4, y + h * 0.85, w * 0.15, h * 0.06, 0, 0, TAU); c.fill();
      c.strokeStyle = '#6b7280'; c.lineWidth = u * 0.8; c.beginPath(); c.moveTo(x + w * 0.55, y + h * 0.4); c.lineTo(x + w * 0.7, y + h * 0.4); c.stroke();
    },
    belowzero(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#cfe8f5', 3);
      c.fillStyle = 'rgba(186,230,253,.8)'; rr(c, x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, u * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = u * 0.5; c.lineCap = 'round';
      const sf = (cx, cy, s) => { for (let i = 0; i < 3; i++) { c.save(); c.translate(cx, cy); c.rotate(i * Math.PI / 3); c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.moveTo(s * 0.6, 0); c.lineTo(s * 0.85, -s * 0.22); c.moveTo(s * 0.6, 0); c.lineTo(s * 0.85, s * 0.22); c.stroke(); c.restore(); } };
      sf(x + w / 2, y + h / 2, w * 0.2);
      for (let i = 0; i < 4; i++) { sh(c, u * 0.4); c.fillStyle = '#e0f2fe'; c.fillRect(x + w * (0.08 + i * 0.24), y + h * 0.86, w * 0.12, h * 0.08); }
      sh(c, 0, false);
    },
    mechrest(c, x, y, w, h, u, r) {
      FLOOR.metal(c, x, y, w, h, u, r);
      F.counter(c, x + w * 0.2, y + h * 0.35, w * 0.6, h * 0.3, u, '#4b5563');
      // robot lying on the bench
      c.fillStyle = '#9ca3af'; rr(c, x + w * 0.3, y + h * 0.42, w * 0.4, h * 0.16, u); c.fill();
      c.fillStyle = '#111827'; circle(c, x + w * 0.27, y + h * 0.5, u * 1.8); c.fill();
      c.fillStyle = '#22d3ee'; circle(c, x + w * 0.26, y + h * 0.47, u * 0.4); c.fill(); circle(c, x + w * 0.26, y + h * 0.53, u * 0.4); c.fill();
      for (let i = 0; i < 8; i++) { c.strokeStyle = '#fde047'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(x + w * 0.6, y + h * 0.45); c.lineTo(x + w * 0.6 + Math.cos(i) * u * 3, y + h * 0.45 + Math.sin(i) * u * 3); c.stroke(); }
      F.machine(c, x + w * 0.05, y + h * 0.05, w * 0.25, h * 0.2, u); F.machine(c, x + w * 0.7, y + h * 0.75, w * 0.25, h * 0.2, u, '#475569');
    },
    formatcells(c, x, y, w, h, u, r) {
      FLOOR.metal(c, x, y, w, h, u, r);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const px = x + w * (0.08 + i * 0.31), py = y + h * (0.1 + j * 0.3);
        sh(c, u * 0.6); c.fillStyle = '#0f172a'; c.fillRect(px, py, w * 0.24, h * 0.2); sh(c, 0, false);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) { c.fillStyle = (a + b + i + j) % 4 === 0 ? '#39ff9f' : '#334155'; c.fillRect(px + w * 0.02 + a * w * 0.07, py + h * 0.02 + b * h * 0.06, w * 0.06, h * 0.05); }
      }
    },
    moonpark(c, x, y, w, h, u, r) {
      FLOOR.grass(c, x, y, w, h, u, r);
      c.strokeStyle = '#d6d3d1'; c.lineWidth = u * 2; c.beginPath(); c.moveTo(x, y + h * 0.5); c.bezierCurveTo(x + w * 0.4, y + h * 0.3, x + w * 0.6, y + h * 0.7, x + w, y + h * 0.5); c.stroke();
      F.gear(c, x + w * 0.25, y + h * 0.22, u * 3.5, 12, '#84cc16', 0.2); F.gear(c, x + w * 0.75, y + h * 0.8, u * 3, 10, '#65a30d', 0.5);
      sh(c, u * 0.6); c.fillStyle = '#78350f'; c.fillRect(x + w * 0.55, y + h * 0.18, w * 0.25, h * 0.07); c.fillRect(x + w * 0.2, y + h * 0.75, w * 0.25, h * 0.07); sh(c, 0, false);
      F.lamp(c, x + w * 0.5, y + h * 0.5, u * 0.5);
    },

    // Humans
    food(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#e7ecef', 3);
      F.counter(c, x + w * 0.05, y + h * 0.05, w * 0.9, h * 0.15, u, '#cbd5e1');
      for (let i = 0; i < 5; i++) { c.fillStyle = ['#f97316', '#ef4444', '#22c55e', '#eab308', '#3b82f6'][i]; circle(c, x + w * (0.15 + i * 0.17), y + h * 0.12, u * 0.9); c.fill(); }
      for (let j = 0; j < 2; j++) { sh(c, u * 0.6); c.fillStyle = '#94a3b8'; c.fillRect(x + w * 0.1, y + h * (0.4 + j * 0.25), w * 0.8, h * 0.1); sh(c, 0, false); for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fb923c' : '#fde047'; c.fillRect(x + w * (0.12 + i * 0.1), y + h * (0.41 + j * 0.25), w * 0.07, h * 0.08); } }
    },
    soda(c, x, y, w, h, u, r) {
      FLOOR.wood(c, x, y, w, h, u, r, '#b07f50');
      const cols = ['#dc2626', '#16a34a', '#2563eb', '#f59e0b'];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const cx = x + w * (0.15 + i * 0.23), cy = y + h * (0.2 + j * 0.28); sh(c, u * 0.5); c.fillStyle = cols[(i + j) % 4]; circle(c, cx, cy, u * 1.8); c.fill(); sh(c, 0, false); c.fillStyle = '#d1d5db'; circle(c, cx, cy, u * 1.3); c.fill(); c.fillStyle = '#9ca3af'; c.fillRect(cx - u * 0.4, cy - u * 0.2, u * 0.8, u * 0.4); }
    },
    cinema(c, x, y, w, h, u, r) {
      FLOOR.carpet(c, x, y, w, h, u, r, '#7f1d1d');
      F.screen(c, x + w * 0.1, y + h * 0.05, w * 0.8, h * 0.08, u);
      glow(c, x + w / 2, y + h * 0.2, w * 0.4, 'rgba(99,102,241,.35)');
      for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { sh(c, u * 0.4); c.fillStyle = '#b91c1c'; rr(c, x + w * (0.1 + i * 0.135), y + h * (0.3 + j * 0.17), w * 0.11, h * 0.11, u * 0.5); c.fill(); sh(c, 0, false); c.fillStyle = '#e2e8f0'; c.fillRect(x + w * (0.12 + i * 0.135), y + h * (0.3 + j * 0.17), w * 0.07, h * 0.03); }
    },
    beauty(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#f3e8ee', 3);
      for (let i = 0; i < 3; i++) {
        const px = x + w * (0.12 + i * 0.28);
        sh(c, u * 0.5); c.fillStyle = '#e0f2fe'; c.fillRect(px, y + h * 0.05, w * 0.22, h * 0.06); sh(c, 0, false);
        for (let k = 0; k < 4; k++) F.lamp(c, px + w * (0.02 + k * 0.06), y + h * 0.04, u * 0.3, 'rgba(255,240,180,.8)');
        sh(c, u); c.fillStyle = '#ec4899'; circle(c, px + w * 0.11, y + h * 0.3, u * 2.4); c.fill(); sh(c, 0, false);
        c.fillStyle = '#9d174d'; circle(c, px + w * 0.11, y + h * 0.3, u * 1.2); c.fill();
      }
      F.sofa(c, x + w * 0.1, y + h * 0.65, w * 0.5, h * 0.25, u, '#f9a8d4', '#fdf2f8');
      F.plant(c, x + w * 0.82, y + h * 0.78, u * 3, r);
    },
    sport(c, x, y, w, h, u, r) {
      c.fillStyle = '#c2410c'; c.fillRect(x, y, w, h);
      c.fillStyle = '#16a34a'; c.fillRect(x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.88);
      c.strokeStyle = '#fff'; c.lineWidth = u * 0.4; c.strokeRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
      c.beginPath(); c.moveTo(x + w / 2, y + h * 0.1); c.lineTo(x + w / 2, y + h * 0.9); c.stroke(); circle(c, x + w / 2, y + h / 2, w * 0.12); c.stroke();
      c.strokeRect(x + w * 0.1, y + h * 0.35, w * 0.1, h * 0.3); c.strokeRect(x + w * 0.8, y + h * 0.35, w * 0.1, h * 0.3);
      // the ball floats high (low gravity): shadow far from ball
      c.fillStyle = 'rgba(0,0,0,.3)'; circle(c, x + w * 0.62, y + h * 0.62, u * 1.2); c.fill();
      c.fillStyle = '#fff'; circle(c, x + w * 0.55, y + h * 0.42, u * 1.3); c.fill(); c.fillStyle = '#111'; circle(c, x + w * 0.55, y + h * 0.42, u * 0.45); c.fill();
    },
    pool(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#e5e7eb', 3);
      c.fillStyle = lin(c, x, y, x, y + h, ['#67e8f9', '#0284c7']); rr(c, x + w * 0.12, y + h * 0.15, w * 0.76, h * 0.6, u * 1.5); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = u * 0.3;
      for (let j = 0; j < 4; j++) { c.beginPath(); for (let k = 0; k <= 20; k++) { const px = x + w * 0.14 + k * w * 0.036; c.lineTo(px, y + h * (0.25 + j * 0.13) + Math.sin(k) * u * 0.6); } c.stroke(); }
      c.strokeStyle = '#94a3b8'; c.lineWidth = u * 0.5; c.beginPath(); c.moveTo(x + w * 0.8, y + h * 0.15); c.lineTo(x + w * 0.8, y + h * 0.25); c.moveTo(x + w * 0.85, y + h * 0.15); c.lineTo(x + w * 0.85, y + h * 0.25); c.stroke();
      c.strokeStyle = '#f97316'; c.lineWidth = u * 1.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + w * 0.1, y + h * 0.95); c.bezierCurveTo(x + w * 0.4, y + h * 0.75, x + w * 0.05, y + h * 0.6, x + w * 0.25, y + h * 0.5); c.stroke();
      for (let i = 0; i < 2; i++) { sh(c, u * 0.5); c.fillStyle = '#fef3c7'; rr(c, x + w * (0.55 + i * 0.18), y + h * 0.82, w * 0.12, h * 0.12, u * 0.3); c.fill(); }
      sh(c, 0, false);
    },
    washateria(c, x, y, w, h, u, r) {
      FLOOR.tile(c, x, y, w, h, u, r, '#dbeafe', 3);
      for (let i = 0; i < 4; i++) {
        const px = x + w * (0.06 + i * 0.235), py = y + h * 0.06, s = w * 0.2;
        sh(c, u); c.fillStyle = '#f8fafc'; rr(c, px, py, s, s, u * 0.4); c.fill(); sh(c, 0, false);
        c.fillStyle = '#334155'; circle(c, px + s / 2, py + s / 2, s * 0.34); c.fill();
        c.fillStyle = i % 2 ? '#f472b6' : '#60a5fa'; circle(c, px + s / 2, py + s / 2, s * 0.26); c.fill();
        c.fillStyle = 'rgba(255,255,255,.6)'; circle(c, px + s * 0.42, py + s * 0.42, s * 0.07); c.fill();
      }
      F.table(c, x + w * 0.25, y + h * 0.55, w * 0.5, h * 0.18, u, '#e5e7eb', '#1d4ed8');
      F.plant(c, x + w * 0.9, y + h * 0.85, u * 2.5, r);
    },
  };

  function hallway(c, x, y, w, h, u, r) {
    FLOOR.tile(c, x, y, w, h, u, r, '#b9bec6', 3);
    // runner carpet strips toward each opening drawn by frame; center light
    // glowing guide lines on the floor toward the doors
    c.save(); c.strokeStyle = P.led; c.shadowColor = P.led; c.shadowBlur = u * 2; c.lineWidth = u * 0.35; c.globalAlpha = 0.8;
    c.beginPath(); c.moveTo(x + w * 0.4, y); c.lineTo(x + w * 0.4, y + h); c.moveTo(x + w * 0.6, y); c.lineTo(x + w * 0.6, y + h);
    c.moveTo(x, y + h * 0.4); c.lineTo(x + w, y + h * 0.4); c.moveTo(x, y + h * 0.6); c.lineTo(x + w, y + h * 0.6); c.stroke(); c.restore();
    c.fillStyle = '#e5e7eb'; circle(c, x + w / 2, y + h / 2, u * 3); c.fill();
    c.save(); c.strokeStyle = P.led; c.shadowColor = P.led; c.shadowBlur = u * 2; c.lineWidth = u * 0.4; circle(c, x + w / 2, y + h / 2, u * 2.4); c.stroke(); c.restore();
    F.lamp(c, x + w / 2, y + h / 2, u * 0.7, 'rgba(255,255,255,.6)');
    F.plant(c, x + w * 0.16, y + h * 0.16, u * 2.2, r);
  }
  function guestRoom(c, x, y, w, h, u, r) {
    FLOOR.wood(c, x, y, w, h, u, r, '#9c7048');
    F.rug(c, x + w * 0.5, y + h * 0.6, w * 0.22, '#a39b90');
    F.bed(c, x + w * 0.35, y + h * 0.42, w * 0.55, h * 0.5, u);
    F.desk(c, x + w * 0.05, y + h * 0.62, w * 0.22, h * 0.16, u);
    F.plant(c, x + w * 0.12, y + h * 0.9, u * 2.4, r);
    F.lamp(c, x + w * 0.9, y + h * 0.35, u * 0.6);
  }

  // ---------- detail layer: lockers along the walls, cables, floor lights, signs, race emblem ----------
  function emblem(c, x, y, s) {
    c.save(); c.globalAlpha = 0.35; c.strokeStyle = P.led; c.fillStyle = P.led; c.lineWidth = s * 0.08;
    if (RACE === 'humans') { circle(c, x, y, s * 0.45); c.stroke(); c.beginPath(); c.ellipse(x, y, s * 0.8, s * 0.22, -0.4, 0, TAU); c.stroke(); }
    else if (RACE === 'lustroms') { for (let k = 0; k < 6; k++) { c.save(); c.translate(x, y); c.rotate(k * TAU / 6); c.beginPath(); c.ellipse(0, -s * 0.4, s * 0.16, s * 0.4, 0, 0, TAU); c.stroke(); c.restore(); } }
    else if (RACE === 'machines') { F.gear(c, x, y, s * 0.6, 8, P.led); }
    else if (RACE === 'bozob') { c.beginPath(); c.ellipse(x, y, s * 0.7, s * 0.4, 0, 0, TAU); c.stroke(); circle(c, x, y, s * 0.2); c.fill(); }
    else { c.beginPath(); c.moveTo(x - s * 0.5, y + s * 0.4); c.lineTo(x, y - s * 0.5); c.lineTo(x + s * 0.5, y + s * 0.4); c.closePath(); c.stroke(); }
    c.restore();
  }
  function clutter(c, type, w, h, u, r, T) {
    const d = MI.PIECES[type];
    if (d.neutral) return;
    const cells = d.cells, mx = Math.max(...cells.map((k) => k.dx)), my = Math.max(...cells.map((k) => k.dy));
    const cw = w / (mx + 1), ch = h / (my + 1);
    // door centres on each side, so nothing is placed in front of a doorway
    const doors = { 0: [], 1: [], 2: [], 3: [] };
    for (const k of cells) for (let s = 0; s < 4; s++) if (k.e[s] === 'i' || k.e[s] === 'o') doors[s].push(s % 2 === 0 ? (k.dx + 0.5) * cw : (k.dy + 0.5) * ch);
    const free = (s, a, half) => doors[s].every((dc) => Math.abs(dc - a) > (s % 2 === 0 ? cw : ch) * 0.22 + half);
    const busy = d.kind === 'facility' || d.kind === 'generator' || d.kind === 'storage';
    // lockers / cabinets against the top and left walls
    const lw = u * 3.2, ld = u * 2.2;
    for (let a = T + u; a + lw < w - T - u; a += lw + u * 0.6) {
      if (!free(0, a + lw / 2, lw / 2) || r() < (busy ? 0.75 : 0.45)) continue;
      sh(c, u * 0.6); c.fillStyle = shade(P.wall, 0.12); c.fillRect(a, T, lw, ld); sh(c, 0, false);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(a + lw / 2 - u * 0.08, T, u * 0.16, ld);
      c.fillStyle = r() < 0.2 ? '#ef4444' : P.led; circle(c, a + lw * 0.8, T + ld * 0.5, u * 0.22); c.fill();
    }
    for (let a = T + u * 4; a + lw < h - T - u; a += lw + u * 0.6) {
      if (!free(3, a + lw / 2, lw / 2) || r() < (busy ? 0.8 : 0.55)) continue;
      sh(c, u * 0.6); c.fillStyle = shade(P.wall, 0.06); c.fillRect(T, a, ld, lw); sh(c, 0, false);
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = u * 0.15; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(T + u * 0.3, a + lw * k / 4); c.lineTo(T + ld - u * 0.3, a + lw * k / 4); c.stroke(); }
    }
    // cable run across the floor from a wall socket
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = u * 0.45; c.lineCap = 'round';
    const sx = w - T, sy = T + (h - 2 * T) * (0.6 + r() * 0.3);
    c.beginPath(); c.moveTo(sx, sy); c.bezierCurveTo(sx - u * 6, sy + u * 2, sx - u * 4, sy - u * 5, sx - u * 10, sy - u * 3); c.stroke();
    c.strokeStyle = P.led; c.globalAlpha = 0.6; c.lineWidth = u * 0.15; c.stroke(); c.globalAlpha = 1;
    c.fillStyle = '#111827'; c.fillRect(sx - u * 0.8, sy - u * 0.8, u * 0.8, u * 1.6);
    // floor lights in the corners
    for (const [fx, fy] of [[T + u * 1.5, h - T - u * 1.5], [w - T - u * 1.5, h - T - u * 1.5]]) { glow(c, fx, fy, u * 2.2, P.led, 0.5); c.fillStyle = '#fff'; circle(c, fx, fy, u * 0.3); c.fill(); }
    // room sign with a number on the floor near the first doorway
    const num = String(hash(type + RACE) % 90 + 10);
    c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, w - T - u * 6.2, T + u * 0.6, u * 5.4, u * 2.4, u * 0.4); c.fill();
    c.fillStyle = P.led; c.font = `700 ${u * 1.7}px Orbitron, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText((RACE[0] || 'S').toUpperCase() + '-' + num, w - T - u * 3.5, T + u * 1.85);
    // race emblem decal
    emblem(c, T + u * 4.5, h - T - u * 4.5, u * 3);
  }

  // ---------- outdoor pieces: standing on the moon surface, no room around them ----------
  function solarField(c, w, h, u, r) {
    // a few footprints / dust marks on the regolith (transparent background = moon shows through)
    c.fillStyle = 'rgba(0,0,0,.10)';
    for (let i = 0; i < 14; i++) { c.beginPath(); c.ellipse(r() * w, r() * h, u * 0.6, u * 0.35, r() * 3, 0, TAU); c.fill(); }
    // walkway from the panels to the airlock (exit is on the top side at rotation 0)
    c.fillStyle = '#3b424d'; c.fillRect(w * 0.44, 0, w * 0.12, h * 0.55);
    c.fillStyle = 'rgba(255,255,255,.12)'; for (let y = u; y < h * 0.55; y += u * 2) c.fillRect(w * 0.44, y, w * 0.12, u * 0.3);
    c.save(); c.shadowColor = P.led; c.shadowBlur = u * 2; c.fillStyle = P.led; c.fillRect(w * 0.44, 0, w * 0.12, u * 0.6); c.restore();
    // power cable along the walkway
    c.strokeStyle = '#f59e0b'; c.lineWidth = u * 0.5; c.beginPath(); c.moveTo(w * 0.58, h * 0.55); c.lineTo(w * 0.58, u); c.stroke();
    // 2 x 2 tilted panels on poles, sun from the top-left, so shadows fall to the bottom-right
    const pw = w * 0.36, ph = h * 0.2, tilt = u * 2.2;
    for (const [px, py] of [[w * 0.06, h * 0.2], [w * 0.58, h * 0.2], [w * 0.06, h * 0.62], [w * 0.58, h * 0.62]]) {
      // long shadow on the ground
      c.fillStyle = 'rgba(0,0,0,.38)';
      c.beginPath(); c.moveTo(px + u * 3, py + u * 4); c.lineTo(px + pw + u * 3, py + u * 4); c.lineTo(px + pw + u * 5, py + ph + u * 6); c.lineTo(px + u * 5, py + ph + u * 6); c.fill();
      // pole
      c.fillStyle = '#6b7280'; c.fillRect(px + pw / 2 - u * 0.4, py + ph * 0.5, u * 0.8, ph * 0.9);
      c.fillStyle = '#374151'; c.beginPath(); c.ellipse(px + pw / 2, py + ph * 1.4, u * 1.2, u * 0.5, 0, 0, TAU); c.fill();
      // tilted panel (parallelogram) with frame and cells
      c.save(); c.translate(px, py);
      c.beginPath(); c.moveTo(tilt, 0); c.lineTo(pw + tilt, 0); c.lineTo(pw, ph); c.lineTo(0, ph); c.closePath();
      c.fillStyle = lin(c, 0, 0, pw, ph, ['#1e40af', '#172554', '#1e3a8a']); c.fill();
      c.strokeStyle = '#cbd5e1'; c.lineWidth = u * 0.4; c.stroke();
      c.clip();
      c.strokeStyle = 'rgba(147,197,253,.55)'; c.lineWidth = u * 0.18;
      for (let k = 1; k < 6; k++) { const f = k / 6; c.beginPath(); c.moveTo(tilt + pw * f, 0); c.lineTo(pw * f, ph); c.stroke(); }
      for (let k = 1; k < 3; k++) { const f = k / 3; c.beginPath(); c.moveTo(tilt * (1 - f), ph * f); c.lineTo(pw + tilt * (1 - f), ph * f); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(tilt, 0); c.lineTo(tilt + pw * 0.3, 0); c.lineTo(pw * 0.1, ph); c.lineTo(0, ph); c.fill();
      c.restore();
    }
    // small inverter box by the walkway
    sh(c, u); c.fillStyle = '#9ca3af'; c.fillRect(w * 0.42, h * 0.5, w * 0.16, h * 0.1); sh(c, 0, false);
    c.fillStyle = '#22c55e'; circle(c, w * 0.45, h * 0.53, u * 0.4); c.fill();
  }
  const OUTDOOR = { solar: solarField };

  function draw(c, type, w, h) {
    const u = Math.min(w, h) / 40; // design unit
    P = PAL[RACE] || PAL.shared;
    const r = rng(hash(type + RACE));
    if (OUTDOOR[type]) { OUTDOOR[type](c, w, h, u, r); return; }
    const T = u * 6.5;
    const painter = ROOM[type];
    c.fillStyle = P.base; c.fillRect(0, 0, w, h);
    c.save(); c.beginPath(); c.rect(T, T, w - 2 * T, h - 2 * T); c.clip();
    if (painter) painter(c, T, T, w - 2 * T, h - 2 * T, u, r);
    else { themeFloor(c, T, T, w - 2 * T, h - 2 * T, u, r); F.machine(c, w * 0.3, h * 0.3, w * 0.4, h * 0.3, u); }
    // ambient occlusion where floor meets walls
    const ao = u * 2.5;
    [[T, T, w - 2 * T, ao, 0, 1], [T, h - T - ao, w - 2 * T, ao, 0, -1], [T, T, ao, h - 2 * T, 1, 0], [w - T - ao, T, ao, h - 2 * T, -1, 0]].forEach(([x, y, ww, hh, dx, dy]) => {
      const x0 = dx > 0 ? x : dx < 0 ? x + ww : x, y0 = dy > 0 ? y : dy < 0 ? y + hh : y;
      c.fillStyle = lin(c, x0, y0, x0 + dx * ao, y0 + dy * ao, ['rgba(0,0,0,.35)', 'rgba(0,0,0,0)']); c.fillRect(x, y, ww, hh);
    });
    c.restore();
    c.save(); c.beginPath(); c.rect(T, T, w - 2 * T, h - 2 * T); c.clip();
    clutter(c, type, w, h, u, r, T);
    c.restore();
    frame(c, type, w, h, u);
  }

  // race of the piece's owner decides the whole look; shared pieces follow their builder
  let RACE = 'shared';
  const ART_CELL = 160; // design size per board cell (drawing coordinates)
  function get(type, w, h, race) {
    const d = MI.PIECES[type];
    RACE = d.neutral ? 'shared' : (race || d.race || window.MI_RACE || 'shared');
    const cols = Math.max(...d.cells.map((k) => k.dx)) + 1, rows = Math.max(...d.cells.map((k) => k.dy)) + 1;
    const wide = w >= h; // rotation-aware: keep the requested orientation
    const big = Math.max(cols, rows), small = Math.min(cols, rows);
    // render at the size it is shown on screen (bucketed so the cache stays small)
    const screenCell = Math.max(w, h) / big * (window.devicePixelRatio || 1);
    const bucket = [96, 160, 256, 384, 512].find((b) => b >= screenCell) || 512;
    const dpr = bucket / ART_CELL;
    w = (wide ? big : small) * ART_CELL; h = (wide ? small : big) * ART_CELL;
    const key = `${type}|${RACE}|${w}|${h}|${dpr}`;
    let cv = cache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr); c.lineJoin = 'round';
    try { draw(c, type, w, h); } catch (e) { console.warn('art', type, e); c.fillStyle = '#555'; c.fillRect(0, 0, w, h); }
    if (cache.size > 800) cache.clear();
    cache.set(key, cv);
    return cv;
  }

  const passage = (race) => shade((PAL[race] || PAL.shared).base, -0.15);
  const led = (race) => (PAL[race] || PAL.shared).led;
  // floor-only version (no painted walls) for the 3D view; walls are real meshes there
  function getFloor(type, cols, rows, race) {
    const d = MI.PIECES[type];
    RACE = d.neutral ? 'shared' : (race || d.race || 'shared');
    const PX = 256, w = cols * PX, h = rows * PX;
    const key = `F|${type}|${RACE}|${cols}x${rows}`;
    let cv = cache.get(key);
    if (cv) return cv;
    REC = [];
    cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); c.lineJoin = 'round';
    const u = Math.min(w, h) / 40;
    P = PAL[RACE] || PAL.shared;
    const r = rng(hash(type + RACE));
    try {
      if (OUTDOOR[type]) { /* outdoor pieces are built from meshes; leave transparent */ }
      else {
        const T = u * 2.2;
        c.fillStyle = P.base; c.fillRect(0, 0, w, h);
        const painter = ROOM[type];
        c.save(); c.beginPath(); c.rect(T, T, w - 2 * T, h - 2 * T); c.clip();
        if (painter) painter(c, T, T, w - 2 * T, h - 2 * T, u, r);
        else { themeFloor(c, T, T, w - 2 * T, h - 2 * T, u, r); F.machine(c, w * 0.3, h * 0.3, w * 0.4, h * 0.3, u); }
        clutter(c, type, w, h, u, r, T);
        c.restore();
        // floor continues under the doorways
        c.save(); c.globalCompositeOperation = 'destination-over'; themeFloor(c, 0, 0, w, h, u, r); c.restore();
      }
    } catch (e) { console.warn('floor', type, e); }
    // props in cell units (1 = one board cell) from the floor's top-left corner
    props.set(key, REC.map((p) => ({ ...p, x: p.x / PX, y: p.y / PX, w: p.w / PX, h: p.h / PX, r: p.r / PX })));
    REC = null;
    cache.set(key, cv);
    return cv;
  }
  const props = new Map();
  function getProps(type, cols, rows, race) {
    getFloor(type, cols, rows, race);
    const d = MI.PIECES[type], R = d.neutral ? 'shared' : (race || d.race || 'shared');
    return props.get(`F|${type}|${R}|${cols}x${rows}`) || [];
  }
  const pal = (race) => PAL[race] || PAL.shared;
  window.Art = { get, getFloor, getProps, passage, led, pal };
})();
