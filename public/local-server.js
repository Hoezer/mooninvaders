// Local mode: when no game server is available (e.g. a static Netlify site), the browser runs the
// game itself with the same Game class as the server. Supports playing against computers and
// watching 4 computers; real online multiplayer still needs the Node server.
(function () {
  let gameReady = null;
  function loadGame() {
    if (window.MIGame) return Promise.resolve();
    if (!gameReady) gameReady = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = 'game-local.js'; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
    });
    return gameReady;
  }

  const games = new Map();
  const BOTS = ['HAL-9', 'Lunatron', 'Crater Bot', 'Moonbeam AI'];
  const newCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); while (games.has(c)); return c; };

  class LocalSocket {
    constructor() {
      this.readyState = 0; this.game = null; this.idx = -1;
      loadGame().then(() => { this.readyState = 1; if (this.onopen) this.onopen(); })
        .catch(() => { if (this.onclose) this.onclose(); });
    }
    emit(o) { setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(o) }), 0); }
    broadcast() {
      const g = this.game; if (!g) return;
      this.emit({ t: 'state', state: g.view(this.idx >= 0 ? g.actor(this.idx) : this.idx) });
      if (g.botTimer || g.status !== 'playing' || !g.players[g.turn].bot) return;
      g.botTimer = setTimeout(() => {
        g.botTimer = null;
        try { g.botStep(); } catch (e) { console.error('Bot error:', e); try { g.endTurn(g.turn); } catch (_) { g.phase = 'order'; } }
        if (this.game === g) this.broadcast();
      }, Math.max(g.botDelay || 600, (g.introUntil || 0) - Date.now()));
    }
    close() { this.readyState = 3; if (this.game) { clearTimeout(this.game.botTimer); this.game.botTimer = null; } this.game = null; }
    send(raw) {
      const m = JSON.parse(raw);
      try {
        const Game = window.MIGame;
        if (m.t === 'create' && m.spectate) {
          const code = newCode(), g = new Game(code); games.set(code, g);
          g.specToken = 'spec-' + code;
          for (const n of BOTS) { const i = g.join(n); g.players[i].bot = true; }
          g.start(0);
          this.game = g; this.idx = -1;
          this.emit({ t: 'joined', code, token: g.specToken });
          return this.broadcast();
        }
        if (m.t === 'create' || m.t === 'join') {
          if (m.t === 'join' && !games.has(String(m.code || '').toUpperCase())) throw new Error('Joining other players needs the online game server. Play against computers instead.');
          const code = m.t === 'create' ? newCode() : String(m.code).toUpperCase();
          if (m.t === 'create') games.set(code, new Game(code));
          const g = games.get(code), idx = g.join(m.name);
          if (m.t === 'create') { const all = Object.keys(MI.RACES); g.pick(idx, all[Math.floor(Math.random() * all.length)]); }
          if (m.t === 'create') { const free = Object.keys(MI.RACES).filter((r) => !g.players.some((p) => p.race === r)); g.addBot(0, free[Math.floor(Math.random() * free.length)]); }
          this.game = g; this.idx = idx;
          this.emit({ t: 'joined', code, token: g.players[idx].token });
          return this.broadcast();
        }
        if (m.t === 'resume') {
          const g = games.get(String(m.code || '').toUpperCase());
          if (g && m.token === g.specToken) { this.game = g; this.idx = -1; this.emit({ t: 'joined', code: g.code, token: m.token }); return this.broadcast(); }
          const idx = g ? g.players.findIndex((p) => p.token === m.token) : -1;
          if (idx < 0) throw new Error('Could not rejoin that game (games in local mode end when you reload the page)');
          this.game = g; this.idx = idx; this.emit({ t: 'joined', code: g.code, token: m.token });
          return this.broadcast();
        }
        const g = this.game, idx = g ? g.actor(this.idx) : this.idx;
        if (!g) throw new Error('Join a game first');
        switch (m.t) {
          case 'pick': g.pick(idx, m.race, m.color); break;
          case 'start': if (g.start(idx)) { this.idx = -1; this.emit({ t: 'joined', code: g.code, token: g.specToken }); } break;
          case 'watch': g.watch(idx, !!m.on); break;
          case 'addBot': g.addBot(idx, m.race); break;
          case 'addLocal': g.addLocal(idx, m.race, m.name); break;
          case 'rename': g.rename(idx, m.idx | 0, m.name); break;
          case 'finishNow': if (idx > 0) throw new Error('Only the host can end the game'); g.finish('Ended early by the host.'); break;
          case 'speed': if (idx > 0) throw new Error('Only the host can change the speed'); g.botDelay = Math.max(40, Math.min(2000, m.ms | 0)); break;
          case 'leave': if (g.status === 'lobby' && idx > 0) g.players.splice(idx, 1); this.game = null; return;
          case 'removeBot': g.removeBot(idx, m.idx | 0); break;
          case 'place': g.place(idx, m.uid, m.x, m.y, m.rot); break;
          case 'store': g.store(idx, m.uid); break;
          case 'retrieve': g.retrieve(idx, m.uid); break;
          case 'discard': g.discard(idx, m.uid); break;
          case 'doneBuild': g.doneBuild(idx); break;
          case 'order': g.order(idx, m.type); break;
          case 'cancelOrder': g.cancelOrder(idx, m.uid); break;
          case 'endTurn': g.endTurn(idx); break;
          default: throw new Error('Unknown action');
        }
        this.broadcast();
      } catch (e) {
        this.emit({ t: 'error', msg: e.message });
      }
    }
  }
  window.LocalSocket = LocalSocket;
})();
