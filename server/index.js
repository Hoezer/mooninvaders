const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Rooms } = require('./game');

// ---- Static file server ----
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

// ---- Rooms and connections (the message protocol itself lives in Rooms, server/game.js) ----
const sockets = new Map(); // ws -> connection { ws, game, idx }
const rooms = new Rooms({
  conns: () => sockets.values(),
  send: (c, msg) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); },
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  const conn = { ws, game: null, idx: -1 };
  sockets.set(ws, conn);
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    rooms.handle(conn, m);
  });
  ws.on('close', () => {
    sockets.delete(ws);
    const game = conn.game;
    if (!game) return;
    const others = rooms.connsOf(game);
    if (!others.some((o) => o.idx === conn.idx) && conn.idx >= 0 && game.players[conn.idx]) game.players[conn.idx].connected = false;
    if (!others.length) {
      setTimeout(() => { if (!rooms.connsOf(game).length) rooms.games.delete(game.code); }, 30 * 60 * 1000);
    }
    rooms.broadcast(game);
  });
});

server.listen(PORT, () => console.log(`Moon Invaders running on http://localhost:${PORT}`));
