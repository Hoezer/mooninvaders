// Authoritative game state for one room.
const { PIECES } = require('../shared/pieces');
const { RACES, COLORS } = require('../shared/races');
const R = require('../shared/rules');
const crypto = require('crypto');

const MAX_PLAYERS = 4;
// Everyone starts from the shared Landing Base in the middle of the moon.
const STARTER = ['hall_corner', 'hall_cross_in', 'solar', 'room_in'];

class Game {
  constructor(code) {
    this.code = code;
    this.status = 'lobby'; // lobby | playing | ended
    this.players = [];
    this.w = R.BOARD_W; this.h = R.BOARD_H; this.mask = R.makeMask();
    this.placed = [];
    this.turn = 0; this.round = 1; this.phase = 'build';
    this.lastRoll = null;
    this.log = [];
    this.nextId = 1; this.nextUid = 1;
    this.placedThisRound = false;
  }

  addLog(msg) { this.log.push(msg); if (this.log.length > 60) this.log.shift(); }

  join(name) {
    if (this.status !== 'lobby') throw new Error('Game already started');
    if (this.players.length >= MAX_PLAYERS) throw new Error('Room is full');
    const race = Object.keys(RACES).find((r) => !this.players.some((p) => p.race === r));
    const color = Object.keys(COLORS).find((c) => !this.players.some((p) => p.color === c));
    const p = {
      token: crypto.randomBytes(12).toString('hex'),
      name: String(name || 'Player').slice(0, 20), race, color,
      capsules: 0, pad: [], storage: [], orders: [], supply: {}, connected: true,
    };
    this.players.push(p);
    this.addLog(`${p.name} joined.`);
    return this.players.length - 1;
  }

  addBot(i) {
    if (i !== 0) throw new Error('Only the host can add computer players');
    const BOT_NAMES = ['HAL-9', 'Lunatron', 'Crater Bot', 'Moonbeam AI'];
    const idx = this.join(BOT_NAMES[this.players.length % BOT_NAMES.length]);
    this.players[idx].bot = true;
  }

  removeBot(i, idx) {
    if (i !== 0 || this.status !== 'lobby') throw new Error('Not allowed');
    if (!this.players[idx] || !this.players[idx].bot) throw new Error('Not a computer player');
    this.players.splice(idx, 1);
  }

