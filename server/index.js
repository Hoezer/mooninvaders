const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  if (url === '/vendor/three.module.js') url = '/node_modules/three/build/three.module.js';
  const base = url.startsWith('/shared/') || url.startsWith('/node_modules/three/build/') ? ROOT : path.join(ROOT, 'public');
  const file = path.normalize(path.join(base, url));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const games = new Map();
const sockets = new Map(); // ws -> { game, idx }

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); while (games.has(c));
  return c;
}

function broadcast(game) {
  scheduleBot(game);
  for (const [ws, s] of sockets) if (s.game === game && ws.readyState === 1) {
    ws.send(JSON.stringify({ t: 'state', state: game.view(s.idx) }));
  }
}

function scheduleBot(game) {
  if (game.botTimer || game.status !== 'playing' || !game.players[game.turn].bot) return;
  game.botTimer = setTimeout(() => {
    game.botTimer = null;
    try { game.botStep(); } catch (e) { console.error('Bot error:', e.message); try { game.endTurn(game.turn); } catch (_) { game.phase = 'order'; } }
    broadcast(game);
  }, Math.max(game.botDelay || 600, (game.introUntil || 0) - Date.now()));
}

const wss =new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const s = sockets.get(ws);
    try {
      if (m.t === 'create' && m.spectate) {
        // 4 computer players, the creator watches
        const code = newCode(), game = new Game(code);
        games.set(code, game);
        game.specToken = require('crypto').randomBytes(12).toString('hex');
        for (let k = 0; k < 4; k++) { const BOT = ['HAL-9', 'Lunatron', 'Crater Bot', 'Moonbeam AI']; const i = game.join(BOT[k]); game.players[i].bot = true; }
        game.start(0);
        sockets.set(ws, { game, idx: -1 });
        ws.send(JSON.stringify({ t: 'joined', code, token: game.specToken }));
        return broadcast(game);
      }
      if (m.t === 'create' || m.t === 'join') {
        const code = m.t === 'create' ? newCode() : String(m.code || '').toUpperCase();
        if (m.t === 'create') games.set(code, new Game(code));
        const game = games.get(code);
        if (!game) throw new Error('Room not found');
        if (m.t === 'join' && game.players[0] && game.players[0].watch) throw new Error('This room is set up as an AI game to watch');
        const idx = game.join(m.name);
        sockets.set(ws, { game, idx });
        ws.send(JSON.stringify({ t: 'joined', code, token: game.players[idx].token }));
        return broadcast(game);
      }
      if (m.t === 'resume') {
        const game = games.get(String(m.code || '').toUpperCase());
        if (game && game.specToken && m.token === game.specToken) {
          sockets.set(ws, { game, idx: -1 });
          ws.send(JSON.stringify({ t: 'joined', code: game.code, token: m.token }));
          return broadcast(game);
        }
        const idx = game ? game.players.findIndex((p) => p.token === m.token) : -1;
        if (idx < 0) throw new Error('Could not rejoin that game');
        sockets.set(ws, { game, idx });
        game.players[idx].connected = true;
        ws.send(JSON.stringify({ t: 'joined', code: game.code, token: m.token }));
        return broadcast(game);
      }
      if (!s) throw new Error('Join a game first');
      const { game, idx } = s;
      switch (m.t) {
        case 'pick': game.pick(idx, m.race, m.color); break;
        case 'start': if (game.start(idx)) { sockets.set(ws, { game, idx: -1 }); ws.send(JSON.stringify({ t: 'joined', code: game.code, token: game.specToken })); } break;
        case 'watch': game.watch(idx, !!m.on); break;
        case 'addBot': game.addBot(idx, m.race); break;
        case 'finishNow':
          if (idx > 0) throw new Error('Only the host can end the game');
          if (game.status !== 'playing') throw new Error('Game is not running');
          game.finish('Ended early by the host.'); break;
        case 'speed':
          if (idx > 0) throw new Error('Only the host can change the speed');
          game.botDelay = Math.max(40, Math.min(2000, m.ms | 0)); break;
        case 'removeBot': game.removeBot(idx, m.idx | 0); break;
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
      broadcast(game);
    } catch (e) {
      ws.send(JSON.stringify({ t: 'error', msg: e.message }));
    }
  });
  ws.on('close', () => {
    const s = sockets.get(ws);
    sockets.delete(ws);
    if (!s) return;
    const still = [...sockets.values()].some((o) => o.game === s.game && o.idx === s.idx);
    if (!still && s.idx >= 0) s.game.players[s.idx].connected = false;
    if (![...sockets.values()].some((o) => o.game === s.game)) {
      setTimeout(() => { if (![...sockets.values()].some((o) => o.game === s.game)) games.delete(s.game.code); }, 30 * 60 * 1000);
    }
    broadcast(s.game);
  });
});

server.listen(PORT, () => console.log(`Moon Invaders running on http://localhost:${PORT}`));
