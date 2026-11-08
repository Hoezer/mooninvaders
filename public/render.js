// Canvas drawing: starfield, moon board and jigsaw-shaped pieces.
(function () {
  const MI = window.MI;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  // Draw one side from p1 to p2 with outward normal n. type: w, i, o, x.
  // minimal jigsaw bump: small and low, it sits inside the doorway
  function side(ctx, x1, y1, x2, y2, nx, ny, type, s) {
    if (type !== 'i' && type !== 'o') { ctx.lineTo(x2, y2); return; }
    const h = s * 0.09 * (type === 'o' ? 1 : -1);
    const ax = x1 + (x2 - x1) * 0.42, ay = y1 + (y2 - y1) * 0.42;
    const bx = x1 + (x2 - x1) * 0.58, by = y1 + (y2 - y1) * 0.58;
    ctx.lineTo(ax, ay);
    ctx.bezierCurveTo(ax + nx * h * 1.35 - (bx - ax) * 0.35, ay + ny * h * 1.35 - (by - ay) * 0.35,
      bx + nx * h * 1.35 + (bx - ax) * 0.35, by + ny * h * 1.35 + (by - ay) * 0.35, bx, by);
    ctx.lineTo(x2, y2);
  }

  function cellPath(ctx, px, py, s, e) {
    ctx.moveTo(px, py);
    side(ctx, px, py, px + s, py, 0, -1, e[0], s);
    side(ctx, px + s, py, px + s, py + s, 1, 0, e[1], s);
    side(ctx, px + s, py + s, px, py + s, 0, 1, e[2], s);
    side(ctx, px, py + s, px, py, -1, 0, e[3], s);
    ctx.closePath();
  }

  // cells: absolute [{x,y,e}] in grid units; ox/oy board origin; s cell size.
  function drawPiece(ctx, type, cells, ox, oy, s, color, opts = {}) {
    const def = MI.PIECES[type];
    const race = opts.race || window.MI_RACE;
    ctx.save();
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    const minX = Math.min(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y));
    const maxX = Math.max(...cells.map((c) => c.x)), maxY = Math.max(...cells.map((c) => c.y));
    const bw = (maxX - minX + 1) * s, bh = (maxY - minY + 1) * s;
    // tiny tabs, filled with the corridor floor colour so passages read as one floor
    ctx.beginPath();
    for (const c of cells) cellPath(ctx, ox + c.x * s, oy + c.y * s, s, c.e);
    ctx.fillStyle = opts.fill || (window.Art ? Art.passage(def.neutral ? 'shared' : race || def.race) : color);
    if (!def.outdoor || opts.fill) ctx.fill('nonzero');
    if (window.Art && !opts.fill) {
      // room picture on the square, rotated with the piece so doors line up
      const rot = opts.rot || 0, odd = rot % 2 === 1;
      const w0 = odd ? bh : bw, h0 = odd ? bw : bh;
      ctx.save();
      ctx.beginPath(); for (const c of cells) ctx.rect(ox + c.x * s, oy + c.y * s, s, s); ctx.clip();
      ctx.translate(ox + minX * s + bw / 2, oy + minY * s + bh / 2);
      ctx.rotate(rot * Math.PI / 2);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(Art.get(type, w0, h0, race), -w0 / 2, -h0 / 2, w0, h0);
      ctx.restore();
    }
    // outline only along walls (doorways stay open), very subtle owner tint
    for (const pass of (def.outdoor && !opts.stroke ? [] : [0, 1])) {
      ctx.beginPath();
      for (const c of cells) {
        const px = ox + c.x * s, py = oy + c.y * s;
        const P4 = [[px, py, px + s, py], [px + s, py, px + s, py + s], [px + s, py + s, px, py + s], [px, py + s, px, py]];
        P4.forEach(([x1, y1, x2, y2], d) => {
          const e = c.e[d];
          if (e === 'x') return;
          const segs = e === 'w' ? [[0, 1]] : [[0, 0.31], [0.69, 1]];
          for (const [f0, f1] of segs) { ctx.moveTo(x1 + (x2 - x1) * f0, y1 + (y2 - y1) * f0); ctx.lineTo(x1 + (x2 - x1) * f1, y1 + (y2 - y1) * f1); }
        });
      }
      if (pass === 0) { ctx.lineWidth = Math.max(1, s * 0.022); ctx.strokeStyle = opts.stroke || 'rgba(10,12,16,.55)'; ctx.stroke(); }
      else if (!opts.stroke) { ctx.globalAlpha *= 0.55; ctx.lineWidth = Math.max(0.6, s * 0.012); ctx.strokeStyle = color; ctx.stroke(); ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha; }
    }
    if (def.kind === 'hallway' && s > 14 && !window.Art) {
      // corridor lines toward each open side
      const c = cells[0], cx = ox + c.x * s + s / 2, cy = oy + c.y * s + s / 2;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
      ctx.beginPath();
      MI.DIRS.forEach((d, k) => { if (c.e[k] !== 'w') { ctx.moveTo(cx, cy); ctx.lineTo(cx + d[0] * s * 0.36, cy + d[1] * s * 0.36); } });
      ctx.stroke();
    }
    if (opts.unpowered) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath();
      for (const c of cells) ctx.rect(ox + c.x * s + 3, oy + c.y * s + 3, s - 6, s - 6);
      ctx.fill();
    }
    if (s >= 22 && (def.kind === 'facility' || opts.unpowered)) {
      const c0 = cells.reduce((a, b) => (b.y < a.y || (b.y === a.y && b.x > a.x) ? b : a));
      const bx = ox + c0.x * s + s * 0.8, by = oy + c0.y * s + s * 0.2, r = s * 0.17;
      if (def.kind === 'facility') {
        ctx.fillStyle = '#0b1a12'; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
        ctx.lineWidth = Math.max(1, s * 0.03); ctx.strokeStyle = '#facc15'; ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 ' + (r * 1.2) + 'px Orbitron, sans-serif'; ctx.fillText(def.points, bx, by + 1);
      }
      if (opts.unpowered) {
        ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = (s * 0.32) + 'px sans-serif'; ctx.fillText('\u26A0', ox + c0.x * s + s * 0.22, oy + c0.y * s + s * 0.24);
      }
    }
    ctx.restore();
  }

  // ---------- moving parts, drawn live on top of the cached room art ----------
  function animPiece(ctx, p, cells, ox, oy, s, t, race, on) {
    const def = MI.PIECES[p.type];
    const minX = Math.min(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y));
    const maxX = Math.max(...cells.map((c) => c.x)), maxY = Math.max(...cells.map((c) => c.y));
    const bw = (maxX - minX + 1) * s, bh = (maxY - minY + 1) * s;
    const rot = p.rot || 0, odd = rot % 2 === 1, w0 = odd ? bh : bw, h0 = odd ? bw : bh;
    const led = window.Art ? Art.led(race) : '#39ff9f';
    const ph = p.id * 1.7;
    ctx.save();
    ctx.translate(ox + minX * s + bw / 2, oy + minY * s + bh / 2);
    ctx.rotate(rot * Math.PI / 2);
    const X = (f) => -w0 / 2 + f * w0, Y = (f) => -h0 / 2 + f * h0;
    const dot = (x, y, r, col, blur) => { ctx.shadowColor = col; ctx.shadowBlur = blur; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; };
    const u = Math.min(w0, h0) / 40;
    // status light: breathing when powered, fast red blink when not
    if (!def.outdoor) {
      if (on) { ctx.globalAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t / 450 + ph)); dot(X(0.84), Y(0.22), u * 0.7, led, u * 3); }
      else if (Math.sin(t / 120 + ph) > 0) dot(X(0.84), Y(0.22), u * 0.8, '#ef4444', u * 3);
      ctx.globalAlpha = 1;
    }
    if (on) switch (def.kind === 'hallway' && p.type !== 'landing' ? 'hallway' : def.kind === 'room' ? 'room' : p.type) {
      case 'hallway': {
        // centre light pulse + a crew member walking between the doors
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t / 700 + ph); dot(0, 0, u * 3, led, u * 6); ctx.globalAlpha = 1;
        const k = Math.sin(t / 1600 + ph), vert = Math.floor(ph) % 2 === 0;
        const wx = vert ? u * 2.5 : k * w0 * 0.3, wy = vert ? k * h0 * 0.3 : u * 2.5;
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(wx + u * 0.5, wy + u * 0.7, u * 1.4, u * 0.9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = led; ctx.beginPath(); ctx.ellipse(wx, wy, u * 1.3, u * 0.9, vert ? Math.PI / 2 : 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#f1f5f9'; ctx.beginPath(); ctx.arc(wx, wy, u * 0.65, 0, 7); ctx.fill();
        break;
      }
      case 'room': { // sleeper breathing under the blanket + reading lamp flicker
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t / 900 + ph); dot(X(0.62), Y(0.62), u * 2.2, '#ffffff', u * 4); ctx.globalAlpha = 1; break;
      }
      case 'landing': { // chasing landing lights + rotating beacon
        const R = Math.min(w0, h0) * 0.29;
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, on2 = (Math.floor(t / 120) % 12) === i; if (on2) dot(Math.cos(a) * R, Math.sin(a) * R, u * 1.1, '#fde047', u * 6); }
        ctx.strokeStyle = 'rgba(57,255,159,.6)'; ctx.lineWidth = u * 0.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.62, t / 900, t / 900 + 1.2); ctx.stroke();
        break;
      }
      case 'antimatter': {
        for (const fx of [0.27, 0.73]) {
          const cx = X(fx), cy = Y(0.5), R = Math.min(w0 / 2, h0) * 0.26;
          ctx.strokeStyle = '#f0abfc'; ctx.lineWidth = u * 0.5; ctx.shadowColor = '#f0abfc'; ctx.shadowBlur = u * 3;
          for (let k = 0; k < 3; k++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(t / 700 + k * Math.PI / 3 + fx * 3); ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.32, 0, 0, 7); ctx.stroke(); ctx.restore(); }
          ctx.shadowBlur = 0;
          dot(cx, cy, R * (0.22 + 0.06 * Math.sin(t / 200 + fx * 9)), '#ffffff', u * 8);
        }
        break;
      }
      case 'solar': { // sun glint sweeping over the panels
        const g = ((t / 2600 + ph * 0.1) % 1.6) - 0.3;
        ctx.save(); ctx.beginPath(); ctx.rect(X(0), Y(0), w0, h0); ctx.clip();
        const gr = ctx.createLinearGradient(X(g - 0.15), Y(0), X(g + 0.15), Y(1));
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr; ctx.globalCompositeOperation = 'lighter';
        for (const [px, py] of [[0.06, 0.2], [0.58, 0.2], [0.06, 0.62], [0.58, 0.62]]) ctx.fillRect(X(px), Y(py), w0 * 0.38, h0 * 0.2);
        ctx.restore(); break;
      }
      case 'matacc': { const R = Math.min(w0, h0) * 0.24; for (let k = 0; k < 3; k++) { const a = t / 300 + k * 2.1; dot(Math.cos(a) * R, Math.sin(a) * R, u * 0.9, '#ffffff', u * 5); } break; }
      case 'dorex': { ctx.strokeStyle = '#b4ff39'; ctx.lineWidth = u * 0.6; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, Math.min(w0, h0) * (0.1 + k * 0.06), t / (400 + k * 200) * (k % 2 ? -1 : 1), t / (400 + k * 200) * (k % 2 ? -1 : 1) + 2.5); ctx.stroke(); } break; }
      case 'aura': { ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t / 300); dot(0, 0, Math.min(w0, h0) * 0.18, '#d946ef', u * 10); ctx.globalAlpha = 1; break; }
      case 'pool': case 'lexius': { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = u * 0.4; for (let j = 0; j < 3; j++) { ctx.beginPath(); for (let k = 0; k <= 16; k++) { const x = X(0.25 + k * 0.03125); ctx.lineTo(x, Y(0.35 + j * 0.12) + Math.sin(k * 0.9 + t / 300 + j) * u * 0.6); } ctx.stroke(); } break; }
      case 'cinema': { ctx.globalAlpha = 0.35; ctx.fillStyle = `hsl(${(t / 20) % 360},90%,60%)`; ctx.fillRect(X(0.22), Y(0.15), w0 * 0.56, h0 * 0.06); ctx.globalAlpha = 1; break; }
      case 'scrap': case 'mechrest': case 'formatcells': case 'moonpark': case 'belowzero': case 'oil': {
        ctx.save(); ctx.translate(X(0.3), Y(0.32)); ctx.rotate(t / 600); ctx.fillStyle = 'rgba(245,158,11,.85)';
        for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-u * 0.4, -u * 2.2, u * 0.8, u * 1.2); }
        ctx.beginPath(); ctx.arc(0, 0, u * 1.5, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, u * 0.5, 0, 7); ctx.fill(); ctx.restore(); break;
      }
      default: {
        if (def.kind === 'facility' || def.kind === 'resource') {
          for (let k = 0; k < 3; k++) { const a = t / 1400 + k * 2.1 + ph; dot(Math.cos(a) * w0 * 0.22, Math.sin(a * 1.3) * h0 * 0.22, u * 0.5, led, u * 3); }
        }
      }
    }
    ctx.restore();
  }

  function drawBoard(canvas, st, ghost, view) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    view = view || { zoom: 1, px: 0, py: 0 };
    const s = Math.floor((Math.min(W, H) / (st.w + 1.2)) * view.zoom);
    const ox = Math.floor((W - s * st.w) / 2 + view.px), oy = Math.floor((H - s * st.h) / 2 + view.py);
    const geo = { s, ox, oy };
    const now = performance.now();

    // moon (realistic, cached texture, no glow)
    const cx = ox + s * st.w / 2, cy = oy + s * st.h / 2, R = s * 7.4;
    ctx.drawImage(moonTexture(), cx - R, cy - R, R * 2, R * 2);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) if (st.mask[y * st.w + x]) {
      ctx.strokeRect(ox + x * s + 0.5, oy + y * s + 0.5, s - 1, s - 1);
    }
    // start pads
    const powered = new Set();
    st.scores.power.forEach((p) => p.powered.forEach((id) => powered.add(id)));
    for (const p of st.placed) {
      const pl = st.players[p.owner];
      const cells = MI.absCells(p.type, p.x, p.y, p.rot);
      const neutral = !pl;
      drawPiece(ctx, p.type, cells, ox, oy, s, neutral ? '#39ff9f' : MI.COLORS[pl.color].hex, { race: neutral ? 'shared' : pl.race, rot: p.rot, unpowered: !neutral && !powered.has(p.id) });
      if (s >= 14) animPiece(ctx, p, cells, ox, oy, s, now, neutral ? 'shared' : pl.race, neutral || powered.has(p.id));
    }
    // ---- space connectors between pieces ----
    if (s >= 12) {
      const grid = new Map();
      for (const p of st.placed) MI.absCells(p.type, p.x, p.y, p.rot).forEach((c) => grid.set(c.y * st.w + c.x, { p, c }));
      const raceOf = (p) => (st.players[p.owner] ? st.players[p.owner].race : 'shared');
      for (const [, { p, c }] of grid) for (let d = 0; d < 4; d++) {
        const e = c.e[d];
        if (e !== 'i' && e !== 'o') continue;
        const nx = c.x + MI.DIRS[d][0], ny = c.y + MI.DIRS[d][1];
        const n = grid.get(ny * st.w + nx);
        const ne = n && n.p !== p ? n.c.e[(d + 2) % 4] : null;
        // seam midpoint and orientation
        const mx = ox + (c.x + 0.5 + MI.DIRS[d][0] * 0.5) * s, my = oy + (c.y + 0.5 + MI.DIRS[d][1] * 0.5) * s;
        const horiz = d % 2 === 1; // seam is vertical when connecting left-right
        ctx.save(); ctx.translate(mx, my); if (!horiz) ctx.rotate(Math.PI / 2);
        // local frame: x runs across the seam (between rooms), y along the seam
        const W = s * 0.26, L = s * 0.09;
        if (ne && ((e === 'o' && ne === 'i'))) {
          // connected: a short 3D passage across the seam (floor, side walls with tops and inner faces)
          const P1 = Art.pal(raceOf(p)), P2 = Art.pal(raceOf(n.p));
          // passage walls drawn like the room walls: a wall face with angled ends + a wall top
          const Wc = s * 0.38, Lc = s * 0.17, tw = s * 0.04, fd = s * 0.11;
          for (const sgn of [-1, 1]) {
            // same light per world side as the rooms: top .02, left -.08, right -.16, bottom -.24
            const f = horiz ? (sgn < 0 ? 0.02 : -0.24) : (sgn < 0 ? -0.16 : -0.08);
            const yo = sgn * Wc / 2, yi = sgn * (Wc / 2 - fd);
            for (const [x0, x1, Pp, side] of [[-Lc, 0, P1, -1], [0, Lc, P2, 1]]) {
              const g = ctx.createLinearGradient(0, yo, 0, yi);
              g.addColorStop(0, shade(Pp.wall, f + 0.06)); g.addColorStop(1, shade(Pp.wall, f - 0.14));
              ctx.fillStyle = g; ctx.beginPath();
              // outer edge full length, inner edge shortened at the far end => angled end like a room corner
              const xf = side < 0 ? x0 : x1, xn = side < 0 ? x1 : x0;
              ctx.moveTo(xf, yo); ctx.lineTo(xn, yo); ctx.lineTo(xn, yi); ctx.lineTo(xf - side * fd, yi); ctx.closePath(); ctx.fill();
              ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(0.5, s * 0.005);
              ctx.beginPath(); ctx.moveTo(xf, yo); ctx.lineTo(xf - side * fd, yi); ctx.lineTo(xn, yi); ctx.stroke();
              // wall top (cut) outside the face
              ctx.fillStyle = Pp.rim; ctx.fillRect(x0, sgn < 0 ? yo - tw : yo, x1 - x0, tw);
            }
            ctx.fillStyle = 'rgba(20,24,30,.8)'; ctx.fillRect(-Lc, yo - s * 0.003, Lc * 2, s * 0.006);
          }
        } else if (!ne && MI.inMask(st, nx, ny) && !grid.has(ny * st.w + nx)) {
          // free port: amber docking ring sticking out
          const dir = 1; // outward = towards the empty neighbour
          const sx = (horiz ? MI.DIRS[d][0] : MI.DIRS[d][1]) * dir;
          ctx.fillStyle = 'rgba(31,41,55,.8)'; ctx.fillRect(sx > 0 ? 0 : -s * 0.05, -W / 2, s * 0.05, W);
          ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = s * 0.04; ctx.fillStyle = 'rgba(245,158,11,.75)';
          ctx.fillRect(sx > 0 ? s * 0.04 : -s * 0.05, -W / 2, s * 0.012, W);
          ctx.beginPath(); ctx.arc(sx * s * 0.025, 0, s * 0.014, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        } else if (ne && !(e === 'i' && ne === 'o')) {
          // blocked / no passage: closed hatch (draw once)
          if (p.id < n.p.id || ne === 'w') {
            ctx.fillStyle = 'rgba(75,85,99,.85)'; ctx.fillRect(-s * 0.03, -W / 2, s * 0.06, W);
            ctx.strokeStyle = '#111827'; ctx.lineWidth = s * 0.015;
            for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-s * 0.05, k * W / 5); ctx.lineTo(s * 0.05, k * W / 5 + W / 10); ctx.stroke(); }
            ctx.shadowColor = '#ef4444'; ctx.shadowBlur = s * 0.04; ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, 0, s * 0.013, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
          }
        }
        ctx.restore();
      }
    }
    if (ghost) {
      const cells = MI.absCells(ghost.type, ghost.x, ghost.y, ghost.rot);
      drawPiece(ctx, ghost.type, cells, ox, oy, s, ghost.color, { race: ghost.race, rot: ghost.rot, alpha: 0.85, stroke: ghost.ok ? '#4ade80' : '#f87171' });
      ctx.save(); ctx.strokeStyle = ghost.ok ? '#4ade80' : '#f87171'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      for (const c of cells) ctx.strokeRect(ox + c.x * s + 2, oy + c.y * s + 2, s - 4, s - 4);
      ctx.restore();
    }
    return geo;
  }

  function drawMini(canvas, type, color, rot = 0) {
    const def = MI.PIECES[type];
    const cells = MI.absCells(type, 0, 0, rot);
    const minX = Math.min(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y));
    const cw = Math.max(...cells.map((c) => c.x)) - minX + 1, ch = Math.max(...cells.map((c) => c.y)) - minY + 1;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    const s = Math.floor(Math.min(W / (cw + 0.6), H / (ch + 0.6)));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ox = (W - cw * s) / 2 - minX * s, oy = (H - ch * s) / 2 - minY * s;
    drawPiece(ctx, type, cells, ox, oy, s, color, { rot, noLabel: def.kind === 'hallway' });
  }

  // ---------- realistic moon texture (generated once) ----------
  let moonCache = null;
  function moonTexture() {
    if (moonCache) return moonCache;
    const N = 2800, r = N / 2;
    const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    const c = cv.getContext('2d');
    let seed = 1969;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    c.save(); c.beginPath(); c.arc(r, r, r, 0, Math.PI * 2); c.clip();
    // base regolith
    const base = c.createRadialGradient(r * 0.7, r * 0.65, 0, r, r, r);
    base.addColorStop(0, '#d8d5ce'); base.addColorStop(0.6, '#b9b5ad'); base.addColorStop(1, '#8f8b84');
    c.fillStyle = base; c.fillRect(0, 0, N, N);
    // maria (dark basalt seas)
    c.filter = 'blur(18px)';
    for (let m = 0; m < 8; m++) {
      const mx = r + (rnd() - 0.5) * r * 1.3, my = r + (rnd() - 0.5) * r * 1.3, ms = r * (0.12 + rnd() * 0.22);
      c.fillStyle = `rgba(80,82,88,${0.16 + rnd() * 0.12})`;
      for (let k = 0; k < 6; k++) { c.beginPath(); c.ellipse(mx + (rnd() - 0.5) * ms, my + (rnd() - 0.5) * ms, ms * (0.5 + rnd() * 0.6), ms * (0.4 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2); c.fill(); }
    }
    c.filter = 'none';
    // fine dust noise
    const img = c.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    c.putImageData(img, 0, 0);
    // craters (light from top-left)
    const crater = (x, y, cr) => {
      const g = c.createLinearGradient(x - cr, y - cr, x + cr, y + cr);
      g.addColorStop(0, 'rgba(0,0,0,.16)'); g.addColorStop(0.55, 'rgba(0,0,0,.03)'); g.addColorStop(1, 'rgba(255,255,255,.07)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, cr, 0, Math.PI * 2); c.fill();
      c.lineWidth = Math.max(0.8, cr * 0.1);
      c.strokeStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(x, y, cr, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,.06)'; c.beginPath(); c.arc(x, y, cr * 1.04, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      if (cr > 26) { c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(x + cr * 0.05, y + cr * 0.05, cr * 0.12, 0, Math.PI * 2); c.fill(); }
    };
    for (let k = 0; k < 160; k++) {
      const a = rnd() * Math.PI * 2, dist = Math.sqrt(rnd()) * r;
      const cr = Math.max(2, Math.pow(rnd(), 4.5) * 60);
      crater(r + Math.cos(a) * dist, r + Math.sin(a) * dist, cr);
    }
    // two young craters with bright ray systems
    for (let q = 0; q < 1; q++) {
      const x = r + (rnd() - 0.5) * r, y = r + (rnd() - 0.5) * r;
      c.strokeStyle = 'rgba(255,255,255,.05)';
      for (let k = 0; k < 26; k++) { const a = rnd() * Math.PI * 2, L = r * (0.15 + rnd() * 0.45); c.lineWidth = 2 + rnd() * 6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke(); }
      crater(x, y, 18 + rnd() * 14);
      c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(x, y, 30, 0, Math.PI * 2); c.fill();
    }
    // limb darkening + soft terminator toward bottom-right
    const limb = c.createRadialGradient(r * 0.75, r * 0.7, r * 0.2, r, r, r * 1.02);
    limb.addColorStop(0, 'rgba(0,0,0,0)'); limb.addColorStop(0.7, 'rgba(0,0,0,.15)'); limb.addColorStop(1, 'rgba(0,0,0,.65)');
    c.fillStyle = limb; c.fillRect(0, 0, N, N);
    c.restore();
    // crisp lit edge on the sun side
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
    c.beginPath(); c.arc(r, r, r - 2, Math.PI * 0.95, Math.PI * 1.65); c.stroke();
    moonCache = cv;
    return cv;
  }

  // ---------- realistic starfield ----------
  function stars(canvas) {
    const ctx = canvas.getContext('2d');
    const TEMP = ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffe9c9', '#ffd2a1', '#ffcc6f'];
    const draw = () => {
      const W = innerWidth, H = innerHeight;
      canvas.width = W; canvas.height = H;
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H);
      // faint Milky Way band (diagonal)
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.45);
      ctx.filter = 'blur(40px)';
      for (let i = 0; i < 40; i++) {
        const x = (rnd() - 0.5) * W * 1.6, y = (rnd() - 0.5) * H * 0.25;
        const col = rnd() > 0.7 ? 'rgba(120,110,170,.10)' : rnd() > 0.5 ? 'rgba(170,150,130,.08)' : 'rgba(140,160,200,.09)';
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, 120 + rnd() * 220, 40 + rnd() * 80, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.filter = 'none';
      for (let i = 0; i < W * H / 500; i++) {
        const x = (rnd() - 0.5) * W * 1.6, y = (rnd() - 0.5) * H * 0.35 * (rnd() + rnd()) / 2;
        ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.35})`; ctx.fillRect(x, y, 1, 1);
      }
      ctx.restore();
      // background stars: many tiny, few bigger, colour by temperature
      for (let k = 0; k < W * H / 700; k++) {
        const x = rnd() * W, y = rnd() * H, m = Math.pow(rnd(), 4);
        ctx.globalAlpha = 0.25 + m * 0.75 + rnd() * 0.2;
        ctx.fillStyle = TEMP[(rnd() * TEMP.length) | 0];
        const rad = 0.35 + m * 1.4;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // a few bright stars with halo and diffraction spikes
      for (let k = 0; k < 14; k++) {
        const x = rnd() * W, y = rnd() * H, col = TEMP[(rnd() * TEMP.length) | 0], s = 2 + rnd() * 6;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
        g.addColorStop(0, col); g.addColorStop(0.15, col + 'aa'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x - s * 5, y); ctx.lineTo(x + s * 5, y); ctx.moveTo(x, y - s * 5); ctx.lineTo(x, y + s * 5); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    };
    draw(); addEventListener('resize', draw);
  }

  window.Render = { animPiece, drawBoard, drawMini, stars, moonTexture };
})();
