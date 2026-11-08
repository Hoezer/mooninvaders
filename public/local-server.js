// Local mode: when no game server is available (e.g. a static Netlify site), the browser runs the
// game itself with the same Game and Rooms classes as the server (bundled into game-local.js).
// Supports playing against computers and watching 4 computers; real online multiplayer still needs the Node server.
(function () {
  let gameReady = null;
  function loadGame() {
    if (window.MIGame) return Promise.resolve();
    if (!gameReady) gameReady = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = 'game-local.js'; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
    });
    return gameReady;
  }

  const sockets = new Set(); // open LocalSockets; each is a Rooms connection { game, idx }
  let rooms = null;
  function getRooms() {
    if (!rooms) rooms = new window.MIRooms({
      conns: () => sockets,
      send: (c, msg) => c.emit(msg),
      stopWhenAlone: true,
      texts: {
        noRoom: 'Joining other players needs the online game server. Play against computers instead.',
        noResume: 'Could not rejoin that game (games in local mode end when you reload the page)',
      },
    });
    return rooms;
  }

  class LocalSocket {
    constructor() {
      this.readyState = 0; this.game = null; this.idx = -1;
      loadGame().then(() => { this.readyState = 1; sockets.add(this); if (this.onopen) this.onopen(); })
        .catch(() => { if (this.onclose) this.onclose(); });
    }
    emit(o) { setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(o) }), 0); }
    close() {
      this.readyState = 3; sockets.delete(this);
      if (this.game) { clearTimeout(this.game.botTimer); this.game.botTimer = null; }
      this.game = null;
    }
    send(raw) { getRooms().handle(this, JSON.parse(raw)); }
  }
  window.LocalSocket = LocalSocket;
})();
