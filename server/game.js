// Authoritative game state for one room.
const { PIECES } = require('../shared/pieces');
const { RACES, COLORS } = require('../shared/races');
const R = require('../shared/rules');
const crypto = require('crypto');

const MAX_PLAYERS = 4;
// Everyone starts from the shared Landing Base in the middle of the moon.
// computer players are simply called after their race
// every race has a fixed colour
const RACE_COLOR = { lustroms: 'blue', humans: 'lilac', machines: 'orange', bozob: 'purple' };
const BOT_LABEL = { lustroms: 'Lustroms', humans: 'Humans', machines: 'Machines', bozob: 'boZob' };
const STARTER = ['hall_corner', 'hall_cross_in', 'solar', 'room_out'];

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
    if (this.players.filter((p) => !p.watch).length >= MAX_PLAYERS) throw new Error('Room is full');
    const race = Object.keys(RACES).find((r) => !this.players.some((p) => p.race === r));
    const color = RACE_COLOR[race] || Object.keys(COLORS).find((c) => !this.players.some((p) => p.color === c));
    const p = {
      token: crypto.randomBytes(12).toString('hex'),
      name: String(name || 'Player').slice(0, 20), race, color,
      capsules: 0, pad: [], storage: [], orders: [], supply: {}, connected: true,
    };
    this.players.push(p);
    this.addLog(`${p.name} joined.`);
    return this.players.length - 1;
  }

  addBot(i, wanted) {
    if (i !== 0) throw new Error('Only the host can add computer players');
    if (wanted && this.players.some((p) => p.race === wanted)) throw new Error('That race is already playing');
    const race = wanted && RACES[wanted] ? wanted : Object.keys(RACES).find((r) => !this.players.some((p) => p.race === r));
    const idx = this.join(BOT_LABEL[race] || 'Computer');
    this.players[idx].race = race; this.players[idx].color = RACE_COLOR[race] || this.players[idx].color;
    this.players[idx].name = BOT_LABEL[race] || 'Computer';
    this.players[idx].bot = true;
  }

  // host only watches: no own race, picks which races play as computers, then starts
  watch(i, on) {
    if (i !== 0 || this.status !== 'lobby') throw new Error('Only the host can do that in the lobby');
    const p = this.players[0];
    if (on) {
      if (this.players.some((q, j) => j !== 0 && !q.bot && !q.local)) throw new Error('Watch mode is only possible when no other people joined online');
      // another human plays on this PC: the host simply takes over that seat instead of watching
      const L = this.players.findIndex((q) => q.local);
      if (L >= 0) { const q = this.players[L]; p.race = q.race; p.color = q.color; p.name = q.name; this.players.splice(L, 1); return; }
      p.watch = true; p.race = null; p.color = null;
    } else if (p.watch) {
      p.watch = false;
      p.race = Object.keys(RACES).find((r) => !this.players.some((q) => q.race === r)) || null;
      p.color = RACE_COLOR[p.race] || null;
    }
  }

  // a second human playing on the host's device (hot seat)
  rename(i, idx, name) {
    const p = this.players[idx];
    if (!p || this.status !== 'lobby') throw new Error('Not allowed');
    if (idx !== i && !(i === 0 && p.local)) throw new Error('You can only rename yourself');
    p.name = String(name || '').trim().slice(0, 20) || p.name;
  }

  addLocal(i, wanted, name) {
    if (i !== 0) throw new Error('Only the host can add players');
    if (wanted && this.players.some((p) => p.race === wanted)) throw new Error('That race is already playing');
    const race = wanted && RACES[wanted] ? wanted : Object.keys(RACES).find((r) => !this.players.some((p) => p.race === r));
    const n = this.players.filter((p) => !p.bot && !p.watch).length + 1;
    const idx = this.join(String(name || '').trim().slice(0, 20) || 'Player ' + n);
    Object.assign(this.players[idx], { race, color: RACE_COLOR[race] || this.players[idx].color, local: true });
  }

  // play again: back to the lobby with the same room and line-up, everything else fresh.
  // In a watched AI game the host was taken out of the players at the start, so a watcher seat comes back first.
  rematch(watcher) {
    if (this.status === 'lobby') throw new Error('Already in the lobby');
    const keep = ['token', 'name', 'race', 'color', 'bot', 'local', 'watch', 'connected'];
    this.players = this.players.map((p) => {
      const q = { capsules: 0, pad: [], storage: [], orders: [], supply: {} };
      for (const k of keep) if (k in p) q[k] = p[k];
      return q;
    });
    let hostIdx = 0;
    if (watcher) {
      this.players.unshift({ token: crypto.randomBytes(12).toString('hex'), name: 'Host', race: null, color: null, watch: true,
        capsules: 0, pad: [], storage: [], orders: [], supply: {}, connected: true });
    }
    Object.assign(this, { status: 'lobby', placed: [], turn: 0, round: 1, phase: 'build', lastRoll: null, log: [],
      nextId: 1, nextUid: 1, placedThisRound: false, idleRounds: 0, endReason: null, specToken: null });
    this.addLog('New game in the same room.');
    return hostIdx;
  }

  // the device that controls player i also controls the local players while it is their turn
  actor(idx) {
    const cur = this.players[this.turn];
    return this.status === 'playing' && idx === 0 && cur && cur.local ? this.turn : idx;
  }

  removeBot(i, idx) {
    if (i !== 0 || this.status !== 'lobby') throw new Error('Not allowed');
    if (!this.players[idx] || idx === 0) throw new Error('Not allowed');
    this.players.splice(idx, 1);
  }

  // One bot step. Returns true if it did something (call again later).
  // ---------- computer player ----------
  // Free doorways a player can still build onto (own pieces' open i/o edges facing empty moon cells).
  botOpenDoors(i) {
    const occ = new Set();
    // pieces never move, so a cached q.abs is always valid
    const cells = (q) => q.abs || (q.abs = R.absCells(q.type, q.x, q.y, q.rot));
    for (const q of this.placed) for (const c of cells(q)) occ.add(c.y * this.w + c.x);
    let n = 0;
    for (const q of this.placed) {
      if (q.owner !== i && !(q.owner === -1)) continue;
      for (const c of cells(q)) {
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
    // the trial piece is a fresh object; the cached cells of the real pieces stay valid
    this.placed.push({ id: -1, type, owner: i, x: sp.x, y: sp.y, rot: sp.rot });
    const sc = R.computeScores(this);
    const mine = sc.details[i].total;
    let opp = 0; sc.details.forEach((d, j) => { if (j !== i) opp += d.total; });
    const doors = this.botOpenDoors(i);
    this.placed.pop();
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
      else { p.botWasted = (p.botWasted || 0) + 1; this.discard(i, item.uid); }
      return true;
    }

    // ---- order phase: buy what is worth the most right now ----
    if (p.orders.length >= 3) { this.endTurn(i); return true; }
    for (const q of this.placed) delete q.abs;
    const pw = R.computePower(this, i);
    const pendingPower = p.orders.reduce((s, o) => s + PIECES[o.type].power, 0);
    const powerLeft = pw.supply + pendingPower - pw.demand;
    const wallet = p.capsules;
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
        if (!this.canOrderType(i, t)) v = 0;                         // needs a built race resource first
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
        // a storage saves pieces that don't fit yet instead of throwing them away
        const have = R.storageCapacity(this, i) + ordered('storage');
        v = have === 0 ? 10 + Math.min(12, (p.botWasted || 0) * 4) + (RACES[p.race].storagePerUnit > 1 ? 6 : 0) : (p.botWasted || 0) > 3 && have < 2 ? 6 : 0;
      } else v = 0.5;
      for (const q of this.placed) delete q.abs;
      if (d.kind !== 'storage' && R.legalSpots(this, i, t, 3).length < 3) v *= 0.5;   // barely fits: risky to order
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
      p.race = race; p.watch = false; if (RACE_COLOR[race]) p.color = RACE_COLOR[race];
    }
    if (color && COLORS[color]) {
      if (this.players.some((q, j) => j !== i && q.color === color)) throw new Error('Colour already taken');
      p.color = color;
    }
  }

  start(i) {
    if (i !== 0) throw new Error('Only the host can start');
    if (this.status !== 'lobby') throw new Error('Already started');
    let watcher = false;
    if (this.players[0] && this.players[0].watch) {
      if (this.players.length < 3) throw new Error('Add at least 2 computer races to watch');
      this.players.splice(0, 1); watcher = true;
      this.specToken = crypto.randomBytes(12).toString('hex');
    }
    if (this.players.length < 2) throw new Error('Need at least 2 players (add a computer player)');
    this.status = 'playing';
    for (const p of this.players) if (p.bot && BOT_LABEL[p.race]) p.name = BOT_LABEL[p.race];
    this.placed.push({ id: this.nextId++, type: 'landing', owner: -1, x: this.w / 2 - 1, y: this.h / 2 - 1, rot: 0 });
    this.players.forEach((p) => {
      for (const [t, d] of Object.entries(PIECES)) if (!d.neutral && (!d.race || d.race === p.race)) p.supply[t] = d.count;
      for (const t of STARTER) { p.supply[t]--; p.pad.push({ uid: this.nextUid++, type: t }); }
    });
    // a random player starts; rounds turn over when it is their turn again
    this.firstTurn = Math.floor(Math.random() * this.players.length);
    this.turn = this.firstTurn; this.phase = 'build';
    this.introUntil = Date.now() + 7000; // let the launch intro play before computers move
    this.addLog('The colonization of the moon has begun!');
    this.addLog(`${this.players[this.turn].name} was chosen to start.`);
    return watcher;
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
    if (p.storage.length >= R.storageCapacity(this, i)) throw new Error('No free storage (build a Small Storage)');
    p.storage.push(this.takeFrom(p.pad, uid));
  }

  retrieve(i, uid) {
    const p = this.me(i);
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
    this.addLog(`${p.name} scrapped ${PIECES[item.type].name}.`);
  }

  doneBuild(i) {
    const p = this.me(i);
    // drawing, building and ordering may be mixed; capsules can be drawn once per turn
    if (this.phase !== 'build') throw new Error('You already drew capsules this turn');
    const roll = 1 + Math.floor(Math.random() * 4);
    const gain = 1 + roll + RACES[p.race].extraCapsules;
    p.capsules += gain;
    this.lastRoll = { player: i, roll, gain };
    this.phase = 'order';
    this.addLog(`${p.name} drew ${gain} capsules.`);
  }

  // a race facility can only be ordered once you have built one of your race resources
  canOrderType(i, type) {
    const d = PIECES[type];
    return !(d && d.kind === 'facility' && d.race) || this.placed.some((q) => q.owner === i && PIECES[q.type].kind === 'resource' && PIECES[q.type].race === d.race);
  }

  order(i, type) {
    const p = this.me(i);
    const d = PIECES[type];
    if (!d || !(p.supply[type] > 0)) throw new Error('None left of that piece');
    if (!this.canOrderType(i, type)) throw new Error('Build one of your race resources first');
    if (p.capsules < d.cost) throw new Error('Not enough capsules');
    p.capsules -= d.cost; p.supply[type]--;
    p.orders.push({ uid: this.nextUid++, type });
  }

  cancelOrder(i, uid) {
    const p = this.me(i);
    const o = this.takeFrom(p.orders, uid);
    p.capsules += PIECES[o.type].cost; p.supply[o.type]++;
  }

  endTurn(i) {
    const p = this.me(i);
    if (this.phase !== 'order') throw new Error('Draw your capsules first');
    if (p.pad.length) throw new Error('Build, store or scrap every landed piece first');
    if (p.orders.length) this.addLog(`${p.name} ordered ${p.orders.length} piece(s).`);
    p.incoming = p.orders; p.orders = [];
    this.turn = (this.turn + 1) % this.players.length;
    if (this.turn === (this.firstTurn || 0)) {
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

  // scores can be passed in so a broadcast computes them once for all connections
  view(forIdx, scores) {
    if (!scores) { for (const q of this.placed) delete q.abs; scores = R.computeScores(this); }
    return {
      code: this.code, status: this.status, you: forIdx, botDelay: this.botDelay || 600, endReason: this.endReason || null,
      w: this.w, h: this.h, mask: this.mask, placed: this.placed.map(({ abs, ...q }) => q),
      turn: this.turn, firstTurn: this.firstTurn || 0, round: this.round, phase: this.phase, lastRoll: this.lastRoll, log: this.log,
      scores,
      players: this.players.map((p, idx) => ({
        name: p.name, race: p.race, color: p.color, watch: !!p.watch, local: !!p.local, capsules: p.capsules, connected: p.connected, bot: !!p.bot,
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


// ---- Rooms: the message protocol, shared by the Node server (server/index.js) and the browser's
// local mode (public/local-server.js). A connection is any object { game, idx }; the host supplies
//   send(conn, msg)   deliver one message object to a connection
//   conns()           every current connection
//   stopWhenAlone     stop computer turns when nobody is connected to the game (local mode)
//   texts             optional error texts: { noRoom, noResume }
const BOT_NAMES = ['HAL-9', 'Lunatron', 'Crater Bot', 'Moonbeam AI'];

class Rooms {
  constructor(host) {
    this.host = host;
    this.texts = Object.assign({ noRoom: 'Room not found', noResume: 'Could not rejoin that game' }, host.texts);
    this.games = new Map();
  }

  newCode() {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let c;
    do c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); while (this.games.has(c));
    return c;
  }

  connsOf(game) { return [...this.host.conns()].filter((c) => c.game === game); }

  // attach a connection to a seat (-1 = watching) and tell it so
  attach(conn, game, idx, token) {
    conn.game = game; conn.idx = idx;
    this.host.send(conn, { t: 'joined', code: game.code, token });
  }

  broadcast(game) {
    const conns = this.connsOf(game);
    if (this.host.stopWhenAlone && !conns.length) return;
    this.scheduleBot(game);
    if (!conns.length) return;
    for (const q of game.placed) delete q.abs;
    const scores = R.computeScores(game);
    for (const c of conns) this.host.send(c, { t: 'state', state: game.view(c.idx >= 0 ? game.actor(c.idx) : c.idx, scores) });
  }

  scheduleBot(game) {
    if (game.botTimer || game.status !== 'playing' || !game.players[game.turn].bot) return;
    game.botTimer = setTimeout(() => {
      game.botTimer = null;
      try { game.botStep(); } catch (e) { console.error('Bot error:', e.message); try { game.endTurn(game.turn); } catch (_) { game.phase = 'order'; } }
      this.broadcast(game);
    }, Math.max(game.botDelay || 600, (game.introUntil || 0) - Date.now()));
  }

  handle(conn, m) {
    try { this.dispatch(conn, m); } catch (e) { this.host.send(conn, { t: 'error', msg: e.message }); }
  }

  dispatch(conn, m) {
    if (m.t === 'create' && m.spectate) {
      // 4 computer players, the creator watches
      const code = this.newCode(), game = new Game(code);
      this.games.set(code, game);
      game.specToken = crypto.randomBytes(12).toString('hex');
      for (const n of BOT_NAMES) { const i = game.join(n); game.players[i].bot = true; }
      game.start(0);
      this.attach(conn, game, -1, game.specToken);
      return this.broadcast(game);
    }
    if (m.t === 'create' || m.t === 'join') {
      const code = m.t === 'create' ? this.newCode() : String(m.code || '').toUpperCase();
      if (m.t === 'create') this.games.set(code, new Game(code));
      const game = this.games.get(code);
      if (!game) throw new Error(this.texts.noRoom);
      if (m.t === 'join' && game.players[0] && game.players[0].watch) throw new Error('This room is set up as an AI game to watch');
      const idx = game.join(m.name);
      // a new room starts as you against the computer: you get a random race, plus one computer race
      if (m.t === 'create') {
        const all = Object.keys(RACES);
        game.pick(idx, all[Math.floor(Math.random() * all.length)]);
        const free = all.filter((r) => !game.players.some((p) => p.race === r));
        game.addBot(0, free[Math.floor(Math.random() * free.length)]);
      }
      this.attach(conn, game, idx, game.players[idx].token);
      return this.broadcast(game);
    }
    if (m.t === 'resume') {
      const game = this.games.get(String(m.code || '').toUpperCase());
      if (game && game.specToken && m.token === game.specToken) { this.attach(conn, game, -1, m.token); return this.broadcast(game); }
      const idx = game ? game.players.findIndex((p) => p.token === m.token) : -1;
      if (idx < 0) throw new Error(this.texts.noResume);
      game.players[idx].connected = true;
      this.attach(conn, game, idx, m.token);
      return this.broadcast(game);
    }

    const game = conn.game;
    if (!game) throw new Error('Join a game first');
    const idx = game.actor(conn.idx);
    switch (m.t) {
      // lobby
      case 'pick': game.pick(idx, m.race, m.color); break;
      case 'start': if (game.start(idx)) this.attach(conn, game, -1, game.specToken); break;
      case 'watch': game.watch(idx, !!m.on); break;
      case 'addBot': game.addBot(idx, m.race); break;
      case 'addLocal': game.addLocal(idx, m.race, m.name); break;
      case 'rename': game.rename(idx, m.idx | 0, m.name); break;
      case 'leave':
        if (game.status === 'lobby' && idx > 0) { game.players.splice(idx, 1); for (const c of this.connsOf(game)) if (c.idx > idx) c.idx--; }
        conn.game = null; break;
      case 'removeBot': {
        const k = m.idx | 0; game.removeBot(idx, k);
        // keep every connection pointing at the right seat; the removed online player goes back to the start
        for (const c of this.connsOf(game)) {
          if (c.idx === k) { c.game = null; this.host.send(c, { t: 'kicked' }); }
          else if (c.idx > k) c.idx--;
        }
        break;
      }
      // host controls
      case 'finishNow':
        if (conn.idx > 0) throw new Error('Only the host can end the game');
        if (game.status !== 'playing') throw new Error('Game is not running');
        game.finish('Ended early by the host.'); break;
      case 'rematch': {
        if (conn.idx > 0) throw new Error('Only the host can start a new game');
        const watcher = conn.idx < 0;
        clearTimeout(game.botTimer); game.botTimer = null;
        game.rematch(watcher);
        if (watcher) this.attach(conn, game, 0, game.players[0].token);
        break;
      }
      case 'speed':
        if (conn.idx > 0) throw new Error('Only the host can change the speed');
        game.botDelay = Math.max(40, Math.min(2000, m.ms | 0)); break;
      // turn actions
      case 'place': game.place(idx, m.uid, m.x, m.y, m.rot); break;
      case 'store': game.store(idx, m.uid); break;
      case 'retrieve': game.retrieve(idx, m.uid); break;
      case 'discard': game.discard(idx, m.uid); break;
      case 'doneBuild': game.doneBuild(idx); break;
      case 'order': game.order(idx, m.type); break;
      case 'cancelOrder': game.cancelOrder(idx, m.uid); break;
      case 'endTurn': game.endTurn(idx); break;
      default: throw new Error('Unknown action');
    }
    this.broadcast(game);
  }
}

module.exports = { Game, Rooms };