  // One bot step. Returns true if it did something (call again later).
  // ---------- computer player ----------
  // Free doorways a player can still build onto (own pieces' open i/o edges facing empty moon cells).
  botOpenDoors(i) {
    const occ = new Set();
    for (const q of this.placed) for (const c of R.absCells(q.type, q.x, q.y, q.rot)) occ.add(c.y * this.w + c.x);
    let n = 0;
    for (const q of this.placed) {
      if (q.owner !== i && !(q.owner === -1)) continue;
      for (const c of R.absCells(q.type, q.x, q.y, q.rot)) {
        for (let d = 0; d < 4; d++) {
          const e = c.e[d]; if (e !== 'i' && e !== 'o') continue;
          const nx = c.x + R.DIRS[d][0], ny = c.y + R.DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h || !this.mask[ny * this.w + nx] || occ.has(ny * this.w + nx)) continue;
          n += PIECES[q.type].kind === 'hallway' ? 1 : 0.3;
        }
      }
    }
    return n;
  }

  // How good is it for player i to put `type` at spot sp? Higher is better.
  botValue(i, type, sp, base) {
    this.placed.push({ id: -1, type, owner: i, x: sp.x, y: sp.y, rot: sp.rot });
    for (const q of this.placed) delete q.abs;
    const sc = R.computeScores(this);
    const mine = sc.details[i].total;
    let opp = 0; sc.details.forEach((d, j) => { if (j !== i) opp += d.total; });
    const doors = this.botOpenDoors(i);
    this.placed.pop();
    for (const q of this.placed) delete q.abs;
    // keep the base compact so guest rooms stay within 4 hallways of facilities
    const own = this.placed.filter((q) => q.owner === i);
    let cx = this.w / 2, cy = this.h / 2;
    if (own.length) { cx = own.reduce((a, q) => a + q.x, 0) / own.length; cy = own.reduce((a, q) => a + q.y, 0) / own.length; }
    const spread = Math.hypot(sp.x - cx, sp.y - cy);
    const kind = PIECES[type].kind;
    let v = (mine - base.mine) * 12            // points gained now
      + (base.opp - opp) * 4                    // points denied to opponents
      + Math.min(doors, 10) * (kind === 'hallway' ? 1.6 : 0.8) // room to keep growing
      - spread * (kind === 'room' || kind === 'facility' ? 0.6 : 0.25)
      + Math.random() * 0.3;
    if (doors < 2) v -= 6;                      // never box yourself in
    return v;
  }

  botBestSpot(i, type) {
    for (const q of this.placed) delete q.abs;
    let spots = R.legalSpots(this, i, type);
    if (!spots.length) return null;
    if (spots.length > 160) spots = spots.sort(() => Math.random() - 0.5).slice(0, 160);
    for (const q of this.placed) delete q.abs;
    const sc = R.computeScores(this);
    const base = { mine: sc.details[i].total, opp: sc.details.reduce((a, d, j) => a + (j !== i ? d.total : 0), 0) };
    let best = null, bestVal = -Infinity;
    for (const sp of spots) { const v = this.botValue(i, type, sp, base); if (v > bestVal) { bestVal = v; best = sp; } }
    return { sp: best, val: bestVal, gain: bestVal };
  }

  botStep() {
    if (this.status !== 'playing') return false;
    const i = this.turn, p = this.players[i];
    if (!p.bot) return false;
    if (this.phase === 'build') {
      // pull a useful piece back out of storage when the pad is empty
      if (!p.pad.length && p.storage.length) {
        const s = p.storage.find((it) => { for (const q of this.placed) delete q.abs; return R.legalSpots(this, i, it.type, 1).length; });
        if (s) { this.retrieve(i, s.uid); return true; }
      }
      if (!p.pad.length) { this.doneBuild(i); return true; }
      // build the most valuable piece on the pad first
      let pick = null;
      for (const item of p.pad) {
        const b = this.botBestSpot(i, item.type);
        if (b && (!pick || b.val > pick.b.val)) pick = { item, b };
      }
      if (pick) { this.place(i, pick.item.uid, pick.b.sp.x, pick.b.sp.y, pick.b.sp.rot); return true; }
      const item = p.pad[0];
      if (p.storage.length < R.storageCapacity(this, i)) this.store(i, item.uid);
      else this.discard(i, item.uid);
      return true;
    }

    // ---- order phase: buy what is worth the most right now ----
    if (p.orders.length >= 3) { this.endTurn(i); return true; }
    for (const q of this.placed) delete q.abs;
    const pw = R.computePower(this, i);
    const pendingPower = p.orders.reduce((s, o) => s + PIECES[o.type].power, 0);
    const powerLeft = pw.supply + pendingPower - pw.demand;
    const spent = p.orders.reduce((s, o) => s + PIECES[o.type].cost, 0);
    const wallet = p.capsules;
    void spent;
    const mine = this.placed.filter((q) => q.owner === i);
    const ordered = (k) => p.orders.filter((o) => PIECES[o.type].kind === k).length;
    const count = (k) => mine.filter((q) => PIECES[q.type].kind === k).length + ordered(k);
    const sc = R.computeScores(this);
    const unpowered = sc.details[i].items.filter((it) => it.reason === 'no power').length;
    const needsRes = sc.details[i].items.some((it) => it.reason === 'no race resource');
    const doors = this.botOpenDoors(i);

    const cands = [];
    for (const t of Object.keys(p.supply)) {
      const d = PIECES[t];
      if (p.supply[t] <= 0 || d.cost > wallet) continue;
      for (const q of this.placed) delete q.abs;
      if (!R.legalSpots(this, i, t, 1).length) continue;
      let v = 0;
      if (d.kind === 'facility') {
        if (-d.power > powerLeft) v = d.points * 0.5;               // can't power it yet
        else { const b = this.botBestSpot(i, t); v = b ? 6 + d.points * 3 + Math.max(0, b.gain) * 0.4 : 0; }
        if (d.race && !mine.some((q) => PIECES[q.type].kind === 'resource' && PIECES[q.type].race === d.race) && !p.orders.some((o) => PIECES[o.type].kind === 'resource')) v *= 0.4;
      } else if (d.kind === 'room') {
        const b = this.botBestSpot(i, t);
        v = 5 + (b ? Math.max(0, b.gain) * 0.6 : 0) + (count('facility') > count('room') ? 6 : 0);
      } else if (d.kind === 'generator') {
        v = (powerLeft < 30 ? 22 : powerLeft < 60 ? 10 : 2) + unpowered * 12;
      } else if (d.kind === 'resource') {
        v = needsRes ? 30 : (count('resource') === 0 ? 14 : 1);
      } else if (d.kind === 'hallway') {
        v = doors < 3 ? 20 : doors < 6 ? 9 : 3;
        if (t === 'hall_cross_out' || t === 'hall_cross_in') v += 2;  // more branches
      } else if (d.kind === 'storage') {
        v = R.storageCapacity(this, i) === 0 && count('storage') === 0 ? 4 : 0;
      } else v = 0.5;
      v = v / Math.max(1, d.cost) * 2 + v * 0.5;                       // value for money, but big wins still matter
      cands.push({ t, v });
    }
    cands.sort((a, b) => b.v - a.v);
    if (cands.length && cands[0].v > 1.5) { this.order(i, cands[0].t); return true; }
    this.endTurn(i);
    return true;
  }

  pick(i, race, color) {
    if (this.status !== 'lobby') throw new Error('Game already started');
    const p = this.players[i];
    if (race && RACES[race]) {
      if (this.players.some((q, j) => j !== i && q.race === race)) throw new Error('Race already taken');
      p.race = race;
    }
    if (color && COLORS[color]) {
      if (this.players.some((q, j) => j !== i && q.color === color)) throw new Error('Colour already taken');
      p.color = color;
    }
  }

  start(i) {
    if (i !== 0) throw new Error('Only the host can start');
    if (this.status !== 'lobby') throw new Error('Already started');
    if (this.players.length < 2) throw new Error('Need at least 2 players (add a computer player)');
    this.status = 'playing';
    this.placed.push({ id: this.nextId++, type: 'landing', owner: -1, x: this.w / 2 - 1, y: this.h / 2 - 1, rot: 0 });
    this.players.forEach((p) => {
      for (const [t, d] of Object.entries(PIECES)) if (!d.neutral && (!d.race || d.race === p.race)) p.supply[t] = d.count;
      for (const t of STARTER) { p.supply[t]--; p.pad.push({ uid: this.nextUid++, type: t }); }
    });
    this.turn = 0; this.phase = 'build';
    this.addLog('The colonization of the moon has begun!');
    this.addLog(`${this.players[0].name}'s turn.`);
  }

  me(i) {
    if (this.status !== 'playing') throw new Error('Game is not running');
    if (i !== this.turn) throw new Error('Not your turn');
    return this.players[i];
  }

  takeFrom(list, uid) {
    const k = list.findIndex((x) => x.uid === uid);
    if (k < 0) throw new Error('Piece not found');
    return list.splice(k, 1)[0];
  }

  place(i, uid, x, y, rot) {
    const p = this.me(i);
    if (this.phase !== 'build') throw new Error('You can only build in the build phase');
    const item = p.pad.find((q) => q.uid === uid);
    if (!item) throw new Error('Piece not on your landing pad');
    rot = ((rot | 0) % 4 + 4) % 4;
    for (const q of this.placed) delete q.abs;
    const chk = R.canPlace(this, i, item.type, x | 0, y | 0, rot);
    if (!chk.ok) throw new Error(chk.reason);
    this.takeFrom(p.pad, uid);
    this.placed.push({ id: this.nextId++, type: item.type, owner: i, x: x | 0, y: y | 0, rot });
    this.placedThisRound = true;
    this.addLog(`${p.name} built ${PIECES[item.type].name}.`);
  }

  store(i, uid) {
    const p = this.me(i);
    if (this.phase !== 'build') throw new Error('Only in the build phase');
    if (p.storage.length >= R.storageCapacity(this, i)) throw new Error('No free storage (build a Small Storage)');
    p.storage.push(this.takeFrom(p.pad, uid));
  }

  retrieve(i, uid) {
    const p = this.me(i);
    if (this.phase !== 'build') throw new Error('Only in the build phase');
    p.pad.push(this.takeFrom(p.storage, uid));
  }

  discard(i, uid) {
    const p = this.me(i);
    const item = p.pad.find((q) => q.uid === uid);
    if (!item) throw new Error('Piece not on your landing pad');
    for (const q of this.placed) delete q.abs;
    if (R.legalSpots(this, i, item.type, 1).length) throw new Error('This piece still fits somewhere: you must build it');
    if (p.storage.length < R.storageCapacity(this, i)) throw new Error('You still have room in storage');
    this.takeFrom(p.pad, uid);
    this.addLog(`${p.name}'s ${PIECES[item.type].name} drifted off into space.`);
  }

  doneBuild(i) {
    const p = this.me(i);
    if (this.phase !== 'build') throw new Error('Not in the build phase');
    if (p.pad.length) throw new Error('Build, store or discard every landed piece first');
    const roll = 1 + Math.floor(Math.random() * 4);
    const gain = 1 + roll + RACES[p.race].extraCapsules;
    p.capsules += gain;
    this.lastRoll = { player: i, roll, gain };
    this.phase = 'order';
    this.addLog(`${p.name} drew ${gain} capsules.`);
  }

  order(i, type) {
    const p = this.me(i);
    if (this.phase !== 'order') throw new Error('Not in the order phase');
    const d = PIECES[type];
    if (!d || !(p.supply[type] > 0)) throw new Error('None left of that piece');
    if (p.capsules < d.cost) throw new Error('Not enough capsules');
    p.capsules -= d.cost; p.supply[type]--;
    p.orders.push({ uid: this.nextUid++, type });
  }

  cancelOrder(i, uid) {
    const p = this.me(i);
    if (this.phase !== 'order') throw new Error('Not in the order phase');
    const o = this.takeFrom(p.orders, uid);
    p.capsules += PIECES[o.type].cost; p.supply[o.type]++;
  }

  endTurn(i) {
    const p = this.me(i);
    if (this.phase !== 'order') throw new Error('Finish building first');
    if (p.orders.length) this.addLog(`${p.name} ordered ${p.orders.length} piece(s).`);
    p.incoming = p.orders; p.orders = [];
    this.turn = (this.turn + 1) % this.players.length;
    if (this.turn === 0) {
      this.idleRounds = this.placedThisRound ? 0 : (this.idleRounds || 0) + 1;
      if (this.idleRounds >= 3) return this.finish('Three rounds passed without anyone building.');
      this.placedThisRound = false; this.round++;
    }
    const n = this.players[this.turn];
    if (n.incoming) { n.pad.push(...n.incoming); n.incoming = null; }
    this.phase = 'build';
    if (!this.mask.some((m, idx) => m && !this.placed.some((q) => (q.abs || R.absCells(q.type, q.x, q.y, q.rot)).some((c) => c.y * this.w + c.x === idx)))) {
      return this.finish('The moon is fully built.');
    }
    const nothingLeft = this.players.every((q) => !q.pad.length && !q.storage.length && !(q.incoming || []).length
      && Object.values(q.supply).every((v) => v <= 0));
    if (nothingLeft) return this.finish('Every race has used all its pieces.');
    this.addLog(`${n.name}'s turn.`);
  }

  finish(why) {
    this.status = 'ended';
    this.endReason = why;
    this.addLog(`Game over: ${why}`);
  }

  view(forIdx) {
    for (const q of this.placed) delete q.abs;
    const scores = R.computeScores(this);
    return {
      code: this.code, status: this.status, you: forIdx, botDelay: this.botDelay || 600, endReason: this.endReason || null,
      w: this.w, h: this.h, mask: this.mask, placed: this.placed.map(({ abs, ...q }) => q),
      turn: this.turn, round: this.round, phase: this.phase, lastRoll: this.lastRoll, log: this.log,
      scores,
      players: this.players.map((p, idx) => ({
        name: p.name, race: p.race, color: p.color, capsules: p.capsules, connected: p.connected, bot: !!p.bot,
        storageCap: this.status === 'lobby' ? 0 : R.storageCapacity(this, idx),
        // other players' requests are only shown face down: the puzzle shape, not the building
        ...(forIdx === idx || forIdx < 0
          ? { pad: p.pad, storage: p.storage, orders: p.orders, incoming: (p.incoming || []).map((o) => o.type), supply: p.supply }
          : { pad: p.pad, storage: p.storage.map((it) => ({ uid: it.uid, hidden: true })), orders: [], incoming: [], supply: {} }),
        requestShapes: [...p.orders.map((o) => o.type), ...(p.incoming || []).map((o) => o.type)].map((t) => PIECES[t].cells.map((c) => ({ dx: c.dx, dy: c.dy, e: c.e }))),
      })),
    };
  }
}

module.exports = { Game };
