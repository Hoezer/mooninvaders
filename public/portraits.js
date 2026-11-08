// Procedural leader portraits for the four races. Portraits.draw(canvas, race)
(function () {
  const TAU = Math.PI * 2;
  const ACC = { lustroms: '#2dd4bf', humans: '#38bdf8', machines: '#f59e0b', bozob: '#a3e635' };
  const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
  const rad = (c, x, y, r, stops) => { const g = c.createRadialGradient(x, y, 0, x, y, r); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
  const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
  function glow(c, x, y, r, col, a = 1) { c.save(); c.globalAlpha = a; c.fillStyle = rad(c, x, y, r, [col, 'rgba(0,0,0,0)']); circle(c, x, y, r); c.fill(); c.restore(); }

  function background(c, S, race) {
    const a = ACC[race];
    c.fillStyle = '#05070d'; c.fillRect(0, 0, S, S);
    glow(c, S * 0.5, S * 0.45, S * 0.75, a, 0.55);
    // tech grid + diagonal speed lines
    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
    for (let i = 0; i < S; i += S / 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, S); c.moveTo(0, i); c.lineTo(S, i); c.stroke(); }
    c.save(); c.globalAlpha = 0.18; c.strokeStyle = a; c.lineWidth = S * 0.012;
    for (let i = -S; i < S * 2; i += S * 0.09) { c.beginPath(); c.moveTo(i, S); c.lineTo(i + S * 0.6, 0); c.stroke(); }
    c.restore();
    // stars
    let seed = race.length * 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; c.fillRect(rnd() * S, rnd() * S, 1.5, 1.5); }
  }

  const DRAW = {
    humans(c, S) {
      const cx = S / 2, cy = S * 0.48, R = S * 0.3;
      // suit shoulders
      c.fillStyle = lin(c, 0, S * 0.7, 0, S, ['#e2e8f0', '#94a3b8']);
      c.beginPath(); c.moveTo(S * 0.08, S); c.quadraticCurveTo(S * 0.12, S * 0.72, cx, S * 0.7); c.quadraticCurveTo(S * 0.88, S * 0.72, S * 0.92, S); c.fill();
      c.fillStyle = '#1d4ed8'; c.fillRect(S * 0.18, S * 0.86, S * 0.16, S * 0.07);
      c.fillStyle = '#fff'; c.font = `900 ${S * 0.045}px Orbitron, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EARTH', S * 0.26, S * 0.895);
      c.fillStyle = '#ef4444'; c.fillRect(S * 0.68, S * 0.85, S * 0.12, S * 0.08);
      // helmet
      c.fillStyle = rad(c, cx - R * 0.35, cy - R * 0.4, R * 1.4, ['#ffffff', '#cbd5e1', '#64748b']); circle(c, cx, cy, R); c.fill();
      // visor
      c.save(); c.beginPath(); c.ellipse(cx, cy + R * 0.08, R * 0.78, R * 0.6, 0, 0, TAU); c.clip();
      c.fillStyle = lin(c, cx - R, cy - R, cx + R, cy + R, ['#fbbf24', '#b45309', '#1e3a8a', '#0f172a']); c.fillRect(cx - R, cy - R, R * 2, R * 2);
      // reflection: moon + base
      c.fillStyle = 'rgba(255,255,255,.75)'; circle(c, cx + R * 0.35, cy - R * 0.15, R * 0.16); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(cx - R * 0.3, cy - R * 0.25, R * 0.45, R * 0.12, -0.5, 0, TAU); c.fill();
      c.fillStyle = 'rgba(56,189,248,.6)'; c.fillRect(cx - R * 0.6, cy + R * 0.35, R * 1.2, R * 0.05);
      c.restore();
      c.strokeStyle = '#475569'; c.lineWidth = S * 0.015; c.beginPath(); c.ellipse(cx, cy + R * 0.08, R * 0.78, R * 0.6, 0, 0, TAU); c.stroke();
      // lights + antenna
      glow(c, cx - R * 0.95, cy, S * 0.05, '#38bdf8'); glow(c, cx + R * 0.95, cy, S * 0.05, '#38bdf8');
      c.strokeStyle = '#94a3b8'; c.lineWidth = S * 0.012; c.beginPath(); c.moveTo(cx + R * 0.6, cy - R * 0.8); c.lineTo(cx + R * 0.85, cy - R * 1.35); c.stroke();
      glow(c, cx + R * 0.85, cy - R * 1.35, S * 0.04, '#ef4444');
    },
    lustroms(c, S) {
      const cx = S / 2, cy = S * 0.46, R = S * 0.3;
      glow(c, cx, cy, R * 1.6, 'rgba(244,114,182,.55)');
      // tendrils
      for (let i = 0; i < 7; i++) {
        const x = cx - R * 0.8 + i * R * 0.27;
        c.strokeStyle = i % 2 ? 'rgba(94,234,212,.75)' : 'rgba(244,114,182,.75)'; c.lineWidth = S * 0.03; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, cy + R * 0.6); c.bezierCurveTo(x - S * 0.06, cy + R * 1.1, x + S * 0.06, cy + R * 1.4, x - S * 0.02, S * 0.98); c.stroke();
      }
      // jelly dome
      c.fillStyle = rad(c, cx - R * 0.3, cy - R * 0.4, R * 1.3, ['rgba(255,255,255,.95)', 'rgba(94,234,212,.85)', 'rgba(20,120,130,.75)']);
      c.beginPath(); c.moveTo(cx - R, cy + R * 0.6); c.quadraticCurveTo(cx - R * 1.1, cy - R * 1.1, cx, cy - R * 1.05); c.quadraticCurveTo(cx + R * 1.1, cy - R * 1.1, cx + R, cy + R * 0.6);
      for (let i = 0; i <= 6; i++) c.quadraticCurveTo(cx + R - (i + 0.5) * R / 3.5, cy + R * 0.85, cx + R - (i + 1) * R / 3.5, cy + R * 0.6);
      c.fill();
      // inner glow spots
      for (const [a, b, r2, col] of [[-0.4, -0.5, 0.12, '#f9a8d4'], [0.35, -0.6, 0.09, '#fff'], [0.1, 0.25, 0.14, '#f472b6'], [-0.55, 0.2, 0.08, '#a7f3d0']]) glow(c, cx + R * a, cy + R * b, R * r2 * 2.2, col);
      // big kind eyes
      for (const s of [-1, 1]) {
        c.fillStyle = '#0b1f3a'; c.beginPath(); c.ellipse(cx + s * R * 0.32, cy - R * 0.05, R * 0.17, R * 0.22, 0, 0, TAU); c.fill();
        c.fillStyle = '#fff'; circle(c, cx + s * R * 0.32 - R * 0.05, cy - R * 0.12, R * 0.06); c.fill(); circle(c, cx + s * R * 0.32 + R * 0.05, cy + R * 0.02, R * 0.03); c.fill();
      }
      c.strokeStyle = '#0b1f3a'; c.lineWidth = S * 0.012; c.beginPath(); c.arc(cx, cy + R * 0.2, R * 0.12, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = 'rgba(244,114,182,.6)'; circle(c, cx - R * 0.55, cy + R * 0.15, R * 0.08); c.fill(); circle(c, cx + R * 0.55, cy + R * 0.15, R * 0.08); c.fill();
    },
    machines(c, S) {
      const cx = S / 2, cy = S * 0.45, W = S * 0.52, H = S * 0.46;
      // body / chest with hazard stripes
      c.fillStyle = '#374151'; c.fillRect(S * 0.2, S * 0.74, S * 0.6, S * 0.3);
      c.save(); c.beginPath(); c.rect(S * 0.2, S * 0.8, S * 0.6, S * 0.06); c.clip();
      c.fillStyle = '#facc15'; c.fillRect(0, 0, S, S); c.fillStyle = '#111';
      for (let x = 0; x < S; x += S * 0.06) { c.beginPath(); c.moveTo(x, S * 0.86); c.lineTo(x + S * 0.03, S * 0.86); c.lineTo(x + S * 0.06, S * 0.8); c.lineTo(x + S * 0.03, S * 0.8); c.fill(); }
      c.restore();
      c.fillStyle = '#4b5563'; c.fillRect(cx - S * 0.06, S * 0.68, S * 0.12, S * 0.08);
      // head
      c.fillStyle = lin(c, cx - W / 2, cy - H / 2, cx + W / 2, cy + H / 2, ['#9ca3af', '#4b5563', '#1f2937']);
      c.beginPath(); c.roundRect ? c.roundRect(cx - W / 2, cy - H / 2, W, H, S * 0.05) : c.rect(cx - W / 2, cy - H / 2, W, H); c.fill();
      c.strokeStyle = '#111827'; c.lineWidth = S * 0.012; c.stroke();
      c.fillStyle = '#d1d5db'; for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { circle(c, cx + a * W * 0.42, cy + b * H * 0.38, S * 0.012); c.fill(); }
      // visor with eyes
      c.fillStyle = '#0b0f14'; c.fillRect(cx - W * 0.4, cy - H * 0.18, W * 0.8, H * 0.28);
      c.save(); c.shadowColor = '#f59e0b'; c.shadowBlur = S * 0.06; c.fillStyle = '#fbbf24';
      c.fillRect(cx - W * 0.32, cy - H * 0.08, W * 0.2, H * 0.09); c.fillRect(cx + W * 0.12, cy - H * 0.08, W * 0.2, H * 0.09); c.restore();
      // mouth grille
      c.fillStyle = '#111827'; for (let i = 0; i < 6; i++) c.fillRect(cx - W * 0.25 + i * W * 0.09, cy + H * 0.22, W * 0.05, H * 0.14);
      // antenna + ear bolts
      c.strokeStyle = '#9ca3af'; c.lineWidth = S * 0.015; c.beginPath(); c.moveTo(cx, cy - H / 2); c.lineTo(cx, cy - H * 0.85); c.stroke();
      glow(c, cx, cy - H * 0.88, S * 0.06, '#ef4444'); c.fillStyle = '#ef4444'; circle(c, cx, cy - H * 0.88, S * 0.018); c.fill();
      c.fillStyle = '#6b7280'; c.fillRect(cx - W / 2 - S * 0.05, cy - H * 0.12, S * 0.05, H * 0.24); c.fillRect(cx + W / 2, cy - H * 0.12, S * 0.05, H * 0.24);
    },
    bozob(c, S) {
      const cx = S / 2, cy = S * 0.5;
      glow(c, cx, cy, S * 0.45, 'rgba(126,34,206,.6)');
      // tentacles
      for (let i = 0; i < 6; i++) {
        const x = S * 0.18 + i * S * 0.13;
        c.strokeStyle = i % 2 ? '#6b21a8' : '#86198f'; c.lineWidth = S * 0.045; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, S * 0.78); c.bezierCurveTo(x + S * 0.08, S * 0.86, x - S * 0.08, S * 0.92, x + S * 0.03, S * 1.02); c.stroke();
        c.fillStyle = '#a3e635'; circle(c, x + S * 0.01, S * 0.84, S * 0.008); c.fill();
      }
      // hood
      c.fillStyle = lin(c, cx, S * 0.08, cx, S * 0.82, ['#4c1d95', '#2e1065', '#12001f']);
      c.beginPath(); c.moveTo(cx, S * 0.08); c.bezierCurveTo(cx + S * 0.38, S * 0.2, cx + S * 0.36, S * 0.6, cx + S * 0.34, S * 0.82);
      c.lineTo(cx - S * 0.34, S * 0.82); c.bezierCurveTo(cx - S * 0.36, S * 0.6, cx - S * 0.38, S * 0.2, cx, S * 0.08); c.fill();
      // dark face opening
      c.fillStyle = '#030006'; c.beginPath(); c.ellipse(cx, cy, S * 0.19, S * 0.24, 0, 0, TAU); c.fill();
      // three glowing eyes
      for (const [ex, ey, r] of [[-0.08, -0.02, 0.035], [0.08, -0.02, 0.035], [0, -0.12, 0.025]]) {
        glow(c, cx + S * ex, cy + S * ey, S * r * 3, '#a3e635');
        c.fillStyle = '#ecfccb'; c.beginPath(); c.ellipse(cx + S * ex, cy + S * ey, S * r, S * r * 0.55, 0, 0, TAU); c.fill();
        c.fillStyle = '#14532d'; c.beginPath(); c.ellipse(cx + S * ex, cy + S * ey, S * r * 0.25, S * r * 0.5, 0, 0, TAU); c.fill();
      }
      // grin
      c.strokeStyle = 'rgba(163,230,53,.6)'; c.lineWidth = S * 0.01; c.beginPath(); c.arc(cx, cy + S * 0.06, S * 0.08, 0.3, Math.PI - 0.3); c.stroke();
      // slime drips from the hood edge
      c.fillStyle = '#84cc16';
      for (const [x, l] of [[-0.18, 0.08], [-0.05, 0.05], [0.12, 0.1], [0.2, 0.06]]) { c.beginPath(); c.ellipse(cx + S * x, S * 0.3 + S * l, S * 0.012, S * l * 0.6, 0, 0, TAU); c.fill(); }
    },
  };

  function draw(canvas, race) {
    const c = canvas.getContext('2d');
    const S = canvas.width;
    c.setTransform(1, 0, 0, 1, 0, 0);
    background(c, S, race);
    (DRAW[race] || DRAW.humans)(c, S);
    // vignette + scanlines for a bold sci-fi poster look
    c.fillStyle = rad(c, S / 2, S / 2, S * 0.75, ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,.6)']); c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < S; y += 3) c.fillRect(0, y, S, 1);
  }

  window.Portraits = { draw, ACC };
})();
