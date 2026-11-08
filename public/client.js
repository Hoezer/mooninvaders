(function () {
  const MI = window.MI;
  const $ = (id) => document.getElementById(id);
  let noAutoSel = false;
  let ws, st = null, sel = null, rot = 0, hover = null, geo = null;

  Render.stars($('stars'));

  function store(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function connect(onOpen) {
    ws = window.MI_SERVER === 'local' && window.LocalSocket ? new window.LocalSocket()
      : new WebSocket(window.MI_SERVER || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host));
    ws.onopen = onOpen;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'joined') { store('mi_session', JSON.stringify({ code: m.code, token: m.token })); history.replaceState(null, '', '#' + m.code); }
      if (m.t === 'kicked') { store('mi_session', null); store('mi_last', null); ws.onclose = null; alertKick(); return; }
      if (m.t === 'state') { const was = st && st.status; st = m.state; window.MI_STATE = st; capsuleFx(); handOff(); render(); if (st.status === 'playing' && st.round === 1 && (was === 'lobby' || (!was && st.placed.length <= 1))) launchIntro(); }
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

  function alertKick() {
    const el = document.createElement('div'); el.id = 'kickedBox';
    el.innerHTML = '<div class="kbCard"><div class="kbIcon">!</div><h2>You were removed</h2><p>The host removed you from this room.</p><button class="primary" id="kbOk">Back to the start</button></div>';
    document.body.appendChild(el);
    $('kbOk').onclick = () => { location.href = location.pathname; };
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
  // AI game: open a room in watch mode with all 4 races as computers; you can still change them, then press start
  const watchAi = () => { store('mi_session', null); if (ws) { ws.onclose = null; ws.close(); } connect(() => { send({ t: 'create', name: name() }); send({ t: 'watch', on: true }); for (const r of Object.keys(MI.RACES)) send({ t: 'addBot', race: r }); }); };
  $('watchBtn').onclick = watchAi;
  // dice: random commander name
  const NAME_A = ['Captain', 'Commander', 'Admiral', 'Pilot', 'Major', 'Chief', 'Ranger', 'Cadet'];
  const NAME_B = ['Nova', 'Crater', 'Orbit', 'Luna', 'Comet', 'Nebula', 'Rocket', 'Stardust', 'Eclipse', 'Quasar', 'Meteor', 'Zenith'];
  const randomName = () => { const pick = (l) => l[Math.floor(Math.random() * l.length)]; return pick(NAME_A) + ' ' + pick(NAME_B); };
  $('diceBtn').onclick = () => {
    $('name').value = randomName(); store('mi_name', $('name').value);
    const d = $('diceBtn'); d.classList.remove('roll'); void d.offsetWidth; d.classList.add('roll');
  };
  // no saved name yet: start with a random one
  if (!load('mi_name')) $('diceBtn').click();
  // start screen art: floating race lineup and images on the two choice cards
  (function homeArt() {
    try {
      const strip = $('homeRaces');
      if (strip && !strip.children.length) Object.keys(MI.RACES).forEach((k, n) => { const cv = document.createElement('canvas'); cv.width = cv.height = 220; Portraits.draw(cv, k); cv.style.setProperty('--rc', Portraits.ACC[k]); cv.style.animationDelay = (n * 0.4) + 's'; strip.appendChild(cv); });
      const paint = (id, keys) => { const cv = $(id); if (!cv) return; const x = cv.getContext('2d'); x.fillStyle = '#05070d'; x.fillRect(0, 0, 360, 200);
        keys.forEach((k, n) => { const t = document.createElement('canvas'); t.width = t.height = 200; Portraits.draw(t, k); x.globalAlpha = keys.length > 1 ? .95 : 1; x.drawImage(t, keys.length > 1 ? n * 90 : 80, 0, 200, 200); }); };
      paint('playArt', Object.keys(MI.RACES));
      paint('joinArt', ['lustroms', 'bozob']);
    } catch (e) { /* art is decoration only */ }
  })();
  // after going back to the lobby you can jump straight back into your game
  try { const last = JSON.parse(load('mi_last') || 'null'); if (last && !load('mi_session')) { const b = document.createElement('button'); b.id = 'resumeBtn'; b.className = 'primary'; b.textContent = 'Back to game ' + last.code; $('joinBox').prepend(b); } } catch (e) { /* ignore */ }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'newAiBtn' || t.id === 'endNewAi') watchAi();
    if (t.dataset.speed) send({ t: 'speed', ms: +t.dataset.speed });
    if (t.dataset.finish) send({ t: 'finishNow' });
    if (t.id === 'copyCode' && st) { const done = () => { const s = t.querySelector('span'); s.textContent = 'Copied!'; t.classList.add('ok'); setTimeout(() => { s.textContent = 'Copy'; t.classList.remove('ok'); }, 1500); }; if (navigator.clipboard) navigator.clipboard.writeText(st.code).then(done, done); else done(); }
    if (t.id === 'leaveRoomBtn') { send({ t: 'leave' }); store('mi_session', null); store('mi_last', null); setTimeout(() => { location.href = location.pathname; }, 150); }
    if (t.id === 'endLobby') { store('mi_session', null); location.href = location.pathname; }
    if (t.id === 'backBtn') { const s = load('mi_session'); if (s) store('mi_last', s); store('mi_session', null); location.href = location.pathname; }
    if (t.id === 'resumeBtn') { store('mi_session', load('mi_last')); store('mi_last', null); location.reload(); }
    if (t.id === 'endClose') { endClosed = true; $('endScreen').classList.add('hidden'); }
  });
  let endClosed = false;
  // end screen: click a player to see exactly where the points come from
  const endOpen = new Set();
  function endDetail(r) {
    const items = st.scores.details[r.i].items.slice().sort((a, b) => b.points - a.points);
    const why = { 'no power': 'no power', 'no race resource': 'missing race resource' };
    const lines = items.length ? items.map((it) => {
      const d = MI.PIECES[it.type];
      const calc = it.reason ? '<span class="bad">0 — ' + esc(why[it.reason] || it.reason) + '</span>' : d.points + ' base × (1 + ' + it.rooms + ' guest room' + (it.rooms === 1 ? '' : 's') + ')';
      return '<div class="exLine"><span>' + esc(d.name) + '</span><span class="muted">' + calc + '</span><b>' + it.points + '</b></div>';
    }).join('') : '<div class="muted">No facilities built — only facilities score points.</div>';
    return '<tr class="endDetail"><td></td><td colspan="6">' + lines + '<div class="exLine total"><span>Total</span><span class="muted">' + items.length + ' facilit' + (items.length === 1 ? 'y' : 'ies') + '</span><b>' + r.total + '</b></div></td></tr>';
  }
  document.addEventListener('click', (e) => { const tr = e.target.closest && e.target.closest('.endRow'); if (!tr) return; const i = +tr.dataset.exp; endOpen.has(i) ? endOpen.delete(i) : endOpen.add(i); renderEnd(); });
  // big launch moment: race lineup, countdown, then the camera flies in from space
  function launchIntro() {
    // show the intro only once per game (remembered in this browser)
    const seenKey = 'mi_intro_' + st.code;
    if (load(seenKey)) return;
    store(seenKey, '1');
    let el = document.getElementById('launch');
    if (!el) { el = document.createElement('div'); el.id = 'launch'; document.body.appendChild(el); }
    const races = st.players.map((p) => '<div class="lRace" style="--pc:' + MI.COLORS[p.color].hex + '"><img src="' + portraitURL(p.race) + '" alt=""><b>' + esc(p.name) + '</b><small>' + MI.RACES[p.race].name + '</small></div>').join('<span class="lVs">VS</span>');
    el.innerHTML = '<div class="lStars"></div><div class="lInner"><div class="lTitle">THE COLONIZATION BEGINS</div><div class="lRaces">' + races + '</div><div class="lWho">Who lands first?</div><div class="lCount"></div></div>';
    el.className = 'show';
    const cnt = el.querySelector('.lCount'), who = el.querySelector('.lWho');
    const cards = [...el.querySelectorAll('.lRace')], n = cards.length, winner = st.firstTurn != null ? st.firstTurn : st.turn;
    // roulette: a light runs over the races, slows down and stops on the starting player
    const hops = n * 3 + ((winner - 0 + n) % n);
    let t = 900;
    for (let k = 0; k <= hops; k++) {
      const at = k % n, last = k === hops;
      setTimeout(() => {
        cards.forEach((c, j) => c.classList.toggle('lit', j === at));
        if (last) { cards[at].classList.add('chosen'); who.innerHTML = '<b style="color:' + MI.COLORS[st.players[at].color].hex + '">' + esc(st.players[at].name) + '</b> lands first!'; who.classList.add('pop'); }
      }, t);
      t += 60 + Math.pow(k / hops, 3) * 260;
    }
    const start = t + 700;
    const steps = ['3', '2', '1', 'LAUNCH!'];
    steps.forEach((s, k) => setTimeout(() => { cnt.textContent = s; cnt.classList.remove('pop'); void cnt.offsetWidth; cnt.classList.add('pop'); }, start + k * 600));
    setTimeout(() => { el.classList.add('out'); if (window.Render3D && Render3D.intro) Render3D.intro(); }, start + steps.length * 600);
    setTimeout(() => { el.className = ''; el.innerHTML = ''; }, start + steps.length * 600 + 900);
  }
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
    const medal = ['1', '2', '3', '4'];
    const podOrder = [rows[1], rows[0], rows[2], rows[3]].filter(Boolean);
    const height = (r) => 60 + 90 * (rows.length - rows.indexOf(r)) / rows.length;
    el.innerHTML = `<div class="endCard">
      <h2>${title}</h2><div class="why">${esc(st.endReason || 'Game over')} · ${st.round} rounds played</div>
      <div class="podium">${podOrder.map((r) => `<div class="pod"><div class="nm">${esc(r.p.name)}</div><small>${MI.RACES[r.p.race].name}</small><div class="sc">${r.total}</div>
        <div class="blk" style="height:${height(r)}px;background:${MI.COLORS[r.p.color].hex}">${medal[rows.indexOf(r)]}</div></div>`).join('')}</div>
      <table class="endTable"><tr><th>#</th><th>Race</th><th class="num">Built</th><th class="num">Rooms</th><th class="num">Facilities scoring</th><th class="num">Best</th><th class="num">Score</th></tr>
      ${rows.map((r, k) => `<tr class="endRow" data-exp="${r.i}" title="Click to see where the points come from"><td>${endOpen.has(r.i) ? '▾' : '▸'} ${k + 1}</td><td><span class="dot" style="background:${MI.COLORS[r.p.color].hex}"></span> ${esc(r.p.name)}</td><td class="num">${r.built}</td><td class="num">${r.rooms}</td><td class="num">${r.scoring}/${r.fac}</td>
        <td class="num">${r.best && r.best.points ? `${esc(MI.PIECES[r.best.type].name)} ${r.best.points}` : '–'}</td><td class="num"><b>${r.total}</b></td></tr>${endOpen.has(r.i) ? endDetail(r) : ''}`).join('')}</table>
      <div class="endBtns"><button id="endClose">Look at the moon</button><button id="endNewAi">New AI game</button><button id="endLobby" class="primary">Back to lobby</button></div></div>`;
  }
  $('slots').onclick = (e) => {
    const b = e.target.closest('[data-mode]'); if (!b || b.classList.contains('on')) return;
    const idx = +b.dataset.idx, race = b.dataset.race, cur = idx >= 0 ? st.players[idx] : null;
    if (cur) send({ t: 'removeBot', idx });
    if (b.dataset.mode === 'bot') send({ t: 'addBot', race });
    if (b.dataset.mode === 'local') send({ t: 'addLocal', race });
  };

  // leaving a room with friends in it for an AI game: only after a check
  const confirmLeave = () => !st || st.players.filter((p) => !p.bot).length <= 1 || window.confirm('Leave this room and start an AI game?');
  let showProfile = null;
  function renderLobby() {
    $('joinBox').classList.add('hidden'); $('roomBox').classList.remove('hidden');
    document.body.classList.add('inRoom');
    $('roomCode').textContent = st.code;
    const me = st.players[st.you];
    // one card per race: portrait + who plays it (You / Human / Computer / Off)
    const host = st.you === 0;
    $('raceList').innerHTML = '';
    for (const [k, r] of Object.entries(MI.RACES)) {
      const i = st.players.findIndex((p) => p.race === k), p = st.players[i];
      const mode = !p ? 'off' : i === st.you ? 'you' : p.bot ? 'bot' : p.local ? 'local' : 'online';
      const d = document.createElement('div');
      d.className = 'race rc2 m-' + mode; d.style.setProperty('--rc', Portraits.ACC[k]);
      const opt = (m, label) => '<button class="segB' + (mode === m || (m === 'local' && mode === 'you') ? ' on' : '') + '" data-m="' + m + '" data-race="' + k + '" data-idx="' + i + '">' + label + '</button>';
      const ctrl = mode === 'online' ? '<div class="rcWho">' + esc(p.name) + ' · online' + (host ? '<button class="kickB" data-kick="' + i + '" title="Remove this player from the room">Remove</button>' : '') + '</div>'
        : host ? '<div class="seg4">' + opt('off', 'Off') + opt('local', 'Human') + opt('bot', 'Computer') + '</div>'
        : mode === 'you' ? '<div class="seg4"><button class="segB on">You</button></div>'
        : mode === 'off' ? '<div class="seg4">' + opt('you', 'Play this race') + '</div>'
        : '<div class="seg4"><span class="rcWho">' + (mode === 'bot' ? 'Computer' : esc(p.name)) + '</span></div>';
      // every card has a name row: Human = editable + dice, Computer = race name, Off = empty
      const editable = mode === 'you' || (mode === 'local' && host);
      const shown = editable || mode === 'online' ? p.name : mode === 'bot' ? (p ? p.name : '') : '';
      const nameBox = '<label class="rcName' + (editable ? '' : ' ro') + '"><span>Player name</span><span class="nmRow"><input ' + (editable ? 'data-rename="' + i + '"' : 'disabled') + ' maxlength="20" value="' + esc(shown) + '" placeholder="' + (mode === 'off' ? 'Not playing' : '') + '">' + (editable ? '<button class="rcDice" data-dice="' + i + '" title="Random name"><svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="16" cy="8" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="8" cy="16" r="1.6" fill="currentColor"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/></svg></button>' : '') + '</span></label>';
      d.innerHTML = '<canvas width="360" height="360"></canvas><div class="rcBody"><b>' + r.name.split(' ').pop() + '</b><i>' + r.name.split(' ')[0] + '</i></div>' + ctrl + nameBox;
      Portraits.draw(d.querySelector('canvas'), k);
      const ni = d.querySelector('[data-rename]');
      const dz = d.querySelector('[data-dice]');
      if (dz) dz.onclick = (e) => { e.preventDefault(); e.stopPropagation(); const v = randomName(); const ix = +dz.dataset.dice; if (ix === st.you) store('mi_name', v); send({ t: 'rename', idx: ix, name: v }); };
      if (ni) { ni.onclick = (e) => e.stopPropagation(); ni.onchange = () => { const v = ni.value.trim(); if (!v) return; if (+ni.dataset.rename === st.you) store('mi_name', v); send({ t: 'rename', idx: +ni.dataset.rename, name: v }); }; }
      d.onclick = (e) => {
        if (e.target.closest('.rcName')) return;
        const kb = e.target.closest('[data-kick]'); if (kb) { e.stopPropagation(); send({ t: 'removeBot', idx: +kb.dataset.kick }); return; }
        const b = e.target.closest('[data-m]');
        // joined players: clicking a free race card switches to it straight away
        // clicking a free (Off) race card moves you to that race, for the host and for joined players
        if (!b && mode === 'off') { showProfile = k; send({ t: 'pick', race: k }); return; }
        if (!b) { showProfile = k; renderLobby(); return; }
        if (b.classList.contains('on')) return;
        const m = b.dataset.m, idx = +b.dataset.idx, cur = idx >= 0 ? st.players[idx] : null;
        showProfile = k;
        if (m === 'you') { if (cur && cur !== me) send({ t: 'removeBot', idx }); send({ t: 'pick', race: k }); return; }
        if (cur === me) send({ t: 'watch', on: true }); else if (cur) send({ t: 'removeBot', idx });
        if (m === 'bot') send({ t: 'addBot', race: k });
        // Human: the host takes the first human seat themselves, further humans play on this PC
        if (m === 'local') { if (!me.race) { send({ t: 'pick', race: k }); return; } send({ t: 'addLocal', race: k, name: randomName() }); }
      };
      $('raceList').appendChild(d);
    }
    // big profile of the selected race (or the watch-mode explanation)
    const profRace = showProfile && MI.RACES[showProfile] ? showProfile : me.race;
    if (!profRace) {
      $('raceProfile').style.setProperty('--rc', '#3cf096');
      const bots = st.players.filter((p) => p.bot);
      $('raceProfile').innerHTML = '<div class="prof"><canvas width="520" height="520"></canvas>'
        + '<div class="profTxt"><small>MODE</small><h2>AI Game</h2><div class="profTitle">Mission control · computers only</div>'
        + '<blockquote>“Sit back, Commander. Let the races fight it out.”</blockquote>'
        + '<div class="chips"><span>Spectator</span><span>2 to 4 races</span><span>Live 3D</span><span>Speed control</span></div>'
        + '<p>Every race you add below is played by the computer. They build, order and compete for points on their own, while you follow every move from above. A great way to learn how the races play and which strategies score.</p>'
        + '<div class="profGrid"><div><small>WHO PLAYS</small>The races you add as computer under <b>Who plays?</b> (at least 2).</div><div><small>STARTING PLAYER</small>Picked at random in the launch roulette.</div>'
        + '<div><small>SPEED</small>1×, 4× or 15× during the game.</div><div><small>END</small>Wait for the finish or end it early, then open each player\'s score.</div></div>'
        + '<div class="profPlay"><small>TIP</small>Hover a race in the scoreboard to light up its buildings, and hover a building to see where its points come from.</div>'
        + '<div class="profRooms"><small>IN THIS GAME</small>' + (bots.length ? bots.map((p) => '<span>' + esc(p.name) + '</span>').join('') : '<span>No computer races yet</span>') + '</div></div></div>';
      const pc = $('raceProfile').querySelector('canvas'), px = pc.getContext('2d');
      px.fillStyle = '#05070d'; px.fillRect(0, 0, 520, 520);
      Object.keys(MI.RACES).forEach((k, n) => { const t = document.createElement('canvas'); t.width = t.height = 260; Portraits.draw(t, k); px.drawImage(t, (n % 2) * 260, Math.floor(n / 2) * 260, 260, 260); });
    } else {
    const R = MI.RACES[profRace];
    const own = Object.values(MI.PIECES).filter((p) => p.race === profRace);
    $('raceProfile').style.setProperty('--rc', Portraits.ACC[profRace]);
    $('raceProfile').innerHTML = `<div class="prof"><canvas width="520" height="520"></canvas>
      <div class="profTxt"><small>LEADER</small><h2>${esc(R.leader)}</h2><div class="profTitle">${esc(R.title)} · ${R.name}</div>
      <blockquote>“${esc(R.quote)}”</blockquote>
      <div class="chips">${R.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <p>${esc(R.lore)}</p>
      <div class="profGrid"><div><small>HOMEWORLD</small>${esc(R.homeworld)}</div><div><small>ABILITY</small>${esc(R.ability)}</div>
      <div><small>STRENGTHS</small>${R.strengths.map(esc).join('<br>')}</div><div><small>WEAKNESS</small>${esc(R.weakness)}</div></div>
      <div class="profPlay"><small>HOW TO PLAY</small>${esc(R.playstyle)}</div>
      <div class="profRooms"><small>RACE ROOMS</small>${own.map((p) => `<span>${esc(p.name)}${p.points ? ' ★' + p.points : ''}</span>`).join('')}</div></div></div>`;
    Portraits.draw($('raceProfile').querySelector('canvas'), profRace);
    }
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
      `<li><span class="dot" style="background:${(MI.COLORS[p.color] || { hex: '#3cf096' }).hex}"></span>${esc(p.name)}${i === 0 ? ' — host' : ''}${p.bot ? '' : ''}<span class="muted">&nbsp;${(MI.RACES[p.race] || { name: 'Watching' }).name}</span>${p.bot && st.you === 0 ? ` <button data-kick="${i}" style="margin-left:auto;padding:2px 8px">✕</button>` : ''}</li>`).join('');
    // step 3: one slot per race
    // (host declared above)
    $('slots').innerHTML = Object.entries(MI.RACES).map(([k, r]) => {
      const i = st.players.findIndex((p) => p.race === k), p = st.players[i];
      const mode = !p ? 'off' : i === st.you ? 'you' : p.bot ? 'bot' : p.local ? 'local' : 'online';
      const who = mode === 'you' ? '<b>You</b>' : mode === 'online' ? '<b>' + esc(p.name) + '</b><small>online</small>' : mode === 'local' ? '<b>' + esc(p.name) + '</b><small>human · this PC</small>' : mode === 'bot' ? '<b>Computer</b>' : '<span class="open">Not playing</span>';
      const seg = (m, label) => '<button class="segB' + (mode === m ? ' on' : '') + '" data-mode="' + m + '" data-race="' + k + '" data-idx="' + i + '">' + label + '</button>';
      const act = !host || mode === 'you' || mode === 'online' ? '' : '<div class="seg">' + seg('off', 'Off') + seg('local', 'Human') + seg('bot', 'Computer') + '</div>';
      return '<div class="slot' + (p ? ' filled' : '') + '" style="--rc:' + Portraits.ACC[k] + (p ? ';--pc:' + MI.COLORS[p.color].hex : '') + '"><img src="' + portraitURL(k) + '" alt=""><div><span class="rn">' + r.name.split(' ').pop() + '</span>' + who + '</div>' + act + '</div>';
    }).join('');
    $('botBtn').classList.add('hidden');
    $('startBtn').classList.toggle('hidden', st.you !== 0);
    $('startBtn').disabled = st.players.length < 2;
    // VS line-up of everyone who plays
    const lineup = st.players.filter((p) => p.race);
    $('vsBar').innerHTML = lineup.map((p) => '<div class="vsP" style="--pc:' + MI.COLORS[p.color].hex + '"><img src="' + portraitURL(p.race) + '" alt=""><b>' + esc(p.name) + '</b><small>' + (p.bot ? 'Computer' : 'Human') + '</small></div>').join('<span class="vsX">VS</span>');
    const nBots = st.players.filter((p) => p.bot).length;
    if (me.watch) { $('startBtn').disabled = nBots < 2; $('startBtn').textContent = nBots < 2 ? 'Add at least 2 computer races' : 'Start AI game · ' + nBots + ' computers'; }
    else $('startBtn').textContent = st.players.length < 2 ? 'Add a computer or wait for a friend' : 'Launch the colonization · ' + st.players.length + ' races';
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
    if (!myTurn) noAutoSel = false;
    if (!sel && !noAutoSel && myTurn && me.pad.length) sel = me.pad[0].uid;
    $('gameCode').textContent = st.code;
    const cur = st.players[st.turn];
    $('turnInfo').innerHTML = st.status === 'ended' ? '<b>Game over</b>'
      : `Round ${st.round} · ${myTurn ? '<b class="you">Your turn</b>' : `<b>${esc(cur.name)}</b>'s turn`} · ${st.phase === 'build' ? 'Capsules not drawn yet' : 'Capsules drawn'}`;

    // me panel
    const pw = st.scores.power[meIdx], myColor = MI.COLORS[me.color].hex;
    const pct = pw.supply ? Math.min(100, (pw.demand / pw.supply) * 100) : 100;
    const isHost = st.you <= 0;
    const speeds = [['1×', 600], ['4×', 150], ['15×', 40]];
    const ctrl = isHost && st.status === 'playing' ? `<div class="ctrl">${st.players.some((p) => p.bot) ? '<span class="spdLbl">AI speed</span>' + speeds.map(([l, ms]) => `<button data-speed="${ms}" class="${st.botDelay === ms ? 'on' : ''}" title="How fast the computer players move">${l}</button>`).join('') : ''}</div>` : '';
    // End game lives in the top bar now (host only)
    let eg = document.getElementById('endGameBtn');
    if (!eg) { eg = document.createElement('button'); eg.id = 'endGameBtn'; eg.dataset.finish = '1'; eg.textContent = 'End game'; eg.title = 'End the game now and show the scores'; $('viewBtn').before(eg); }
    eg.classList.toggle('hidden', !(isHost && st.status === 'playing'));
    $('mePanel').innerHTML = (spect ? `<div class="spectBar">Watching 4 computers · following <b>${esc(me.name)}</b>${ctrl}</div>` : (ctrl ? `<div class="spectBar">${ctrl}</div>` : ''));
    const resCount = st.placed.filter((p) => p.owner === meIdx && MI.PIECES[p.type].kind === 'resource').length;
    $('hud').innerHTML = `
      <div class="chip"><span class="ic">${CAP}</span><div><small>Capsules</small><b>${me.capsules}</b></div></div>
      <div class="chip ${pw.demand > pw.supply ? 'warn' : ''}"><span class="ic">ϟ</span><div class="pw2"><small>Power</small>
        <div class="pwRow" data-pw="used"><span>Used</span><div class="bar used ${pw.demand > pw.supply ? 'over' : ''}"><i style="width:${Math.min(100, pw.supply ? pw.demand / pw.supply * 100 : (pw.demand ? 100 : 0))}%"></i></div><b>${pw.demand}</b></div>
        <div class="pwRow" data-pw="made"><span>Produces</span><div class="bar left"><i style="width:100%"></i></div><b>${pw.supply}</b></div>
      </div></div>
      <div class="chip"><span class="ic">★</span><div><small>Score</small><b>${st.scores.details[meIdx].total}</b></div></div>`;

    // actions
    let a = '';
    if (st.status === 'ended') {
      const best = Math.max(...st.scores.details.map((d) => d.total));
      const winners = st.players.filter((_, i) => st.scores.details[i].total === best).map((p) => esc(p.name)).join(' & ');
      a = `<div class="winner">${winners} rule${winners.includes('&') ? '' : 's'} the moon!</div>`;
    } else if (!myTurn) a = "";
    else if (st.phase === 'build') {
      a = `<h3>1 · Build</h3><div class="muted" style="font-size:12px;margin-bottom:8px">Select a piece, hover the moon and click to build. Green spots show where it fits. Rotate: <b>R / arrows</b> or right-click. <b>WASD</b> moves the map. Scroll = zoom, drag = move, double-click = reset.</div>
        <div class="btns"><button id="rotBtn">Rotate ↻</button><button id="doneBtn" class="primary" ${me.pad.length ? 'disabled' : ''}>Draw capsules →</button></div>`;
    } else {
      a = `<h3>3 · Order</h3><div class="muted" style="font-size:12px;margin-bottom:8px">${st.lastRoll ? `You drew <b>${st.lastRoll.gain}</b> capsules. ` : ''}Orders land at the start of your next turn.</div>
        <div class="btns"><button id="endBtn" class="primary">End turn</button></div>`;
    }
    $('actionPanel').innerHTML = a;
    // on your own turn the tray buttons (Draw, Order, End turn) replace the phase panel
    $('actionPanel').classList.toggle('hidden', !!myTurn);
    if ($('rotBtn')) $('rotBtn').onclick = () => { rot = (rot + 1) % 4; draw(); };
    if ($('doneBtn')) $('doneBtn').onclick = () => send({ t: 'doneBuild' });
    if ($('endBtn')) $('endBtn').onclick = () => send({ t: 'endTurn' });

    // landing pad + storage
    const pad = $('tray'); pad.innerHTML = '';
    const section = (title, items, kind) => {
      const box = document.createElement('div'); box.className = 'trayBox ' + kind; pad.appendChild(box);
      const h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
      if (!items.length) { const e = document.createElement('div'); e.className = 'muted empty'; box.appendChild(e); return; }
      const wrap = document.createElement('div'); wrap.className = 'tiles';
      for (const it of items) {
        const t = document.createElement('div');
        t.className = 'tile' + (sel === it.uid ? ' sel' : '');
        const c = document.createElement('canvas'); const dpr = devicePixelRatio || 1;
        c.width = 92 * dpr; c.height = 80 * dpr; c.style.width = '92px'; c.style.height = '80px';
        Render.drawMini(c, it.type, myColor, sel === it.uid ? rot : 0);
        t.appendChild(c);
        t.appendChild(document.createTextNode(MI.PIECES[it.type].name));
        t.title = MI.PIECES[it.type].name;
        { const ct = document.createElement('span'); ct.className = 'costTag'; ct.innerHTML = MI.PIECES[it.type].cost + ' ' + CAP; t.appendChild(ct); }
        if (kind === 'pad' && myTurn) {
          t.onclick = () => { if (sel === it.uid) { sel = null; noAutoSel = true; } else { sel = it.uid; noAutoSel = false; } render(); };
          const acts = document.createElement('div'); acts.className = 'acts';
          if (me.storage.length < me.storageCap) acts.appendChild(btn('Store', () => send({ t: 'store', uid: it.uid })));
          // drag the tile onto the bin next to the landing pad to scrap it
          t.draggable = true;
          t.ondragstart = (e) => { e.dataTransfer.setData('text/mi-uid', String(it.uid)); e.dataTransfer.effectAllowed = 'move'; document.body.classList.add('dragScrap'); };
          t.ondragend = () => document.body.classList.remove('dragScrap');
          t.appendChild(acts);
        }
        if (kind === 'store' && myTurn) {
          const acts = document.createElement('div'); acts.className = 'acts';
          acts.appendChild(btn('To pad', () => send({ t: 'retrieve', uid: it.uid })));
          t.appendChild(acts);
        }
        wrap.appendChild(t);
      }
      box.appendChild(wrap);
    };
    section('Landing pad', me.pad, 'pad');
    if (myTurn) {
      const bin = document.createElement('div'); bin.className = 'scrapBin'; bin.title = 'Drag a landed piece here to scrap it (only if it fits nowhere)';
      bin.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><b>Scrap</b>';
      bin.ondragover = (e) => { e.preventDefault(); bin.classList.add('over'); };
      bin.ondragleave = () => bin.classList.remove('over');
      bin.ondrop = (e) => { e.preventDefault(); bin.classList.remove('over'); document.body.classList.remove('dragScrap'); const uid = +e.dataTransfer.getData('text/mi-uid'); if (uid) send({ t: 'discard', uid }); };
      pad.insertBefore(bin, pad.firstChild);
    }
    section('Storage ' + me.storage.length + '/' + (me.storageCap || 0), me.storage, 'store');
    // draw-capsules button between Storage and Requests
    if (myTurn && (st.phase === 'build' || st.phase === 'order')) {
      const drawn = st.phase === 'order';
      const db = document.createElement('button'); db.className = 'drawBtn' + (drawn ? ' used' : ''); db.disabled = drawn;
      db.innerHTML = '<span class="dKnob">' + (drawn && st.lastRoll && st.lastRoll.player === st.you ? '<span class="dNum">+' + st.lastRoll.gain + '</span>' : '<svg viewBox="0 0 24 24" width="30" height="30"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><circle cx="16" cy="8" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="8" cy="16" r="1.6" fill="currentColor"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/></svg>') + '</span><b>' + (drawn ? 'Drawn' : 'Draw') + '</b>'; db.title = drawn ? 'Capsules drawn this turn' : me.pad.length ? 'Build or store your landing pad first' : 'Draw capsules (roll 2 to 5)';
      db.onclick = () => send({ t: 'doneBuild' });
      pad.appendChild(db);
    }
    const coming = [...(me.incoming || []), ...me.orders.map((o) => o.type)].map((type, i) => ({ uid: -1 - i, type }));
    section('Requests', coming, 'incoming');
    const reqBox = pad.lastChild;
    reqBox.querySelectorAll('.tile').forEach((t) => t.classList.add('incoming'));
    const canOrder = !!myTurn;
    if (canOrder) {
      // tiles of this turn's orders: click to cancel
      const nInc = (me.incoming || []).length, tiles = reqBox.querySelectorAll('.tile');
      me.orders.forEach((o, k) => { const t = tiles[nInc + k]; if (t) { t.classList.add('cancelable'); t.title = 'Click to cancel this order'; t.onclick = () => send({ t: 'cancelOrder', uid: o.uid }); } });
      let wrap = reqBox.querySelector('.tiles'); const empty = reqBox.querySelector('.empty');
      if (!wrap) { wrap = document.createElement('div'); wrap.className = 'tiles'; reqBox.appendChild(wrap); }
      if (empty) empty.remove();
      const plus = document.createElement('div'); plus.className = 'tile plusTile' + (marketOpen ? ' open' : '');
      plus.innerHTML = '<span>+</span><small>Order</small>'; plus.title = 'Order new pieces';
      plus.onclick = () => { marketOpen = !marketOpen; render(); };
      wrap.appendChild(plus);
    } else marketOpen = false;
    renderMarketBar(canOrder && marketOpen, me);
    if (myTurn) {
      const eb = document.createElement('button'); eb.className = 'drawBtn endBtn'; eb.disabled = st.phase !== 'order' || me.pad.length > 0;
      eb.innerHTML = '<span class="dKnob"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><b>End turn</b>';
      eb.title = st.phase !== 'order' ? 'Draw capsules first' : me.pad.length ? 'Build, store or scrap your landing pad first' : 'End your turn';
      eb.onclick = () => { marketOpen = false; send({ t: 'endTurn' }); };
      pad.appendChild(eb);
    }

    // shop
    const shop = $('shopPanel');
    if (false) {
      shop.classList.remove('hidden');
      let h = `<div class="mktHead"><span>Market</span><span class="wallet">◉ ${me.capsules} capsules</span></div>`;
      const spent = me.orders.reduce((a, o) => a + MI.PIECES[o.type].cost, 0);
      h += `<div class="cart"><div class="cartHead"><b>Your order</b><span>${me.orders.length} piece${me.orders.length === 1 ? '' : 's'} · ${spent} ◉ spent</span></div>`;
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
          `<span class="tag ${d.power > 0 ? 'pw-plus' : 'pw-min'}">${d.power > 0 ? '+' : ''}${d.power}</span>`,
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
      return `<div class="prow ${live ? 'active' : ''}" data-owner="${i}" style="--pc:${c}">${live ? '<span class="turnMark" title="Their turn"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 4l12 8-12 8z" fill="currentColor"/></svg></span>' : '<span class="turnMark idle"></span>'}<img class="rimg" src="${portraitURL(p.race)}" alt=""><span class="pn"><span class="pnTop">${esc(p.name)}<span class="who ${p.bot ? 'bot' : 'human'}">${p.bot ? 'Computer' : i === st.you ? 'You' : 'Player'}</span></span>${i !== st.you && (p.requestShapes || []).length ? '<span class="reqs" title="Requested pieces (face down)">' + p.requestShapes.map((sh) => '<img src="' + faceDownURL(sh) + '" alt="">').join('') + '</span>' : ''}</span><span class="sc">${d.total}</span></div>`;
      // eslint-disable-next-line no-unreachable
      return `<div class="prow ${live ? 'active' : ''}" style="--pc:${c}">
        <span class="rank">${rank + 1}</span>
        <span class="av">${esc(p.name).slice(0, 1)}</span>
        <span class="pn">${esc(p.name)}${live ? ' <em>playing</em>' : ''}${p.connected ? '' : ' <em class="off">offline</em>'}
          <small>${MI.RACES[p.race].name} · ${p.capsules} ${CAP} · ${d.items.filter((x) => x.points).length}/${d.items.length} scoring</small>
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
  Render.drawMini = (cv, type, color, r) => { draw3DInto(cv, type, r || 0); }; void drawMini2D;
  let marketOpen = false, marketCat = 'hallway';
  const MARKET_CATS = [['hallway', 'Hallways', ['hallway', 'deadend']], ['room', 'Rooms', ['room']], ['generator', 'Power', ['generator']], ['resource', 'Race resources', ['resource']], ['facility', 'Facilities', ['facility']], ['storage', 'Storage', ['storage']]];
  // one line that says what makes a market item special
  function uniqueLine(k, d) {
    const ex = d.cells.reduce((a, c) => a + c.e.filter((e) => e === 'o').length, 0), en = d.cells.reduce((a, c) => a + c.e.filter((e) => e === 'i').length, 0);
    const doors = (ex ? ex + ' exit' + (ex > 1 ? 's' : '') : '') + (ex && en ? ' · ' : '') + (en ? en + ' entrance' + (en > 1 ? 's' : '') : '');
    switch (d.kind) {
      case 'hallway': return doors || 'Closed';
      case 'room': return 'Guest rooms · multiply nearby facilities';
      case 'generator': return 'Makes <b>+' + d.power + '</b> power';
      case 'resource': return 'Unlocks your race facilities';
      case 'facility': return '<b>★' + d.points + '</b> × (1 + rooms)' + (d.race ? '<br><span class="needs">Needs your ' + Object.values(MI.PIECES).filter((r) => r.kind === 'resource' && r.race === d.race).map((r) => esc(r.name)).join(' or ') + '</span>' : '');
      case 'storage': return 'Keeps a landed piece for later';
      case 'deadend': return 'Closes off an open exit';
      default: return doors;
    }
  }
  // click anywhere outside the order menu (and outside the + tile) closes it
  document.addEventListener('mousedown', (e) => {
    if (!marketOpen) return;
    if (e.target.closest && (e.target.closest('#marketBar') || e.target.closest('.plusTile'))) return;
    // close without rebuilding the tray, otherwise the clicked button is replaced and the click is lost
    marketOpen = false;
    const bar = document.getElementById('marketBar'); if (bar) bar.remove();
    document.querySelectorAll('.plusTile.open').forEach((t) => t.classList.remove('open'));
  });
  function renderMarketBar(open, me) {
    let bar = document.getElementById('marketBar');
    if (!open) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'marketBar'; $('boardWrap').appendChild(bar); }
    const cat = MARKET_CATS.find((c) => c[0] === marketCat) || MARKET_CATS[0];
    // only show what you can buy right now (in stock and affordable)
    const items = Object.entries(MI.PIECES).filter(([k, d]) => cat[2].includes(d.kind) && me.supply[k] > 0 && me.capsules >= d.cost);
    const spent = me.orders.reduce((a, o) => a + MI.PIECES[o.type].cost, 0);
    bar.innerHTML = '<div class="mbItems">' + (items.length ? items.map(([k, d]) => {
      const left = me.supply[k], can = left > 0 && me.capsules >= d.cost;
      return '<button class="mbItem' + (can ? '' : ' off') + '" data-order="' + k + '" ' + (can ? '' : 'disabled') + ' title="' + esc(d.name + (MI.FLAVOR[k] ? ' — ' + MI.FLAVOR[k] : '')) + '">'
        + '<span class="costTag">' + d.cost + ' ' + CAP + '</span>'
        + (d.power ? '<span class="pwTag ' + (d.power > 0 ? 'plus' : 'min') + '">' + (d.power > 0 ? '+' : '') + d.power + ' ϟ</span>' : '')
        + '<b>' + esc(d.name) + '</b>'
        + '<span class="mbPic"><canvas data-mini="' + k + '" width="' + 84 * devicePixelRatio + '" height="' + 70 * devicePixelRatio + '"></canvas><img class="mbShape" src="' + faceDownURL(d.cells) + '" alt=""></span>'
        + '<span class="mbWhat">' + uniqueLine(k, d) + '</span>'
        + '<small class="mbLeft">' + (left <= 0 ? 'Sold out' : me.capsules < d.cost ? 'Need ' + (d.cost - me.capsules) + ' more' : left + ' left') + '</small></button>';
    }).join('') : '<div class="muted mbNone">Nothing you can buy here right now.</div>') + '</div>'
      + '<div class="mbCats">' + MARKET_CATS.map((c) => '<button class="mbCat' + (c[0] === cat[0] ? ' on' : '') + '" data-cat="' + c[0] + '">' + c[1] + '</button>').join('')
      + '</div>';
    bar.querySelectorAll('canvas[data-mini]').forEach((cv) => Render.drawMini(cv, cv.dataset.mini));
    bar.querySelectorAll('[data-order]').forEach((b) => b.onclick = () => send({ t: 'order', type: b.dataset.order }));
    bar.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { marketCat = b.dataset.cat; renderMarketBar(true, me); });
    void spent;
  }
  let lastFx = '';
  function capsuleFx() {
    const r = st && st.lastRoll; if (!r || r.player !== st.you || st.phase !== 'order' || st.turn !== st.you) return;
    const key = 'mi_fx_' + st.code + '_' + st.round + '_' + st.you; if (key === lastFx || load(key)) { lastFx = key; return; } lastFx = key; store(key, '1');
    const el = document.createElement('div'); el.className = 'capsFx';
    el.innerHTML = '<div class="cfDie">' + r.roll + '</div><div class="cfGain">+' + r.gain + ' ' + CAP + '</div><div class="cfTxt">capsules received</div>';
    $('boardWrap').appendChild(el); setTimeout(() => el.remove(), 2600);
  }
  // hover Used / Produces: list the buildings behind the number and light them up on the moon
  document.addEventListener('mouseover', (e) => {
    const row = e.target.closest && e.target.closest('.pwRow[data-pw]');
    const tip = $('tip');
    if (!row || !st || st.status !== 'playing') { if (tip.dataset.pw) { tip.dataset.pw = ''; if (window.Render3D && Render3D.markIds) Render3D.markIds(null); } return; }
    const kind = row.dataset.pw, me = st.players[meIdxNow()], race = MI.RACES[me.race];
    const mine = st.placed.filter((q) => q.owner === meIdxNow());
    const list = mine.filter((q) => kind === 'used' ? MI.PIECES[q.type].power < 0 : MI.PIECES[q.type].power > 0);
    const powered = new Set((st.scores.power[meIdxNow()] || { powered: [] }).powered);
    const groups = {};
    for (const q of list) { const d = MI.PIECES[q.type]; const g = groups[q.type] || (groups[q.type] = { n: 0, p: 0, off: 0, name: d.name }); g.n++; g.p += Math.abs(d.power); if (kind === 'used' && !powered.has(q.id)) g.off++; }
    let rows = Object.values(groups).sort((a, b) => b.p - a.p).map((g) => '<tr><td>' + esc(g.name) + (g.n > 1 ? ' ×' + g.n : '') + (g.off ? ' <span class="bad">(' + g.off + ' unpowered)</span>' : '') + '</td><td><b>' + (kind === 'used' ? '−' : '+') + g.p + '</b></td></tr>').join('');
    if (kind === 'made' && race.bonusPower) rows += '<tr><td>' + esc(race.ability.split(':')[0]) + ' <span class="muted">(race bonus)</span></td><td><b>+' + race.bonusPower + '</b></td></tr>';
    tip.innerHTML = '<b>' + (kind === 'used' ? 'Power used' : 'Power produced') + '</b>' + (rows ? '<table class="sxt">' + rows + '</table>' : '<div class="muted">Nothing yet.</div>');
    tip.dataset.pw = kind; void rows; // values are shown on the sticks above the buildings instead of a card
    if (window.Render3D && Render3D.markIds) { const labels = {}; for (const q of list) { const v = MI.PIECES[q.type].power; labels[q.id] = (v > 0 ? '+' : '−') + Math.abs(v); } Render3D.markIds(list.map((q) => q.id), kind === 'used' ? 0xff8a3c : 0x3cf096, labels); draw(); }
  });
  function meIdxNow() { return st.you >= 0 ? st.you : st.turn; }
  // capsule icon used everywhere capsules appear
  const CAP = '<svg class="capIc" viewBox="0 0 24 24" aria-label="capsules"><defs><linearGradient id="capG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9ffd9"/><stop offset="1" stop-color="#2fd982"/></linearGradient></defs><rect x="7" y="2.5" width="10" height="17" rx="5" fill="url(#capG)" stroke="#0a5c37" stroke-width="1.2"/><circle cx="12" cy="8.5" r="2.3" fill="#0b2a1d" stroke="#e9fff4" stroke-width="1"/><path d="M7 15l-2.5 3.5h4M17 15l2.5 3.5h-4" fill="#2fd982" stroke="#0a5c37" stroke-width="1" stroke-linejoin="round"/><path d="M10 19.5h4l-2 2.5z" fill="#ffd166"/></svg>';
  // hot seat: when the turn moves to another human on this PC, cover the screen until they are ready
  let lastHand = null;
  function handOff() {
    if (!st || st.status !== 'playing') return;
    const locals = st.players.filter((p) => p.local).length;
    if (!locals) return;
    const cur = st.players[st.turn];
    if (cur.bot || st.turn !== st.you) return;              // only humans controlled from this device
    const key = st.code + '|' + st.round + '|' + st.turn;
    if (lastHand === key || load('mi_hand') === key) { lastHand = key; return; }
    lastHand = key;
    let el = document.getElementById('handOff');
    if (!el) { el = document.createElement('div'); el.id = 'handOff'; document.body.appendChild(el); }
    el.style.setProperty('--pc', MI.COLORS[cur.color].hex);
    el.innerHTML = '<div class="hoCard"><img src="' + portraitURL(cur.race) + '" alt=""><small>Pass the controls to</small><b>' + esc(cur.name) + '</b><span>' + MI.RACES[cur.race].name + '</span><button id="hoReady" class="primary">I am ready</button></div>';
    el.className = 'show';
    $('hoReady').onclick = () => { store('mi_hand', key); el.className = ''; };
  }
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
  // where can the selected pad piece go? (cached per board state)
  let spotKey = '', spotList = null;
  function fitSpots() {
    if (!st || st.status !== 'playing' || st.turn !== st.you || !sel) return null;
    const item = st.players[st.you].pad.find((p) => p.uid === sel); if (!item) return null;
    const key = item.type + '|' + st.placed.length + '|' + st.placed.map((q) => q.id).join(',');
    if (key !== spotKey) { spotKey = key; st.placed.forEach((q) => delete q.abs); spotList = MI.legalSpots(st, st.you, item.type); }
    return spotList;
  }
  function ghostInfo() {
    if (!st || !hover || !sel || st.status !== 'playing' || st.turn !== st.you) return null;
    const item = st.players[st.you].pad.find((p) => p.uid === sel);
    if (!item) return null;
    const spots = fitSpots() || [];
    const here = spots.filter((s) => s.x === hover.x && s.y === hover.y);
    if (!here.length) return null;
    // rotating cycles through the rotations that fit on this spot
    if (!here.some((s) => s.rot === rot)) rot = here.slice().sort((p, q) => ((p.rot - rot + 4) % 4) - ((q.rot - rot + 4) % 4))[0].rot;
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
  function showLoader(on) {
    let el = document.getElementById('loader');
    if (!el && on) {
      el = document.createElement('div'); el.id = 'loader';
      el.innerHTML = '<div class="ldMoon"><div class="ldOrbit"><i></i></div></div><div class="ldTxt">Approaching the moon</div><div class="ldSub">Preparing the landing site</div>';
      $('boardWrap').appendChild(el);
    }
    if (el) el.classList.toggle('hide', !on);
  }
  function draw() {
    if (!st || st.status === 'lobby') return;
    st.placed.forEach((p) => delete p.abs);
    const g = ghostInfo();
    if (ensure3D()) {
      showLoader(false);
      const ctx = board.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, board.width, board.height);
      Render3D.setSpots(fitSpots());
      Render3D.update(st, g);
      geo = geo || { s: 1, ox: 0, oy: 0 };
    } else if (!window.Render3D) {
      // 3D engine still loading: a styled loading screen on top of the board
      const ctx = board.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, board.width, board.height);
      showLoader(true);
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
  const held = new Set();
  addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  addEventListener('blur', () => held.clear());
  (function panLoop() {
    if (held.size && st && st.status !== 'lobby') {
      const sp = 1.5, dx = (held.has('a') ? sp : 0) - (held.has('d') ? sp : 0), dy = (held.has('w') ? sp : 0) - (held.has('s') ? sp : 0);
      if (is3D()) Render3D.pan(dx, dy); else { view.px += dx; view.py += dy; }
      draw();
    }
    requestAnimationFrame(panLoop);
  })();
  addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (is3D() && (k === 'q' || k === 'e')) { Render3D.orbit(k === 'q' ? -0.25 : 0.25); draw(); return; }
    // WASD moves over the map (held keys glide smoothly, see panLoop)
    if (['w', 'a', 's', 'd'].includes(k)) { e.preventDefault(); held.add(k); return; }
    let d = 0;
    if (['r', 'arrowright', 'arrowup'].includes(k)) d = 1;
    if (['arrowleft', 'arrowdown'].includes(k)) d = 3;
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
