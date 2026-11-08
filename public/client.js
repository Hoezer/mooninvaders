(function () {
  const MI = window.MI;
  const $ = (id) => document.getElementById(id);
  let ws, st = null, sel = null, rot = 0, hover = null, geo = null;

  Render.stars($('stars'));

  function store(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function connect(onOpen) {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = onOpen;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'joined') { store('mi_session', JSON.stringify({ code: m.code, token: m.token })); history.replaceState(null, '', '#' + m.code); }
      if (m.t === 'state') { st = m.state; render(); }
      if (m.t === 'error') {
        toast(m.msg);
        if (/rejoin/.test(m.msg)) store('mi_session', null);
      }
    };
    ws.onclose = () => { toast('Connection lost. Reconnecting…'); setTimeout(() => resume(), 1500); };
  }
  const send = (o) => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));

  function resume() {
    const s = JSON.parse(load('mi_session') || 'null');
    if (s) connect(() => send({ t: 'resume', code: s.code, token: s.token }));
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ---------- Lobby ----------
  $('name').value = load('mi_name') || '';
  if (location.hash.length === 5) $('codeIn').value = location.hash.slice(1);
  const name = () => { const n = $('name').value.trim() || 'Commander'; store('mi_name', n); return n; };
  $('createBtn').onclick = () => connect(() => send({ t: 'create', name: name() }));
  $('joinBtn').onclick = () => connect(() => send({ t: 'join', code: $('codeIn').value.trim(), name: name() }));
  $('startBtn').onclick = () => send({ t: 'start' });
  $('botBtn').onclick = () => send({ t: 'addBot' });
  const watchAi = () => { store('mi_session', null); if (ws) { ws.onclose = null; ws.close(); } connect(() => send({ t: 'create', spectate: true })); };
  $('watchBtn').onclick = watchAi;
  // after going back to the lobby you can jump straight back into your game
  try { const last = JSON.parse(load('mi_last') || 'null'); if (last && !load('mi_session')) { const b = document.createElement('button'); b.id = 'resumeBtn'; b.className = 'primary'; b.textContent = '↩ Back to game ' + last.code; $('joinBox').prepend(b); } } catch (e) { /* ignore */ }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'newAiBtn' || t.id === 'endNewAi') watchAi();
    if (t.dataset.speed) send({ t: 'speed', ms: +t.dataset.speed });
    if (t.dataset.finish) send({ t: 'finishNow' });
    if (t.id === 'endLobby') { store('mi_session', null); location.href = location.pathname; }
    if (t.id === 'backBtn') { const s = load('mi_session'); if (s) store('mi_last', s); store('mi_session', null); location.href = location.pathname; }
    if (t.id === 'resumeBtn') { store('mi_session', load('mi_last')); store('mi_last', null); location.reload(); }
    if (t.id === 'endClose') { endClosed = true; $('endScreen').classList.add('hidden'); }
  });
  let endClosed = false;
  function renderEnd() {
    const el = $('endScreen');
    if (st.status !== 'ended') { endClosed = false; el.classList.add('hidden'); return; }
    if (endClosed) return;
    el.classList.remove('hidden');
    const rows = st.players.map((p, i) => {
      const d = st.scores.details[i];
      return { p, i, total: d.total, fac: d.items.length, scoring: d.items.filter((x) => x.points).length,
        built: st.placed.filter((q) => q.owner === i).length,
        rooms: st.placed.filter((q) => q.owner === i && MI.PIECES[q.type].kind === 'room').length,
        best: d.items.slice().sort((a, b) => b.points - a.points)[0] };
    }).sort((a, b) => b.total - a.total || b.built - a.built);
    const winners = rows.filter((r) => r.total === rows[0].total);
    const title = winners.length > 1 ? `${winners.map((r) => esc(r.p.name)).join(' & ')} share the moon!` : `${esc(winners[0].p.name)} rules the moon!`;
    const medal = ['🥇', '🥈', '🥉', '4'];
    const podOrder = [rows[1], rows[0], rows[2], rows[3]].filter(Boolean);
    const height = (r) => 60 + 90 * (rows.length - rows.indexOf(r)) / rows.length;
    el.innerHTML = `<div class="endCard">
      <h2>🌕 ${title}</h2><div class="why">${esc(st.endReason || 'Game over')} · ${st.round} rounds played</div>
      <div class="podium">${podOrder.map((r) => `<div class="pod"><div class="nm">${esc(r.p.name)}</div><small>${MI.RACES[r.p.race].name}</small><div class="sc">${r.total}</div>
        <div class="blk" style="height:${height(r)}px;background:${MI.COLORS[r.p.color].hex}">${medal[rows.indexOf(r)]}</div></div>`).join('')}</div>
      <table class="endTable"><tr><th>#</th><th>Race</th><th class="num">Built</th><th class="num">Rooms</th><th class="num">Facilities scoring</th><th class="num">Best</th><th class="num">Score</th></tr>
      ${rows.map((r, k) => `<tr><td>${k + 1}</td><td><span class="dot" style="background:${MI.COLORS[r.p.color].hex}"></span> ${esc(r.p.name)}</td><td class="num">${r.built}</td><td class="num">${r.rooms}</td><td class="num">${r.scoring}/${r.fac}</td>
        <td class="num">${r.best && r.best.points ? `${esc(MI.PIECES[r.best.type].name)} ${r.best.points}` : '–'}</td><td class="num"><b>${r.total}</b></td></tr>`).join('')}</table>
      <div class="endBtns"><button id="endClose">Look at the moon</button><button id="endNewAi">👀 New AI game</button><button id="endLobby" class="primary">Back to lobby</button></div></div>`;
  }
  $('lobbyPlayers').onclick = (e) => { const b = e.target.closest('[data-kick]'); if (b) send({ t: 'removeBot', idx: +b.dataset.kick }); };

  function renderLobby() {
    $('joinBox').classList.add('hidden'); $('roomBox').classList.remove('hidden');
    $('roomCode').textContent = st.code;
    const me = st.players[st.you];
    $('raceList').innerHTML = '';
    for (const [k, r] of Object.entries(MI.RACES)) {
      const takenBy = st.players.find((p, i) => p.race === k && i !== st.you);
      const d = document.createElement('div');
      d.className = 'race' + (me.race === k ? ' sel' : '') + (takenBy ? ' taken' : '');
      d.style.setProperty('--rc', Portraits.ACC[k]);
      d.innerHTML = `<canvas width="360" height="360"></canvas><div class="rcBody"><span class="rcTag">${me.race === k ? '✔ YOUR RACE' : takenBy ? 'TAKEN · ' + esc(takenBy.name) : 'SELECT'}</span>
        <b>${r.name.split(' ').pop()}</b><i>${r.name.split(' ')[0]}</i><p>${r.blurb}</p><span class="rcAb">${r.ability}</span></div>`;
      Portraits.draw(d.querySelector('canvas'), k);
      if (!takenBy) d.onclick = () => send({ t: 'pick', race: k });
      $('raceList').appendChild(d);
    }
    // big profile of the selected race
    const R = MI.RACES[me.race];
    const own = Object.values(MI.PIECES).filter((p) => p.race === me.race);
    $('raceProfile').style.setProperty('--rc', Portraits.ACC[me.race]);
    $('raceProfile').innerHTML = `<div class="prof"><canvas width="520" height="520"></canvas>
      <div class="profTxt"><small>LEADER</small><h2>${esc(R.leader)}</h2><div class="profTitle">${esc(R.title)} · ${R.name}</div>
      <blockquote>“${esc(R.quote)}”</blockquote>
      <div class="chips">${R.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <p>${esc(R.lore)}</p>
      <div class="profGrid"><div><small>HOMEWORLD</small>${esc(R.homeworld)}</div><div><small>ABILITY</small>${esc(R.ability)}</div>
      <div><small>STRENGTHS</small>${R.strengths.map(esc).join('<br>')}</div><div><small>WEAKNESS</small>${esc(R.weakness)}</div></div>
      <div class="profPlay"><small>HOW TO PLAY</small>${esc(R.playstyle)}</div>
      <div class="profRooms"><small>RACE ROOMS</small>${own.map((p) => `<span>${esc(p.name)}${p.points ? ' ★' + p.points : ''}</span>`).join('')}</div></div></div>`;
    Portraits.draw($('raceProfile').querySelector('canvas'), me.race);
    $('colorList').innerHTML = '';
    for (const [k, c] of Object.entries(MI.COLORS)) {
      const taken = st.players.some((p, i) => p.color === k && i !== st.you);
      const d = document.createElement('div');
      d.className = 'swatch' + (me.color === k ? ' sel' : '') + (taken ? ' taken' : '');
      d.style.background = c.hex; d.title = c.name;
      if (!taken) d.onclick = () => send({ t: 'pick', color: k });
      $('colorList').appendChild(d);
    }
    $('lobbyPlayers').innerHTML = st.players.map((p, i) =>
      `<li><span class="dot" style="background:${MI.COLORS[p.color].hex}"></span>${esc(p.name)}${i === 0 ? ' — host' : ''}${p.bot ? ' 🤖' : ''}<span class="muted">&nbsp;${MI.RACES[p.race].name}</span>${p.bot && st.you === 0 ? ` <button data-kick="${i}" style="margin-left:auto;padding:2px 8px">✕</button>` : ''}</li>`).join('');
    $('botBtn').classList.toggle('hidden', st.you !== 0 || st.players.length >= 4);
    $('startBtn').classList.toggle('hidden', st.you !== 0);
    $('startBtn').disabled = st.players.length < 2;
    $('startBtn').textContent = st.players.length < 2 ? 'Add a computer or wait for a friend' : 'Launch the colonization';
    $('waitHost').classList.toggle('hidden', st.you === 0);
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Game ----------
  function render() {
    if (st.status === 'lobby') { $('lobby').classList.remove('hidden'); $('game').classList.add('hidden'); return renderLobby(); }
    $('lobby').classList.add('hidden'); $('game').classList.remove('hidden');
    const spect = st.you < 0, meIdx = spect ? st.turn : st.you;
    const me = st.players[meIdx]; window.MI_RACE = me.race; const myTurn = !spect && st.turn === st.you && st.status === 'playing';
    if (sel && !me.pad.some((p) => p.uid === sel)) sel = null;
    if (!sel && myTurn && st.phase === 'build' && me.pad.length) sel = me.pad[0].uid;
    $('gameCode').textContent = st.code;
    const cur = st.players[st.turn];
    $('turnInfo').innerHTML = st.status === 'ended' ? '<b>Game over</b>'
      : `Round ${st.round} · ${myTurn ? '<b class="you">Your turn</b>' : `<b>${esc(cur.name)}</b>'s turn`} · ${st.phase === 'build' ? 'Build phase' : 'Order phase'}`;

    // me panel
    const pw = st.scores.power[meIdx], myColor = MI.COLORS[me.color].hex;
    const pct = pw.supply ? Math.min(100, (pw.demand / pw.supply) * 100) : 100;
    const isHost = st.you <= 0;
    const speeds = [['▶ 1×', 600], ['▶▶ 4×', 150], ['⏩ 15×', 40]];
    const ctrl = isHost && st.status === 'playing' ? `<div class="ctrl">${st.players.some((p) => p.bot) ? speeds.map(([l, ms]) => `<button data-speed="${ms}" class="${st.botDelay === ms ? 'on' : ''}">${l}</button>`).join('') : ''}<button data-finish="1">🏁 End game now</button></div>` : '';
    $('mePanel').innerHTML = (spect ? `<div class="spectBar">👀 Watching 4 computers · following <b>${esc(me.name)}</b><button id="newAiBtn">New AI game</button>${ctrl}</div>` : (ctrl ? `<div class="spectBar">${ctrl}</div>` : '')) + `<h3><span class="dot" style="background:${myColor}"></span> ${esc(me.name)} — ${MI.RACES[me.race].name}</h3>
      <div class="muted" style="font-size:12px">${MI.RACES[me.race].ability}</div>`;
    const resCount = st.placed.filter((p) => p.owner === meIdx && MI.PIECES[p.type].kind === 'resource').length;
    $('hud').innerHTML = `
      <div class="chip"><span class="ic">◉</span><div><small>Capsules</small><b>${me.capsules}</b></div></div>
      <div class="chip ${pw.demand > pw.supply ? 'warn' : ''}"><span class="ic">⚡</span><div class="pw2"><small>Power</small>
        <div class="pwRow"><span>Used</span><div class="bar used ${pw.demand > pw.supply ? 'over' : ''}"><i style="width:${Math.min(100, pw.supply ? pw.demand / pw.supply * 100 : (pw.demand ? 100 : 0))}%"></i></div><b>${pw.demand}</b></div>
        <div class="pwRow"><span>Left</span><div class="bar left"><i style="width:${pw.supply ? Math.max(0, pw.supply - pw.demand) / pw.supply * 100 : 0}%"></i></div><b>${Math.max(0, pw.supply - pw.demand)}</b></div>
      </div></div>
      <div class="chip ${resCount ? '' : 'warn'}"><span class="ic">⚗</span><div><small>Resources</small><b>${resCount}</b></div></div>
      <div class="chip"><span class="ic">▦</span><div><small>Storage</small><b>${me.storage.length} / ${me.storageCap}</b></div></div>
      <div class="chip"><span class="ic">★</span><div><small>Score</small><b>${st.scores.details[meIdx].total}</b></div></div>`;

    // actions
    let a = '';
    if (st.status === 'ended') {
      const best = Math.max(...st.scores.details.map((d) => d.total));
      const winners = st.players.filter((_, i) => st.scores.details[i].total === best).map((p) => esc(p.name)).join(' & ');
      a = `<div class="winner">🌕 ${winners} rule${winners.includes('&') ? '' : 's'} the moon!</div>`;
    } else if (!myTurn) a = `<h3>Waiting</h3><div class="muted">${esc(cur.name)} is playing…</div>`;
    else if (st.phase === 'build') {
      a = `<h3>1 · Build</h3><div class="muted" style="font-size:12px;margin-bottom:8px">Select a piece, hover the moon and click to build. Rotate: <b>arrows / WASD / R</b> or right-click. Scroll = zoom, drag = move, double-click = reset.</div>
        <div class="btns"><button id="rotBtn">Rotate ↻</button><button id="doneBtn" class="primary" ${me.pad.length ? 'disabled' : ''}>Draw capsules →</button></div>`;
    } else {
      a = `<h3>3 · Order</h3><div class="muted" style="font-size:12px;margin-bottom:8px">${st.lastRoll ? `You drew <b>${st.lastRoll.gain}</b> capsules. ` : ''}Orders land at the start of your next turn.</div>
        <div class="btns"><button id="endBtn" class="primary">End turn</button></div>`;
    }
    $('actionPanel').innerHTML = a;
    if ($('rotBtn')) $('rotBtn').onclick = () => { rot = (rot + 1) % 4; draw(); };
    if ($('doneBtn')) $('doneBtn').onclick = () => send({ t: 'doneBuild' });
    if ($('endBtn')) $('endBtn').onclick = () => send({ t: 'endTurn' });

    // landing pad + storage
    const pad = $('tray'); pad.innerHTML = '';
    const section = (title, items, kind) => {
      const box = document.createElement('div'); box.className = 'trayBox ' + kind; pad.appendChild(box);
      const h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
      if (!items.length) { const e = document.createElement('div'); e.className = 'muted empty'; e.textContent = 'Empty'; box.appendChild(e); return; }
      const wrap = document.createElement('div'); wrap.className = 'tiles';
      for (const it of items) {
        const t = document.createElement('div');
        t.className = 'tile' + (sel === it.uid ? ' sel' : '');
        const c = document.createElement('canvas'); const dpr = devicePixelRatio || 1;
        c.width = 92 * dpr; c.height = 80 * dpr; c.style.width = '92px'; c.style.height = '80px';
        Render.drawMini(c, it.type, myColor, sel === it.uid ? rot : 0);
        t.appendChild(c);
        t.appendChild(document.createTextNode(MI.PIECES[it.type].name));
        tipFor(t, it.type);
        if (kind === 'pad' && myTurn && st.phase === 'build') {
          t.onclick = () => { sel = it.uid; render(); };
          const acts = document.createElement('div'); acts.className = 'acts';
          if (me.storage.length < me.storageCap) acts.appendChild(btn('Store', () => send({ t: 'store', uid: it.uid })));
          acts.appendChild(btn('Scrap', () => send({ t: 'discard', uid: it.uid })));
          t.appendChild(acts);
        }
        if (kind === 'store' && myTurn && st.phase === 'build') {
          const acts = document.createElement('div'); acts.className = 'acts';
          acts.appendChild(btn('To pad', () => send({ t: 'retrieve', uid: it.uid })));
          t.appendChild(acts);
        }
        wrap.appendChild(t);
      }
      box.appendChild(wrap);
    };
    section('Landing pad', me.pad, 'pad');
    section('Storage ' + me.storage.length + '/' + (me.storageCap || 0), me.storage, 'store');
    const coming = [...(me.incoming || []), ...me.orders.map((o) => o.type)].map((type, i) => ({ uid: -1 - i, type }));
    section('Requests', coming, 'incoming');
    pad.lastChild.querySelectorAll('.tile').forEach((t) => t.classList.add('incoming'));

    // shop
    const shop = $('shopPanel');
    if (myTurn && st.phase === 'order') {
      shop.classList.remove('hidden');
      let h = `<div class="mktHead"><span>Market</span><span class="wallet">◉ ${me.capsules} capsules</span></div>`;
      const spent = me.orders.reduce((a, o) => a + MI.PIECES[o.type].cost, 0);
      h += `<div class="cart"><div class="cartHead"><b>🛒 Your order</b><span>${me.orders.length} piece${me.orders.length === 1 ? '' : 's'} · ${spent} ◉ spent</span></div>`;
      h += me.orders.length
        ? '<div class="cartItems">' + me.orders.map((o) => `<div class="cartItem" title="Cancel this order">
            <canvas data-mini="${o.type}" width="${48 * devicePixelRatio}" height="${48 * devicePixelRatio}" style="width:48px;height:48px"></canvas>
            <span>${esc(MI.PIECES[o.type].name)}</span><button data-cancel="${o.uid}">✕</button></div>`).join('') + '</div><small>Lands on your landing pad at the start of your next turn.</small>'
        : '<small>Nothing ordered yet. Pick pieces below.</small>';
      h += '</div>';
      h += '<div class="shop">';
      const GROUPS = [['Power', ['generator']], ['Race resources', ['resource']], ['Hallways & rooms', ['hallway', 'room', 'storage', 'deadend']], ['Facilities', ['facility']]];
      const ordered = [];
      for (const [title, kinds] of GROUPS) {
        ordered.push([title]);
        for (const [k, d] of Object.entries(MI.PIECES)) if (kinds.includes(d.kind) && k in me.supply) ordered.push([k, d]);
      }
      for (const [k, d] of ordered) {
        if (!d) { h += `<div class="mktGroup">${k}</div>`; continue; }
        const left = me.supply[k];
        const can = left > 0 && me.capsules >= d.cost;
        const tags = [
          `<span class="tag ${d.power > 0 ? 'pw-plus' : 'pw-min'}">⚡ ${d.power > 0 ? '+' : ''}${d.power}</span>`,
          d.points ? `<span class="tag pts">★ ${d.points}</span>` : '',
          d.cells.length > 1 ? '<span class="tag">2 cells</span>' : '',
        ].join('');
        const why = left <= 0 ? 'Sold out' : me.capsules < d.cost ? `Need ${d.cost - me.capsules} more` : `${left} left`;
        h += `<div class="shopItem ${can ? '' : 'off'}" data-tip="${k}"><canvas data-mini="${k}" width="${56 * devicePixelRatio}" height="${56 * devicePixelRatio}" style="width:56px;height:56px"></canvas>
          <div class="nm"><b>${esc(d.name)}</b><div class="tags">${tags}</div><small>${why}</small></div>
          <button class="buy" data-order="${k}" ${can ? '' : 'disabled'}><span>${d.cost}</span>◉</button></div>`;
      }
      shop.innerHTML = h + '</div>';
      shop.querySelectorAll('canvas[data-mini]').forEach((c) => Render.drawMini(c, c.dataset.mini, myColor));
      shop.querySelectorAll('[data-order]').forEach((b) => b.onclick = () => send({ t: 'order', type: b.dataset.order }));
      shop.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => send({ t: 'cancelOrder', uid: +b.dataset.cancel }));
      shop.querySelectorAll('[data-tip]').forEach((el) => tipFor(el, el.dataset.tip));
    } else shop.classList.add('hidden');

    // scores
    const top = Math.max(1, ...st.scores.details.map((d) => d.total));
    const order = st.players.map((p, i) => i).sort((a, b) => st.scores.details[b].total - st.scores.details[a].total);
    $('scorePanel').innerHTML = '<h3>Races</h3>' + order.map((i, rank) => {
      const p = st.players[i], d = st.scores.details[i], c = MI.COLORS[p.color].hex;
      const live = i === st.turn && st.status === 'playing';
      return `<div class="prow ${live ? 'active' : ''}" data-owner="${i}" style="--pc:${c}"><img class="rimg" src="${portraitURL(p.race)}" alt=""><span class="pn">${esc(p.name)}${i !== st.you && (p.requestShapes || []).length ? '<span class="reqs" title="Requested pieces (face down)">' + p.requestShapes.map((sh) => '<img src="' + faceDownURL(sh) + '" alt="">').join('') + '</span>' : ''}</span><span class="sc">${d.total}</span></div>`;
      // eslint-disable-next-line no-unreachable
      return `<div class="prow ${live ? 'active' : ''}" style="--pc:${c}">
        <span class="rank">${rank + 1}</span>
        <span class="av">${esc(p.name).slice(0, 1)}</span>
        <span class="pn">${esc(p.name)}${live ? ' <em>playing</em>' : ''}${p.connected ? '' : ' <em class="off">offline</em>'}
          <small>${MI.RACES[p.race].name} · ${p.capsules}◉ · ${d.items.filter((x) => x.points).length}/${d.items.length} scoring</small>
          <span class="sbar"><i style="width:${d.total / top * 100}%"></i></span></span>
        <span class="sc">${d.total}</span></div>`;
    }).join('');
    const nameColor = {}; st.players.forEach((p) => { nameColor[p.name] = MI.COLORS[p.color].hex; });
    $('log').innerHTML = st.log.slice().reverse().map((l) => {
      const who = Object.keys(nameColor).find((n) => l.startsWith(n));
      return `<div class="le" style="--pc:${who ? nameColor[who] : 'rgba(255,255,255,.25)'}">${esc(l)}</div>`;
    }).join('');
    renderEnd();
    draw();
  }

  function btn(label, fn) { const b = document.createElement('button'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(); }; return b; }

  const shapeCache = {};
  function faceDownURL(cells) {
    const key = JSON.stringify(cells);
    if (shapeCache[key]) return shapeCache[key];
    const S = 22, P = 7, cols = Math.max(...cells.map((k) => k.dx)) + 1, rows = Math.max(...cells.map((k) => k.dy)) + 1;
    const cv = document.createElement('canvas'); cv.width = (cols * S + P * 2) * 2; cv.height = (rows * S + P * 2) * 2;
    const x = cv.getContext('2d'); x.scale(2, 2);
    const r = S * 0.2, D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    // card back
    x.fillStyle = '#5b6b80';
    for (const k of cells) x.fillRect(P + k.dx * S, P + k.dy * S, S, S);
    // tabs stick out
    for (const k of cells) for (let d = 0; d < 4; d++) if (k.e[d] === 'o') {
      const cx = P + k.dx * S + S / 2 + D[d][0] * S / 2, cy = P + k.dy * S + S / 2 + D[d][1] * S / 2;
      x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    // notches are cut out
    x.globalCompositeOperation = 'destination-out';
    for (const k of cells) for (let d = 0; d < 4; d++) if (k.e[d] === 'i') {
      const cx = P + k.dx * S + S / 2 + D[d][0] * S / 2, cy = P + k.dy * S + S / 2 + D[d][1] * S / 2;
      x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
    x.globalCompositeOperation = 'source-atop';
    // back pattern: diagonal lines + a question mark, like the back of a puzzle piece
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1;
    for (let i = -rows * S; i < cols * S + P * 2; i += 5) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + rows * S + P * 2, rows * S + P * 2); x.stroke(); }
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '700 12px Orbitron, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('?', P + cols * S / 2, P + rows * S / 2 + 1);
    return (shapeCache[key] = cv.toDataURL());
  }
  const portraitCache = {};
  function portraitURL(race) {
    if (!portraitCache[race]) { const cv = document.createElement('canvas'); cv.width = cv.height = 96; try { Portraits.draw(cv, race); } catch (e) { /* ignore */ } portraitCache[race] = cv.toDataURL(); }
    return portraitCache[race];
  }
  // hovering a race highlights that player's buildings on the moon
  function scoreExplain(item, d) {
    const why = { 'no power': 'it has no power (build more power plants)', 'no race resource': 'it needs one of your powered race resources' }[item.reason] || item.reason;
    if (item.reason) return `<div class="sx bad"><b>★ 0</b> — scores nothing because ${esc(why)}.</div>`;
    return `<div class="sx"><b>★ ${item.points}</b> = ${d.points} base × (1 + ${item.rooms} guest room${item.rooms === 1 ? '' : 's'})<br><span class="muted">Guest rooms count when they are powered and within 4 hallways${item.rooms ? ' — shown with green lines on the moon' : ''}.</span></div>`;
  }
  let rowTip = null;
  document.addEventListener('mouseover', (e) => {
    const r = e.target.closest && e.target.closest('#scorePanel .prow');
    if (window.Render3D && Render3D.highlight) { Render3D.highlight(r ? +r.dataset.owner : null); draw(); }
    const tip = $('tip');
    if (r && st) {
      const i = +r.dataset.owner; if (rowTip === i) return; rowTip = i;
      const det = st.scores.details[i], pl = st.players[i];
      const rows = det.items.slice().sort((a, b) => b.points - a.points).map((it) => { const dd = MI.PIECES[it.type]; return `<tr><td>${esc(dd.name)}</td><td class="muted">${it.reason ? esc(it.reason) : dd.points + ' × (1 + ' + it.rooms + ')'}</td><td><b>${it.points}</b></td></tr>`; }).join('');
      tip.innerHTML = `<b style="color:${MI.COLORS[pl.color].hex}">${esc(pl.name)}</b> — score ${det.total}<br><span class="muted">Only facilities score: base points × (1 + powered guest rooms within 4 hallways).</span>` + (rows ? `<table class="sxt">${rows}</table>` : '<div class="muted">No facilities built yet.</div>');
      tip.style.right = 'auto'; tip.style.top = 'auto'; tip.style.left = '16px'; tip.style.bottom = '16px'; tip.style.display = 'block'; tipPiece = null;
    } else if (rowTip !== null) { rowTip = null; tip.style.display = 'none'; }
  });
  // use the 3D picture of a piece wherever a small piece image is shown (tray, market, tooltips)
  function pieceRace(type) { const d = MI.PIECES[type]; return d.neutral ? 'shared' : (d.race || window.MI_RACE || 'shared'); }
  function draw3DInto(cv, type, r = 0) {
    if (!window.Render3D || !Render3D.snapshotType) return false;
    const dpr = devicePixelRatio || 1, w = Math.round(cv.width / dpr), h = Math.round(cv.height / dpr);
    const snap = Render3D.snapshotType(type, pieceRace(type), r, w, h);
    if (!snap) return false;
    const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(snap, 0, 0, cv.width, cv.height);
    return true;
  }
  const drawMini2D = Render.drawMini;
  Render.drawMini = (cv, type, color, r) => { if (!draw3DInto(cv, type, r || 0)) drawMini2D(cv, type, color, r); };
  function tipFor(el, type) {
    el.onmouseenter = (e) => {
      const d = MI.PIECES[type], tip = $('tip'); tip.style.right = 'auto'; tip.style.bottom = 'auto';
      const kind = { hallway: 'Hallway', room: 'Guest rooms', generator: 'Power plant', resource: 'Race resource', facility: 'Facility', storage: 'Storage', deadend: 'Filler' }[d.kind];
      tip.innerHTML = `<b>${esc(d.name)}</b><br><span class="muted">${kind}${d.race ? ' · ' + MI.RACES[d.race].name : ''} · cost ${d.cost} · power ${d.power > 0 ? '+' : ''}${d.power}${d.points ? ' · ★' + d.points : ''}</span>${MI.FLAVOR[type] ? '<br>' + esc(MI.FLAVOR[type]) : ''}`;
      const big = document.createElement('canvas'), wide = d.cells.length > 1, dpr = devicePixelRatio || 1;
      big.width = (wide ? 240 : 160) * dpr; big.height = 160 * dpr;
      big.style.cssText = `width:${wide ? 240 : 160}px;height:160px;display:block;margin:0 auto 6px;border-radius:10px`;
      if (!draw3DInto(big, type)) { const bctx = big.getContext('2d'); bctx.imageSmoothingQuality = 'high'; bctx.drawImage(Art.get(type, wide ? 240 : 160, 160), 0, 0, big.width, big.height); }
      tip.prepend(big);
      tip.style.display = 'block';
    };
    el.onmousemove = (e) => { const tip = $('tip'); tip.style.left = Math.min(e.clientX + 14, innerWidth - 270) + 'px'; tip.style.top = (e.clientY + 14 + tip.offsetHeight > innerHeight ? Math.max(4, e.clientY - tip.offsetHeight - 14) : e.clientY + 14) + 'px'; };
    el.onmouseleave = () => { $('tip').style.display = 'none'; };
  }

  // ---------- Board interaction ----------
  const board = $('board');
  function ghostInfo() {
    if (!st || !hover || !sel || st.status !== 'playing' || st.turn !== st.you || st.phase !== 'build') return null;
    const item = st.players[st.you].pad.find((p) => p.uid === sel);
    if (!item) return null;
    const res = MI.canPlace(st, st.you, item.type, hover.x, hover.y, rot);
    return { type: item.type, x: hover.x, y: hover.y, rot, ok: res.ok, reason: res.reason, color: MI.COLORS[st.players[st.you].color].hex, race: st.players[st.you].race };
  }
  // ---------- 2D / 3D view ----------
  let use3D = load('mi_view') !== '2d', inited3D = false;
  // both views use the same 3D world; 2D is a straight-down camera on it, so they are always 1:1
  const is3D = () => !!window.Render3D;
  function ensure3D() {
    if (!window.Render3D) return false;
    if (!inited3D) { Render3D.init($('boardWrap')); inited3D = true; }
    Render3D.setVisible(true); Render3D.setFlat(!use3D);
    return true;
  }
  window.addEventListener('render3d-ready', () => { draw(); if (st && st.status !== 'lobby') render(); });
  function draw() {
    if (!st || st.status === 'lobby') return;
    st.placed.forEach((p) => delete p.abs);
    const g = ghostInfo();
    if (ensure3D()) {
      const ctx = board.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, board.width, board.height);
      Render3D.update(st, g);
      geo = geo || { s: 1, ox: 0, oy: 0 };
    } else if (!window.Render3D) {
      // 3D engine still loading: show a clean loading screen instead of the 2D moon
      const ctx = board.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0);
      const w = board.width, h = board.height, t = performance.now() / 1000;
      ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = 'rgba(60,240,150,0.15)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#3cf096'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, 46, t * 4, t * 4 + 1.6); ctx.stroke();
      ctx.fillStyle = '#cfe9dc'; ctx.font = '600 15px Orbitron, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('APPROACHING THE MOON', 0, 86);
      ctx.restore();
      geo = geo || { s: 1, ox: 0, oy: 0 };
    } else geo = Render.drawBoard(board, st, g, view);
    const vb = $('viewBtn'); if (vb) vb.textContent = use3D ? '2D view' : '3D view';
    const hint = $('hint');
    hint.className = g && !g.ok ? 'bad' : '';
    hint.textContent = g ? (g.ok ? `Click to build ${MI.PIECES[g.type].name}` : g.reason) : '';
  }
  document.addEventListener('click', (e) => { if (e.target.id === 'viewBtn') { use3D = !use3D; store('mi_view', use3D ? '3d' : '2d'); draw(); } });
  const cellAt = (e) => {
    if (is3D()) { const p = Render3D.pick(e.clientX, e.clientY); return p ? { x: p.x, y: p.y } : null; }
    const r = board.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left - geo.ox) / geo.s), y: Math.floor((e.clientY - r.top - geo.oy) / geo.s) };
  };
  // zoom (scroll) + pan (drag); in 3D also Q/E to turn the camera, middle-drag to orbit
  const view = { zoom: 1, px: 0, py: 0 };
  let drag = null, dragged = false;
  board.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (is3D()) { Render3D.zoom(e.deltaY); draw(); hover = cellAt(e); draw(); return; }
    const r = board.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    const old = view.zoom;
    view.zoom = Math.min(5, Math.max(0.7, view.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    const f = view.zoom / old;
    view.px = mx - (mx - view.px) * f; view.py = my - (my - view.py) * f;
    draw();
    hover = cellAt(e);
    draw();
  }, { passive: false });
  board.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 1) { drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, px: view.px, py: view.py, orbit: e.button === 1 }; dragged = false; if (e.button === 1) e.preventDefault(); } });
  addEventListener('mouseup', () => { drag = null; board.style.cursor = ''; });
  board.addEventListener('dblclick', () => { if (is3D()) Render3D.reset(); view.zoom = 1; view.px = 0; view.py = 0; draw(); });
  board.addEventListener('mousemove', (e) => {
    if (!geo && !is3D()) return;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (dragged || Math.hypot(dx, dy) > 5) {
        dragged = true; board.style.cursor = 'grabbing';
        if (is3D()) { const mx = e.clientX - drag.lx, my = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY; if (drag.orbit) Render3D.orbit(-mx * 0.006, my * 0.004); else Render3D.pan(mx, my); }
        else { view.px = drag.px + dx; view.py = drag.py + dy; }
        draw(); return;
      }
    }
    const c = cellAt(e);
    if (c && (!hover || hover.x !== c.x || hover.y !== c.y)) { hover = c; draw(); }
    boardTip(e, c);
  });
  board.addEventListener('mouseleave', () => { if (window.Render3D && Render3D.showScore) Render3D.showScore(null); hover = null; $('tip').style.display = 'none'; tipPiece = null; draw(); });

  // hover info for buildings already on the moon
  let tipPiece = null;
  function boardTip(e, c) {
    const tip = $('tip');
    const p = c && st && !sel && st.placed.find((q) => MI.absCells(q.type, q.x, q.y, q.rot).some((k) => k.x === c.x && k.y === c.y));
    if (window.Render3D && Render3D.showScore) Render3D.showScore(p && MI.PIECES[p.type].kind === 'facility' ? p.id : null);
    if (!p) { if (tipPiece) { tip.style.display = 'none'; tipPiece = null; } return; }
    if (tipPiece !== p.id) {
      tipPiece = p.id;
      const d = MI.PIECES[p.type], pl = st.players[p.owner];
      const kind = { hallway: 'Hallway', room: 'Guest rooms', generator: 'Power plant', resource: 'Race resource', facility: 'Facility', storage: 'Storage', deadend: 'Filler' }[d.kind];
      const on = !pl || st.scores.power.some((pw) => pw.powered.includes(p.id));
      const item = pl && st.scores.details[p.owner].items.find((x) => x.id === p.id);
      let lines = `<b>${esc(d.name)}</b><br><span class="muted">${kind}${d.race ? ' · ' + MI.RACES[d.race].name : ''}</span><br>`;
      lines += pl ? `Owner: <b style="color:${MI.COLORS[pl.color].hex}">${esc(pl.name)}</b> (${MI.RACES[pl.race].name})<br>` : 'Shared landing base<br>';
      if (d.power) lines += `Power: ${d.power > 0 ? '+' : ''}${d.power} · ${on ? '<span style="color:#3cf096">powered</span>' : '<span style="color:#ff4d5a">no power</span>'}<br>`;
      if (item) lines += scoreExplain(item, d);
      if (MI.FLAVOR[p.type]) lines += `<span class="muted">${esc(MI.FLAVOR[p.type])}</span>`;
      tip.innerHTML = lines;
      const snap = window.Render3D && Render3D.snapshot(st, p);
      if (snap) { const cl = snap.cloneNode(); cl.getContext('2d').drawImage(snap, 0, 0); cl.style.cssText = snap.style.cssText; tip.prepend(cl); }
      tip.style.display = 'block';
    }
    // fixed in the bottom-left corner of the board
    tip.style.right = 'auto'; tip.style.top = 'auto';
    tip.style.left = '16px'; tip.style.bottom = '16px';
  }
  board.addEventListener('click', () => {
    if (dragged) { dragged = false; return; }
    const g = ghostInfo();
    if (!g) return;
    if (!g.ok) return toast(g.reason);
    send({ t: 'place', uid: sel, x: g.x, y: g.y, rot });
  });
  board.addEventListener('contextmenu', (e) => { e.preventDefault(); rot = (rot + 1) % 4; render(); });
  addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (is3D() && (k === 'q' || k === 'e')) { Render3D.orbit(k === 'q' ? -0.25 : 0.25); draw(); return; }
    let d = 0;
    if (['r', 'd', 'w', 'arrowright', 'arrowup'].includes(k)) d = 1;
    if (['a', 's', 'arrowleft', 'arrowdown'].includes(k)) d = 3;
    if (!d) return;
    e.preventDefault();
    rot = (rot + d) % 4; render();
  });
  addEventListener('resize', () => { if (window.Render3D && inited3D) Render3D.resize(); draw(); });
  // animation loop for moving parts (~30 fps, paused when the tab is hidden)
  let lastFrame = 0;
  (function frame(ts) {
    if (st && st.status !== 'lobby' && !document.hidden && ts - lastFrame > 33) { lastFrame = ts; draw(); }
    requestAnimationFrame(frame);
  })(0);

  resume();
})();
