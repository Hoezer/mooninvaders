// Pure game rules: board, placement/fit, power and scoring. Used by server and browser.
(function (exp) {
  const MI = typeof module !== 'undefined'
    ? Object.assign({}, require('./pieces'), require('./races'))
    : window.MI;
  const { PIECES, RACES } = MI;

  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
  const BOARD_W = 16, BOARD_H = 16, RADIUS = 6.6;
  const START_SPOTS = [[4, 4], [11, 11], [11, 4], [4, 11]];
  const SCORE_RANGE = 4; // hallways

  function makeMask() {
    const m = [];
    for (let y = 0; y < BOARD_H; y++) for (let x = 0; x < BOARD_W; x++) {
      const dx = x + 0.5 - BOARD_W / 2, dy = y + 0.5 - BOARD_H / 2;
      m.push(dx * dx + dy * dy <= RADIUS * RADIUS);
    }
    return m;
  }
  const inMask = (s, x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.mask[y * s.w + x];

  // Rotate clockwise `rot` times.
  function absCells(type, x, y, rot) {
    return PIECES[type].cells.map((c) => {
      let dx = c.dx, dy = c.dy, e = c.e.slice();
      for (let r = 0; r < rot; r++) {
        [dx, dy] = [-dy, dx];
        e = [e[3], e[0], e[1], e[2]];
      }
      return { x: x + dx, y: y + dy, e };
    });
  }

  function buildGrid(s) {
    const g = new Map();
    for (const p of s.placed) {
      p.abs = p.abs || absCells(p.type, p.x, p.y, p.rot);
      p.abs.forEach((c, ci) => g.set(c.y * s.w + c.x, { p, ci }));
    }
    return g;
  }

  // Pieces linked by a passage (exit facing entrance) to piece p.
  function passagesOf(s, g, p) {
    const out = [];
    for (const c of p.abs) for (let d = 0; d < 4; d++) {
      const nx = c.x + DIRS[d][0], ny = c.y + DIRS[d][1];
      const n = g.get(ny * s.w + nx);
      if (!n || n.p === p) continue;
      const a = c.e[d], b = n.p.abs[n.ci].e[(d + 2) % 4];
      if ((a === 'o' && b === 'i') || (a === 'i' && b === 'o')) out.push(n.p);
    }
    return out;
  }

  function canPlace(s, owner, type, x, y, rot, g) {
    g = g || buildGrid(s);
    const def = PIECES[type];
    const cells = absCells(type, x, y, rot);
    const ownerRace = s.players[owner] && RACES[s.players[owner].race];
    const links = [];
    let touchesOwn = false;
    for (const c of cells) {
      if (!inMask(s, c.x, c.y)) return { ok: false, reason: 'Outside the moon' };
      if (g.has(c.y * s.w + c.x)) return { ok: false, reason: 'Cell is occupied' };
    }
    for (const c of cells) for (let d = 0; d < 4; d++) {
      const a = c.e[d];
      if (a === 'x') continue;
      const nx = c.x + DIRS[d][0], ny = c.y + DIRS[d][1];
      if (!inMask(s, nx, ny)) {
        if (a === 'o') return { ok: false, reason: 'A tab would stick out over the moon’s edge' };
        continue;
      }
      const n = g.get(ny * s.w + nx);
      if (!n) continue;
      const b = n.p.abs[n.ci].e[(d + 2) % 4];
      if (n.p.owner === owner) touchesOwn = true;
      if (a === 'o' && b === 'o') return { ok: false, reason: 'Two exits point at each other' };
      if (a === 'o' && b === 'w') return { ok: false, reason: 'An exit hits a wall' };
      if (a === 'w' && b === 'o') return { ok: false, reason: 'A neighbour’s exit hits a wall' };
      if ((a === 'o' && b === 'i') || (a === 'i' && b === 'o')) links.push(n.p);
    }
    if (def.kind === 'deadend') {
      return touchesOwn ? { ok: true } : { ok: false, reason: 'Must touch one of your own pieces' };
    }
    if (def.kind === 'hallway') {
      return links.some((p) => PIECES[p.type].kind === 'hallway')
        ? { ok: true } : { ok: false, reason: 'Hallways need a passage to another hallway' };
    }
    if (!links.length) return { ok: false, reason: 'Needs a passage (exit ↔ entrance) to your hallway' };
    const anyHall = ownerRace && ownerRace.anyHallway && def.kind === 'facility';
    for (const p of links) {
      const k = PIECES[p.type].kind;
      if (k !== 'hallway') return { ok: false, reason: 'Buildings may only connect to hallways' };
      if (p.owner !== owner && !anyHall) return { ok: false, reason: 'Buildings may only connect to your own hallways' };
    }
    return { ok: true };
  }

  function legalSpots(s, owner, type, limit) {
    const g = buildGrid(s), res = [];
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      if (!inMask(s, x, y) || g.has(y * s.w + x)) continue;
      for (let r = 0; r < 4; r++) if (canPlace(s, owner, type, x, y, r, g).ok) {
        res.push({ x, y, rot: r });
        if (limit && res.length >= limit) return res;
      }
    }
    return res;
  }

  // Power: resources (everything that isn't a facility) first, then facilities by highest points.
  function computePower(s, owner) {
    const race = RACES[s.players[owner].race] || { bonusPower: 0, storagePerUnit: 1, anyHallway: false };
    const mine = s.placed.filter((p) => p.owner === owner);
    let supply = race.bonusPower;
    for (const p of mine) if (PIECES[p.type].power > 0) supply += PIECES[p.type].power;
    const consumers = mine.filter((p) => PIECES[p.type].power < 0).sort((a, b) => {
      const fa = PIECES[a.type].kind === 'facility' ? 1 : 0, fb = PIECES[b.type].kind === 'facility' ? 1 : 0;
      if (fa !== fb) return fa - fb;
      return PIECES[b.type].points - PIECES[a.type].points || a.id - b.id;
    });
    let left = supply, demand = 0;
    const powered = new Set(mine.filter((p) => PIECES[p.type].power >= 0).map((p) => p.id));
    for (const p of consumers) {
      const need = -PIECES[p.type].power;
      demand += need;
      if (need <= left) { left -= need; powered.add(p.id); }
    }
    return { supply, demand, powered };
  }

  // Score: each powered facility = points x (1 + powered Rooms within SCORE_RANGE hallways).
  // Race facilities also need at least one powered race resource (supplies).
  function computeScores(s) {
    const g = buildGrid(s);
    const power = s.players.map((_, i) => computePower(s, i));
    const poweredAll = new Set();
    power.forEach((pw) => pw.powered.forEach((id) => poweredAll.add(id)));
    const details = s.players.map(() => ({ total: 0, items: [] }));
    for (const f of s.placed) {
      const def = PIECES[f.type];
      if (def.kind !== 'facility') continue;
      const d = details[f.owner];
      let reason = null;
      if (!poweredAll.has(f.id)) reason = 'no power';
      else if (def.race) {
        const hasRes = s.placed.some((p) => p.owner === f.owner && PIECES[p.type].kind === 'resource'
          && PIECES[p.type].race === def.race && poweredAll.has(p.id));
        if (!hasRes) reason = 'no race resource';
      }
      let rooms = 0;
      const roomSet = new Set();
      if (!reason) {
        let frontier = passagesOf(s, g, f).filter((p) => PIECES[p.type].kind === 'hallway');
        const seen = new Set([f.id, ...frontier.map((p) => p.id)]);
        for (let depth = 1; depth <= SCORE_RANGE && frontier.length; depth++) {
          const next = [];
          for (const h of frontier) for (const n of passagesOf(s, g, h)) {
            const k = PIECES[n.type].kind;
            if (k === 'room' && poweredAll.has(n.id)) roomSet.add(n.id);
            if (k === 'hallway' && !seen.has(n.id)) { seen.add(n.id); next.push(n); }
          }
          frontier = next;
        }
        rooms = roomSet.size;
      }
      const pts = reason ? 0 : def.points * (1 + rooms); // base points + bonus per nearby Room
      d.total += pts;
      d.items.push({ id: f.id, type: f.type, rooms, points: pts, reason, base: def.points, roomIds: reason ? [] : [...roomSet] });
    }
    return { details, power: power.map((p) => ({ supply: p.supply, demand: p.demand, powered: [...p.powered] })) };
  }

  function storageCapacity(s, owner) {
    const race = RACES[s.players[owner].race] || { bonusPower: 0, storagePerUnit: 1, anyHallway: false };
    return s.placed.filter((p) => p.owner === owner && p.type === 'small_storage').length * race.storagePerUnit;
  }

  Object.assign(exp, {
    DIRS, BOARD_W, BOARD_H, START_SPOTS, SCORE_RANGE,
    makeMask, inMask, absCells, buildGrid, passagesOf, canPlace, legalSpots,
    computePower, computeScores, storageCapacity,
  });
})(typeof module !== 'undefined' ? module.exports : (window.MI = window.MI || {}));
