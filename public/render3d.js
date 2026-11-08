// Real 3D view of the moon base (Three.js). Exposes window.Render3D.
import * as THREE from '/vendor/three.module.js';

const MI = window.MI;
const WALL_H = 0.42, WALL_T = 0.08, DOOR = 0.38;

let renderer, scene, camera, ocam, root, holder, sun, flat = false;
const active = () => (flat ? ocam : camera);
let builtSig = '', ghostSig = '', ghostGroup = null;
const anims = [];
const cam = { target: new THREE.Vector3(0, 0, 0), dist: 17, yaw: 0, pitch: 0.95 };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let W = 16, H = 16;

const toWorld = (x, y) => new THREE.Vector3(x - W / 2 + 0.5, 0, y - H / 2 + 0.5);
const col = (c) => new THREE.Color(c);

function init(container) {
  holder = container;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.id = 'board3d';
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.insertBefore(renderer.domElement, container.firstChild);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400); ocam.up.set(0, 0, -1);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3a46, 1.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-10, 18, -7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // the moon is the cratered globe below (no extra textured disc)
  scene.add(buildGlobe());

  root = new THREE.Group(); scene.add(root);
  resize();
  addEventListener('resize', resize);
}

// The moon as a huge globe. The base sits deep in a big impact crater on top.
// A dense "cap" mesh carries the detailed terrain near the base; a coarser full sphere gives the silhouette.
const MOON_R = 140;
function buildGlobe() {
  const R = MOON_R;
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const craters = [];
  for (let i = 0; i < 700; i++) {
    // concentrate most craters on the upper part we actually see
    const u = i < 500 ? 0.55 + rnd() * 0.45 : rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const r = (0.004 + Math.pow(rnd(), 3) * 0.04);
    const d = new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
    if (Math.acos(u) * R < 22 + r * R * 1.4) continue; // keep the big crater area clean
    craters.push({ d, r, k: 0.4 + rnd() * 0.6, cmin: Math.cos(r * 1.35) });
  }
  const DEPTH = 3.2;            // how far the crater floor lies below the surrounding plain
  const FLOOR = 9.5, RIM = 13.5; // floor radius, rim crest radius
  const v = new THREE.Vector3(), n = new THREE.Vector3();

  function shape(geo, detailed) {
    const pos = geo.attributes.position, colors = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); n.copy(v).normalize();
      let h = 0, shade = 0;
      for (const c of craters) {
        const dt = n.dot(c.d); if (dt < c.cmin) continue; const ang = Math.acos(Math.min(1, dt)) / c.r;
        if (ang < 1.35) {
          const sz = c.r * R;
          if (ang < 1) { h -= (1 - ang * ang) * sz * 0.35 * c.k; shade -= 0.12 * c.k; }
          else { h += Math.sin((ang - 1) / 0.35 * Math.PI) * sz * 0.1 * c.k; shade += 0.06 * c.k; }
        }
      }
      h += Math.sin(n.x * 90 + n.z * 70) * Math.cos(n.y * 80 - n.x * 50) * 0.25;
      const mare = Math.max(0, Math.sin(n.x * 3.1 + 1.2) * Math.cos(n.z * 2.7 - 0.4) * Math.sin(n.y * 2.3 + 2)) * 0.3;
      v.copy(n).multiplyScalar(R + DEPTH + h);
      const hd = Math.hypot(v.x, v.z);
      if (n.y > 0 && hd < 40) {
        // y relative to plain level; plain sits DEPTH above the floor (floor = 0 in world)
        const curve = v.y - R - DEPTH;                        // natural drop of the sphere
        const plain = DEPTH + curve;
        const rimBump = 1.8 * Math.exp(-Math.pow((hd - RIM) / (hd < RIM ? 1.4 : 4.5), 2));
        const wall = THREE.MathUtils.smoothstep(hd, FLOOR, RIM);   // 0 on floor, 1 at crest
        let y = THREE.MathUtils.lerp(-0.02, plain, wall) + rimBump * wall;
        const back = THREE.MathUtils.smoothstep(hd, 28, 40);       // fade into the plain sphere
        y = THREE.MathUtils.lerp(y, plain, back);
        v.y = R + y + (hd > FLOOR ? h * Math.min(1, (hd - FLOOR) / 4) * (1 - back) : 0);
        if (hd < FLOOR) shade = -0.05;
        else if (hd < RIM) shade -= 0.14 * (1 - wall * 0.5);
        else if (hd < RIM + 4) shade += 0.1;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
      if (geo.attributes.uv) geo.attributes.uv.setXY(i, v.x / 7, v.z / 7);
      const g = THREE.MathUtils.clamp(0.36 + shade - mare * 0.6, 0.16, 0.8);
      colors.push(g, g * 0.98, g * 0.94);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
  }

  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: regolith(), roughness: 1 });
  // dense cap (top ~0.45 rad) and coarse full sphere just below it
  const cap = new THREE.SphereGeometry(R, 480, 180, 0, Math.PI * 2, 0, 0.45);
  shape(cap, true);
  const capMesh = new THREE.Mesh(cap, mat); capMesh.receiveShadow = true;
  const body = new THREE.SphereGeometry(R - 0.4, 160, 80, 0, Math.PI * 2, 0.42, Math.PI - 0.42);
  shape(body, false);
  const bodyMesh = new THREE.Mesh(body, mat);
  group.add(capMesh, bodyMesh);
  group.position.y = -R;
  return group;
}

// Fine tiling regolith detail (grain + tiny craters) so the globe stays sharp up close.
function regolith() {
  const N = 1024, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'), img = c.createImageData(N, N);
  let seed = 99; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N * N; i++) { const g = 215 + (rnd() - 0.5) * 50; img.data.set([g, g, g * 0.97, 255], i * 4); }
  c.putImageData(img, 0, 0);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * N, y = rnd() * N, r = 2 + Math.pow(rnd(), 2.5) * 60;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      const g = c.createRadialGradient(x + ox - r * 0.25, y + oy - r * 0.25, 0, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(0,0,0,0.13)'); g.addColorStop(0.75, 'rgba(0,0,0,0.06)');
      g.addColorStop(0.9, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x + ox, y + oy, r, 0, 7); c.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1); t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function resize() {
  if (!renderer) return;
  const w = holder.clientWidth, h = holder.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
function fitOrtho() {
  const w = holder.clientWidth, h = Math.max(1, holder.clientHeight), half = cam.dist * 0.42;
  ocam.left = -half * w / h; ocam.right = half * w / h; ocam.top = half; ocam.bottom = -half;
  ocam.updateProjectionMatrix();
}

function placeCamera() {
  const t = cam.target, d = cam.dist;
  camera.position.set(t.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * d, t.y + Math.sin(cam.pitch) * d, t.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * d);
  camera.lookAt(t);
  if (flat) { fitOrtho(); ocam.position.set(t.x, 120, t.z); ocam.lookAt(t.x, 0, t.z); }
}

// ---------- building meshes ----------
const matCache = new Map();
function mat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
// sci-fi wall panelling (greyscale, tinted per race by the material colour)
let wallTex = null;
function wallTexture() {
  if (wallTex) return wallTex;
  const W2 = 512, H2 = 256, cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H2); g.addColorStop(0, '#d8d8d8'); g.addColorStop(1, '#a8a8a8');
  c.fillStyle = g; c.fillRect(0, 0, W2, H2);
  const PW = W2 / 4;
  for (let i = 0; i < 4; i++) {
    const x = i * PW;
    // panel bevel
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 4, 20, PW - 8, 3);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, 0, 3, H2);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x + 3, 0, 2, H2);
    // inset panel
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.strokeRect(x + 14, 34, PW - 28, 120);
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x + 16, 36, PW - 32, 50);
    // rivets
    c.fillStyle = 'rgba(0,0,0,.45)';
    for (const [rx, ry] of [[10, 12], [PW - 10, 12], [10, 170], [PW - 10, 170]]) { c.beginPath(); c.arc(x + rx, ry, 2.5, 0, 7); c.fill(); }
    // vent grille on every other panel, a small display on the rest
    if (i % 2 === 0) { c.fillStyle = 'rgba(0,0,0,.4)'; for (let k = 0; k < 6; k++) c.fillRect(x + 28, 100 + k * 8, PW - 56, 3); }
    else { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x + 34, 96, PW - 68, 40); c.fillStyle = 'rgba(255,255,255,.35)'; for (let k = 0; k < 3; k++) c.fillRect(x + 40, 104 + k * 10, (PW - 80) * (0.4 + 0.2 * k), 3); }
  }
  // kick plate with hazard notch line
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, H2 - 60, W2, 60);
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, H2 - 62, W2, 3);
  c.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < W2; x += 24) c.fillRect(x, H2 - 40, 12, 18);
  wallTex = new THREE.CanvasTexture(cv); wallTex.colorSpace = THREE.SRGBColorSpace; wallTex.anisotropy = 8;
  return wallTex;
}

function wallMats(race) {
  const P = window.Art.pal(race);
  return mat('wall|' + race, () => {
    const side = new THREE.MeshStandardMaterial({ map: wallTexture(), color: col(P.wall).lerp(new THREE.Color(0xffffff), 0.45), roughness: 0.55, metalness: 0.15 });
    const top = new THREE.MeshStandardMaterial({ color: col(P.rim), roughness: 0.5, metalness: 0.2 });
    return [side, side, top, side, side, side];
  });
}
function ledMat(race) { const P = window.Art.pal(race); return mat('led|' + race, () => new THREE.MeshStandardMaterial({ color: col(P.led), emissive: col(P.led), emissiveIntensity: 2.2 })); }

function floorTexture(type, cols, rows, race) {
  const key = 'tex|' + type + '|' + race + '|' + cols + 'x' + rows;
  return mat(key, () => { const t = new THREE.CanvasTexture(window.Art.getFloor(type, cols, rows, race)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
}

function addBox(group, w, h, d, x, y, z, material, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
  group.add(m); return m;
}

// world-space cell walls; doors are gaps, closed doors where nothing connects
function buildWalls(group, cells, race, connected, opts) {
  const wm = opts.ghostMat ? [opts.ghostMat, opts.ghostMat, opts.ghostMat, opts.ghostMat, opts.ghostMat, opts.ghostMat] : wallMats(race);
  const led = opts.ghostMat || ledMat(race);
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const c of cells) {
    const cx = c.x - W / 2 + 0.5, cz = c.y - H / 2 + 0.5;
    for (let d = 0; d < 4; d++) {
      const e = c.e[d];
      if (e === 'x') continue;
      const horiz = d % 2 === 0; // wall runs along x
      const nx = DIRS[d][0], nz = DIRS[d][1];
      const ex = cx + nx * (0.5 - WALL_T / 2), ez = cz + nz * (0.5 - WALL_T / 2);
      const segs = e === 'w' ? [[-0.5, 0.5]] : [[-0.5, -DOOR / 2], [DOOR / 2, 0.5]];
      for (const [a0, a1] of (opts.onlyDoors ? [] : segs)) {
        const len = a1 - a0, mid = (a0 + a1) / 2;
        const px = horiz ? ex + mid : ex, pz = horiz ? ez : ez + mid;
        addBox(group, horiz ? len : WALL_T, WALL_H, horiz ? WALL_T : len, px, WALL_H / 2, pz, wm);
        // glowing strip at the inner foot of the wall
        const lx = px - nx * (WALL_T / 2 + 0.006), lz = pz - nz * (WALL_T / 2 + 0.006);
        addBox(group, horiz ? len * 0.9 : 0.012, 0.025, horiz ? 0.012 : len * 0.9, lx, 0.05, lz, led, false);
      }
      if (e !== 'w' && !connected(c, d)) {
        // puzzle shape: an exit is a rounded TAB sticking out of the wall, an entrance a NOTCH cut into the floor
        const outward = Math.atan2(nx, nz);              // yaw that points away from the room
        if (e === 'o') {
          const tm = opts.ghostMat || mat('tab|' + race, () => new THREE.MeshStandardMaterial({ color: col(window.Art.pal(race).rim), roughness: 0.5, metalness: 0.3 }));
          const tab = new THREE.Mesh(new THREE.CylinderGeometry(DOOR * 0.26, DOOR * 0.26, 0.05, 24, 1, false, -Math.PI / 2, Math.PI), tm);
          tab.position.set(cx + nx * 0.5, 0.025, cz + nz * 0.5); tab.rotation.y = outward; tab.castShadow = true; tab.receiveShadow = true;
          group.add(tab);
          const am = opts.ghostMat || mat('tabLed', () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.8 }));
          const rim = new THREE.Mesh(new THREE.TorusGeometry(DOOR * 0.42, 0.008, 6, 32, Math.PI), am);
          rim.position.set(cx + nx * 0.5, 0.072, cz + nz * 0.5); rim.rotation.set(-Math.PI / 2, 0, outward - Math.PI / 2);
        } else {
          const nm = opts.ghostMat || mat('notch', () => new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 1 }));
          const notch = new THREE.Mesh(new THREE.CircleGeometry(DOOR * 0.26, 24, 0, Math.PI), nm);
          notch.rotation.x = -Math.PI / 2; notch.rotation.z = outward + Math.PI / 2;
          notch.position.set(cx + nx * (0.5 - WALL_T), 0.02, cz + nz * (0.5 - WALL_T));
          group.add(notch);
          const cm = opts.ghostMat || mat('notchLed', () => new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.6 }));
          const ring = new THREE.Mesh(new THREE.TorusGeometry(DOOR * 0.42, 0.008, 6, 32, Math.PI), cm);
          ring.position.copy(notch.position); ring.position.y = 0.024; ring.rotation.set(-Math.PI / 2, 0, outward + Math.PI / 2);
        }
      }
      if (e !== 'w' && !connected(c, d) && !opts.ghostMat) {
        // closed sliding door with an amber light: nothing is connected here yet
        const dm = mat('door', () => new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.5, metalness: 0.5 }));
        addBox(group, horiz ? DOOR : WALL_T * 0.6, WALL_H * 0.92, horiz ? WALL_T * 0.6 : DOOR, ex, WALL_H * 0.46, ez, dm);
        const am = mat('amber', () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 2 }));
        addBox(group, horiz ? DOOR * 0.8 : 0.02, 0.03, horiz ? 0.02 : DOOR * 0.8, ex - nx * WALL_T * 0.35, WALL_H * 0.8, ez - nz * WALL_T * 0.35, am, false);
      }
    }
  }
}

function buildSolar(group, p, race) {
  const cells = MI.absCells(p.type, p.x, p.y, p.rot), c = cells[0];
  const cx = c.x - W / 2 + 0.5, cz = c.y - H / 2 + 0.5;
  const P = window.Art.pal(race);
  const poleMat = mat('pole', () => new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.4 }));
  // round race-coloured pad so you can tell the owner at a glance
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.025, 40), mat('solarPad|' + race, () => new THREE.MeshStandardMaterial({ color: col(P.wall), roughness: 0.7, metalness: 0.3 })));
  pad.position.set(cx, 0.012, cz); pad.receiveShadow = true; group.add(pad);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.012, 6, 48), ledMat(race)); edge.rotation.x = Math.PI / 2; edge.position.set(cx, 0.026, cz); group.add(edge);
  const spots = [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.2], [0.2, 0.2]];
  if (race === 'lustroms') {
    // pearly flower collectors on curved stems, glowing teal
    const petal = mat('lusPetal', () => new THREE.MeshStandardMaterial({ color: 0xbff3ea, metalness: 0.3, roughness: 0.15, emissive: 0x14b8a6, emissiveIntensity: 0.35 }));
    const stem = mat('lusStem', () => new THREE.MeshStandardMaterial({ color: 0xe0f2f1, roughness: 0.4 }));
    for (const [fx, fz] of spots) {
      addBox(group, 0.03, 0.24, 0.03, cx + fx, 0.12, cz + fz, stem);
      const fl = new THREE.Group(); fl.position.set(cx + fx, 0.26, cz + fz); fl.rotation.x = -0.45;
      for (let k = 0; k < 6; k++) { const pe = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), petal); pe.material.side = THREE.DoubleSide; pe.rotation.x = -Math.PI / 2; pe.position.set(Math.cos(k) * 0.07, 0, Math.sin(k) * 0.07); fl.add(pe); }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), ledMat(race)); fl.add(core); group.add(fl);
    }
  } else if (race === 'machines') {
    // heavy industrial array: one big black panel on a girder, orange frame
    const black = mat('macPanel', () => new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.7, roughness: 0.25 }));
    const orange = mat('macFrame', () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.5, roughness: 0.4 }));
    addBox(group, 0.08, 0.26, 0.08, cx, 0.13, cz, poleMat);
    const g = new THREE.Group(); g.position.set(cx, 0.3, cz); g.rotation.x = -0.5;
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.62), [orange, orange, black, orange, orange, orange]); pnl.castShadow = true; g.add(pnl);
    for (let i = 1; i < 4; i++) { const ln = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.032, 0.6), orange); ln.position.x = -0.4 + i * 0.2; g.add(ln); }
    group.add(g);
  } else if (race === 'bozob') {
    // slimy crystals that soak up the sun
    const crystal = mat('bozCrystal', () => new THREE.MeshStandardMaterial({ color: 0xb4ff39, emissive: 0x65a30d, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }));
    const stalk = mat('bozStalk', () => new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.8 }));
    for (const [fx, fz] of spots) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.2, 8), stalk); s.position.set(cx + fx, 0.1, cz + fz); s.castShadow = true; group.add(s);
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), crystal); cr.position.set(cx + fx, 0.28, cz + fz); cr.scale.y = 1.6; cr.castShadow = true; group.add(cr);
    }
  } else {
    // humans / shared: classic blue panels on poles with white frames
    const panelMat = mat('panel', () => new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.25, metalness: 0.6, emissive: 0x0b1a44, emissiveIntensity: 0.4 }));
    const frameMat = mat('pframe', () => new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.5, roughness: 0.4 }));
    for (const [fx, fz] of spots) {
      addBox(group, 0.04, 0.22, 0.04, cx + fx, 0.11, cz + fz, poleMat);
      const g = new THREE.Group(); g.position.set(cx + fx, 0.24, cz + fz); g.rotation.x = -0.55;
      const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.24), [frameMat, frameMat, panelMat, frameMat, frameMat, frameMat]);
      pnl.castShadow = true; pnl.receiveShadow = true; g.add(pnl); group.add(g);
    }
  }
  // dock towards the exit side
  const oi = c.e.indexOf('o');
  if (oi >= 0) { const [nx, nz] = MI.DIRS[oi]; buildDock(group, cx + nx * 0.5, cz + nz * 0.5, nx, nz, 'o', {}, false); }
}


// ---------- furniture: the same items as the 2D art, built as real 3D objects ----------
const propMats = new Map();
function pm(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!propMats.has(key)) propMats.set(key, new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.6, metalness: 0.1, ...opts }));
  return propMats.get(key);
}
function glowMat(color) { return pm(color, { emissive: col(color), emissiveIntensity: 1.6 }); }
function shadeHex(hex, f) { const c = col(hex); return f < 0 ? c.lerp(new THREE.Color(0), -f) : c.lerp(new THREE.Color(0xffffff), f); }
function box(g, w, h, d, x, y, z, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = h > 0.12; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
function cyl(g, rt, rb, h, x, y, z, m, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh;
}
function ball(g, r, x, y, z, m, sy = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
  mesh.position.set(x, y, z); mesh.scale.y = sy; mesh.castShadow = true; g.add(mesh); return mesh;
}

const PROP = {
  bed(g, p, led) {
    const [frame = '#6b5aa6', sheet = '#f1f1ee'] = p.cols, w = p.w, d = p.h;
    box(g, w, 0.07, d, 0, 0.035, 0, pm(shadeHex(frame, -0.2).getStyle()));
    box(g, w * 0.94, 0.05, d * 0.94, 0, 0.09, 0, pm(frame));
    box(g, w * 0.92, 0.03, d * 0.66, 0, 0.125, d * 0.14, pm(sheet, { roughness: 0.9 }));
    box(g, w * 0.34, 0.035, d * 0.16, -w * 0.21, 0.13, -d * 0.33, pm('#fafaf7', { roughness: 0.9 }));
    box(g, w * 0.34, 0.035, d * 0.16, w * 0.21, 0.13, -d * 0.33, pm('#fafaf7', { roughness: 0.9 }));
    box(g, w * 1.02, 0.012, d * 1.02, 0, 0.006, 0, glowMat(led));
  },
  sofa(g, p) {
    const [frame = '#8b8f94', cush = '#3f8f7c'] = p.cols, w = p.w, d = p.h;
    box(g, w, 0.07, d, 0, 0.035, 0, pm(shadeHex(frame, -0.15).getStyle()));
    box(g, w, 0.14, d * 0.22, 0, 0.07, -d * 0.39, pm(frame));          // back rest
    box(g, w * 0.12, 0.1, d, -w * 0.44, 0.05, 0, pm(frame));           // arm rests
    box(g, w * 0.12, 0.1, d, w * 0.44, 0.05, 0, pm(frame));
    box(g, w * 0.36, 0.04, d * 0.6, -w * 0.19, 0.09, d * 0.08, pm(frame));
    box(g, w * 0.36, 0.04, d * 0.6, w * 0.19, 0.09, d * 0.08, pm(frame));
    const c = box(g, d * 0.32, 0.05, d * 0.32, -w * 0.23, 0.13, 0, pm(cush)); c.rotation.y = 0.3;
  },
  table(g, p, led) {
    const [, chairs = '#3d6b5e'] = p.cols, w = p.w, d = p.h;
    box(g, w, 0.025, d, 0, 0.16, 0, pm('#e2e8f0', { metalness: 0.3, roughness: 0.3 }));
    box(g, w * 0.9, 0.006, d * 0.9, 0, 0.175, 0, glowMat(led));
    cyl(g, 0.02, 0.03, 0.15, 0, 0.075, 0, pm('#94a3b8', { metalness: 0.6 }));
    const cw = Math.min(0.1, d * 0.4);
    for (const fx of [-0.22, 0.22]) for (const sz of [-1, 1]) {
      box(g, cw, 0.08, cw, w * fx, 0.04, sz * (d / 2 + cw * 0.5), pm(chairs));
      box(g, cw, 0.08, cw * 0.2, w * fx, 0.12, sz * (d / 2 + cw * 0.95), pm(chairs));
    }
  },
  roundTable(g, p) {
    const [top = '#e8dcc8', chair = '#b0413e'] = p.cols, r = p.r;
    cyl(g, r, r, 0.025, 0, 0.15, 0, pm(top), 28);
    cyl(g, 0.02, 0.04, 0.15, 0, 0.075, 0, pm('#6b7280', { metalness: 0.6 }));
    for (let i = 0; i < p.n; i++) {
      const a = i / p.n * Math.PI * 2 + 0.4;
      cyl(g, r * 0.38, r * 0.38, 0.08, Math.cos(a) * r * 1.35, 0.04, Math.sin(a) * r * 1.35, pm(chair));
    }
  },
  desk(g, p) {
    const w = p.w, d = p.h;
    box(g, w, 0.02, d, 0, 0.17, 0, pm('#d7dbe0', { metalness: 0.3 }));
    box(g, 0.02, 0.17, d * 0.9, -w * 0.45, 0.085, 0, pm('#9ca3af'));
    box(g, 0.02, 0.17, d * 0.9, w * 0.45, 0.085, 0, pm('#9ca3af'));
    const scr = box(g, w * 0.4, 0.12, 0.012, 0, 0.25, -d * 0.3, pm('#1f2937'));
    box(g, w * 0.36, 0.1, 0.004, 0, 0.25, -d * 0.3 + 0.008, glowMat('#38bdf8'));
    box(g, w * 0.3, 0.07, 0.06, 0, 0.035, d / 2 + 0.05, pm('#4b5563'));       // chair
    return scr;
  },
  counter(g, p) {
    const [top = '#8a8580'] = p.cols;
    box(g, p.w, 0.2, p.h, 0, 0.1, 0, pm(shadeHex(top, -0.25).getStyle()));
    box(g, p.w * 1.02, 0.02, p.h * 1.04, 0, 0.21, 0, pm(top, { roughness: 0.3 }));
  },
  machine(g, p) {
    const [c = '#6b7280'] = p.cols, w = p.w, d = p.h;
    box(g, w, 0.28, d, 0, 0.14, 0, pm(c, { metalness: 0.5, roughness: 0.4 }));
    for (let i = 0; i < 4; i++) box(g, w * 0.5, 0.012, 0.005, -w * 0.1, 0.06 + i * 0.05, d / 2 + 0.003, pm('#111827'));
    ball(g, 0.018, w * 0.32, 0.22, d / 2, glowMat('#ef4444'));
    ball(g, 0.018, w * 0.32, 0.17, d / 2, glowMat('#22c55e'));
    box(g, w * 0.8, 0.03, d * 0.8, 0, 0.295, 0, pm(shadeHex(c, 0.15).getStyle(), { metalness: 0.5 }));
  },
  screen(g, p) {
    const w = Math.max(p.w, p.h), d = Math.min(p.w, p.h), alongX = p.w >= p.h;
    const s = new THREE.Group(); if (!alongX) s.rotation.y = Math.PI / 2; g.add(s);
    box(s, w, 0.22, 0.03, 0, 0.17, 0, pm('#0f172a'));
    box(s, w * 0.92, 0.18, 0.004, 0, 0.17, 0.017, glowMat('#6366f1'));
    box(s, 0.03, 0.06, 0.03, 0, 0.03, 0, pm('#334155'));
    void d;
  },
  sink(g, p) {
    box(g, p.w, 0.16, p.h * 0.8, 0, 0.08, -p.h * 0.1, pm('#e6e2dc'));
    box(g, p.w * 0.76, 0.01, p.h * 0.56, 0, 0.165, -p.h * 0.1, pm('#b9b3aa'));
  },
  stove(g, p) {
    box(g, p.w, 0.2, p.h, 0, 0.1, 0, pm('#1f1f1f', { metalness: 0.4 }));
    for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) cyl(g, p.w * 0.13, p.w * 0.13, 0.005, p.w * a, 0.203, p.h * b, glowMat('#f97316'));
  },
  toilet(g, p) {
    box(g, p.w, 0.16, p.h * 0.35, 0, 0.08, -p.h * 0.32, pm('#f4f4f2'));
    cyl(g, p.w * 0.4, p.w * 0.3, 0.1, 0, 0.05, p.h * 0.2, pm('#f4f4f2'));
  },
  crate(g, p) {
    const [c = '#a0703c'] = p.cols, s = p.w;
    box(g, s, s * 0.85, s, 0, s * 0.425, 0, pm(c, { roughness: 0.85 }));
    box(g, s * 1.02, s * 0.1, s * 1.02, 0, s * 0.8, 0, pm(shadeHex(c, -0.35).getStyle()));
    box(g, s * 1.02, s * 0.1, s * 1.02, 0, s * 0.08, 0, pm(shadeHex(c, -0.35).getStyle()));
  },
  barrel(g, p) {
    const [c = '#2f5f8a'] = p.cols, r = p.r;
    cyl(g, r, r, r * 2.4, 0, r * 1.2, 0, pm(c, { metalness: 0.4, roughness: 0.4 }));
    cyl(g, r * 1.03, r * 1.03, r * 0.15, 0, r * 0.6, 0, pm(shadeHex(c, -0.4).getStyle()));
    cyl(g, r * 1.03, r * 1.03, r * 0.15, 0, r * 1.8, 0, pm(shadeHex(c, -0.4).getStyle()));
  },
  plant(g, p, led) {
    const [leaf = '#2f8f46'] = p.cols, r = p.r;
    cyl(g, r * 0.5, r * 0.4, r * 0.7, 0, r * 0.35, 0, pm('#e5e7eb'));
    cyl(g, r * 0.52, r * 0.52, r * 0.06, 0, r * 0.68, 0, glowMat(led));
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + i * 0.37;
      const l = ball(g, r * 0.5, Math.cos(a) * r * 0.45, r * 0.85, Math.sin(a) * r * 0.45, pm(shadeHex(leaf, ((i * 7) % 5 - 2) * 0.08).getStyle(), { roughness: 0.8 }), 0.35);
      l.rotation.y = -a; l.scale.x = 1.6;
    }
  },
  tree(g, p) {
    const [leaf = '#2e8b57'] = p.cols, r = p.r;
    cyl(g, r * 0.12, r * 0.16, r * 1.2, 0, r * 0.6, 0, pm('#6b4423', { roughness: 0.9 }));
    for (let i = 0; i < 6; i++) {
      const a = i * 1.7;
      ball(g, r * (0.45 + (i % 3) * 0.12), Math.cos(a) * r * 0.35, r * (1.2 + (i % 2) * 0.25), Math.sin(a) * r * 0.35, pm(shadeHex(leaf, ((i * 5) % 4 - 1.5) * 0.1).getStyle(), { roughness: 0.85 }));
    }
  },
};

// items are in cell units from the floor's top-left; the floor group is centred and already rotated with the piece
function buildProps(fg, items, race, w0, h0) {
  const led = window.Art.pal(race).led;
  for (const p of items) {
    const f = PROP[p.k]; if (!f) continue;
    const g = new THREE.Group();
    g.position.set(p.x - w0 / 2, 0.014, p.y - h0 / 2);
    g.rotation.y = -p.ang;
    try { f(g, p, led); } catch (e) { console.warn('prop', p.k, e); continue; }
    fg.add(g);
  }
}


// ---------- performance: bake all static meshes of a piece into one mesh per material ----------
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(); // material -> { pos:[], nor:[], uv:[], shadow }
  const victims = [];
  const nm = new THREE.Matrix3(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.live) return;
    const geo = o.geometry, idx = geo.index, P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    if (!N) return;
    m.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(m);
    const ranges = Array.isArray(o.material)
      ? geo.groups.map((g) => ({ start: g.start, count: g.count, mat: o.material[g.materialIndex] }))
      : [{ start: 0, count: idx ? idx.count : P.count, mat: o.material }];
    for (const r of ranges) {
      if (!r.mat) continue;
      const key = r.mat.uuid + (o.castShadow ? 's' : '');
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: r.mat, pos: [], nor: [], uv: [], shadow: o.castShadow }));
      for (let i = r.start; i < r.start + r.count; i++) {
        const k = idx ? idx.getX(i) : i;
        v.fromBufferAttribute(P, k).applyMatrix4(m); b.pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize(); b.nor.push(v.x, v.y, v.z);
        if (U) b.uv.push(U.getX(k), U.getY(k)); else b.uv.push(0, 0);
      }
    }
    victims.push(o);
  });
  if (victims.length < 2) return;
  for (const o of victims) { o.parent.remove(o); o.geometry.dispose(); }
  for (const b of buckets.values()) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const mesh = new THREE.Mesh(g, b.mat);
    mesh.castShadow = b.shadow; mesh.receiveShadow = true;
    group.add(mesh);
  }
}


// ---------- hallways as real corridors: a + shape with arms only towards the doorways ----------
const CORR = 0.23; // half corridor width
function corridorPoly(open) {
  const a = CORR, h = 0.5, pts = [[-a, -a]];
  if (open[0]) pts.push([-a, -h], [a, -h]); pts.push([a, -a]);
  if (open[1]) pts.push([h, -a], [h, a]); pts.push([a, a]);
  if (open[2]) pts.push([a, h], [-a, h]); pts.push([-a, a]);
  if (open[3]) pts.push([-h, a], [-h, -a]);
  return pts;
}
function inPoly(pts, x, z) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
// builds floor + walls in the piece's local (unrotated) frame inside fg
function buildCorridor(fg, localEdges, race, floorMat, opts, matedLocal) {
  const open = localEdges.map((e) => e === 'i' || e === 'o');
  const pts = corridorPoly(open);
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) + 0.5);
  const floor = new THREE.Mesh(geo, floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  fg.add(floor);
  buildTubes(fg, localEdges, opts, matedLocal);
  if (!opts.withWalls) return;
  const wm = opts.ghostMat ? Array(6).fill(opts.ghostMat) : wallMats(race);
  const led = opts.ghostMat || ledMat(race);
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    // open arm ends on the cell border are the doorways
    if ((Math.abs(x1) === 0.5 && x1 === x2) || (Math.abs(z1) === 0.5 && z1 === z2)) continue;
    const len = Math.hypot(x2 - x1, z2 - z1), mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    const alongX = Math.abs(z2 - z1) < 1e-6;
    let nx = alongX ? 0 : 1, nz = alongX ? 1 : 0;
    if (inPoly(pts, mx + nx * 0.01, mz + nz * 0.01)) { nx = -nx; nz = -nz; } // point outward
    const px = mx + nx * WALL_T / 2, pz = mz + nz * WALL_T / 2;
    const L = len + WALL_T; // overlap at the corners
    const wall = new THREE.Mesh(new THREE.BoxGeometry(alongX ? L : WALL_T, WALL_H, alongX ? WALL_T : L), wm);
    wall.position.set(px, WALL_H / 2, pz); wall.castShadow = true; wall.receiveShadow = true; fg.add(wall);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len * 0.9 : 0.012, 0.025, alongX ? 0.012 : len * 0.9), led);
    strip.position.set(mx - nx * 0.006, 0.05, mz - nz * 0.006); fg.add(strip);
  }
}


// ---------- colony look: glass domes for rooms, glass tubes for hallways, airlocks for doors ----------
function glassMat() { return mat('glass', () => new THREE.MeshStandardMaterial({ color: 0xd6ecff, transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide })); }
function frameLineMat() { return mat('frameLine', () => new THREE.LineBasicMaterial({ color: 0xe6edf5, transparent: true, opacity: 0.6 })); }
function metalMat() { return mat('ribMetal', () => new THREE.MeshStandardMaterial({ color: 0xc3c8cf, metalness: 0.75, roughness: 0.35 })); }
function ringMat(kind) {
  return kind === 'o'
    ? mat('ringOut', () => new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.8 }))
    : mat('ringIn', () => new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.8 }));
}
let geoLines = null;
function geodesicLines() {
  if (geoLines) return geoLines;
  const e = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 3), 1);
  const p = e.attributes.position, keep = [];
  for (let i = 0; i < p.count; i += 2) {
    if (p.getY(i) >= -0.001 && p.getY(i + 1) >= -0.001 && p.getY(i) <= Math.cos(OPEN) + 0.001 && p.getY(i + 1) <= Math.cos(OPEN) + 0.001) keep.push(p.getX(i), p.getY(i), p.getZ(i), p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
  }
  geoLines = new THREE.BufferGeometry(); geoLines.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  return geoLines;
}
const hemiGeo = new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2);
// open dome: only the lower band, top cut away so you look straight into the room
const OPEN = 0.95, openGeo = new THREE.SphereGeometry(1, 40, 10, 0, Math.PI * 2, OPEN, Math.PI / 2 - OPEN);

// a geodesic glass dome over the piece, standing on a metal base ring
function buildDome(group, cx, cz, rx, rz, opts) {
  const ry = Math.min(rx, rz) * 0.95;
  const glass = new THREE.Mesh(openGeo, opts.ghostMat || glassMat());
  glass.position.set(cx, 0.01, cz); glass.scale.set(rx, ry, rz); glass.renderOrder = 3; glass.userData.live = true;
  group.add(glass);
  if (!opts.ghostMat) {
    const lines = new THREE.LineSegments(geodesicLines(), frameLineMat());
    lines.position.copy(glass.position); lines.scale.copy(glass.scale); group.add(lines);
  }
  // metal rim along the open edge
  const top = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025 / Math.min(rx, rz), 8, 64), opts.ghostMat || metalMat());
  top.rotation.x = Math.PI / 2; top.position.set(cx, 0.01 + ry * Math.cos(OPEN), cz); top.scale.set(rx * Math.sin(OPEN), rz * Math.sin(OPEN), 1); top.castShadow = true;
  group.add(top);
  const base = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035 / Math.min(rx, rz), 8, 64), opts.ghostMat || metalMat());
  base.rotation.x = Math.PI / 2; base.position.set(cx, 0.02, cz); base.scale.set(rx, rz, 1); base.castShadow = true;
  group.add(base);
}

// airlock tube on a doorway: exits stick out with an amber ring, entrances sit inward with a cyan ring
function buildAirlock(group, x, z, nx, nz, kind, opts) {
  const R = 0.11, L = 0.2, off = kind === 'o' ? 0.07 : -0.05;
  const g = new THREE.Group(); g.position.set(x + nx * off, R * 0.95, z + nz * off);
  g.rotation.y = Math.atan2(nx, nz);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 24, 1, true), opts.ghostMat || metalMat());
  tube.rotation.x = Math.PI / 2; tube.castShadow = true; g.add(tube);
  const win = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, L * 0.4, 24, 1, true, -0.6, 1.2), opts.ghostMat || mat('lockWin', () => new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.2 })));
  win.rotation.x = Math.PI / 2; g.add(win);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, 0.016, 8, 32), ringMat(kind));
  ring.position.z = L / 2 * (kind === 'o' ? 1 : -1) + (kind === 'o' ? 0 : L); g.add(ring);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(R * 1.1, 0.02, 8, 32), opts.ghostMat || metalMat());
  collar.position.z = -L / 2; g.add(collar);
  if (kind === 'i') { // dark open hatch you can walk into
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 24), opts.ghostMat || mat('hatch', () => new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1, side: THREE.DoubleSide })));
    hatch.position.z = L / 2 + 0.001; g.add(hatch);
  }
  group.add(g);
}

// hallway arms as half-round glass tubes with metal ribs, plus a small hub dome in the middle (local frame)

// open-top tube pieces: only the two lower sides of a half-round tube, so you can look inside
const SIDE = Math.PI * 0.3;
function openTubeMesh(R, len, m) {
  const g = new THREE.Group();
  for (const t0 of [-Math.PI / 2, Math.PI / 2 - SIDE]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 10, 1, true, t0, SIDE), m));
  return g;
}
function openArcMesh(R, tube, m) {
  const g = new THREE.Group();
  for (const rz of [0, Math.PI - SIDE]) { const a = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 6, 10, SIDE), m); a.rotation.z = rz; g.add(a); }
  return g;
}
function buildTubes(fg, localEdges, opts, matedLocal = () => false) {
  const R = CORR;
  const D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let d = 0; d < 4; d++) {
    if (!(localEdges[d] === 'i' || localEdges[d] === 'o')) continue;
    const [dx, dz] = D[d], len = 0.5;
    const arm = new THREE.Group(); arm.position.set(dx * len / 2, 0.01, dz * len / 2); arm.rotation.y = Math.atan2(dx, dz);
    const tube = openTubeMesh(R, len, opts.ghostMat || glassMat());
    tube.rotation.x = -Math.PI / 2; tube.renderOrder = 3; tube.userData.live = true; arm.add(tube);
    for (let k = 0; k < 3; k++) {
      const rib = openArcMesh(R, 0.012, opts.ghostMat || metalMat());
      rib.position.z = -len / 2 + 0.06 + k * (len - 0.12) / 2; rib.castShadow = true; arm.add(rib);
    }
    // ring at the open end tells exit (amber) from entrance (cyan)
    fg.add(arm);
    buildDock(fg, dx * 0.5, dz * 0.5, dx, dz, localEdges[d], opts, matedLocal(d));
  }
  const hub = new THREE.Mesh(openGeo, opts.ghostMat || glassMat());
  hub.scale.set(R * 1.25, R * 1.15, R * 1.25); hub.position.y = 0.01; hub.renderOrder = 3; hub.userData.live = true; fg.add(hub);
  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(R * 1.25, 0.018, 8, 32), opts.ghostMat || metalMat());
  hubRing.rotation.x = Math.PI / 2; hubRing.position.y = 0.02; fg.add(hubRing);
  const hubTop = new THREE.Mesh(new THREE.TorusGeometry(R * 1.25 * Math.sin(OPEN), 0.014, 8, 32), opts.ghostMat || metalMat());
  hubTop.rotation.x = Math.PI / 2; hubTop.position.y = 0.01 + R * 1.15 * Math.cos(OPEN); fg.add(hubTop);
}

// rooms/facilities: dome + airlocks on every doorway (world frame)
function buildColonyRoom(group, cells, opts, isPad, connected = () => false) {
  const minX = Math.min(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y));
  const bw = Math.max(...cells.map((c) => c.x)) - minX + 1, bh = Math.max(...cells.map((c) => c.y)) - minY + 1;
  const cx = minX + bw / 2 - W / 2, cz = minY + bh / 2 - H / 2;
  if (!isPad) buildDome(group, cx, cz, bw * 0.52, bh * 0.52, opts);
  for (const c of cells) {
    const x = c.x - W / 2 + 0.5, z = c.y - H / 2 + 0.5;
    for (let d = 0; d < 4; d++) {
      const e = c.e[d]; if (e !== 'i' && e !== 'o') continue;
      const [nx, nz] = MI.DIRS[d];
      buildDock(group, x + nx * 0.5, z + nz * 0.5, nx, nz, e, opts, connected(c, d));
    }
  }
}

// dock connector on a doorway: exits are a PLUG sticking out, entrances a SOCKET the plug slots into
function buildDock(parent, x, z, nx, nz, kind, opts, mated = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(nx, nz);
  if (mated) {
    // connected: an open walk-through passage (built once, from the exit side)
    if (kind !== 'o') return;
    const M0 = metalMat(), R = 0.2, L = 0.3;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, L), mat('deck', () => new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.6, roughness: 0.5 })));
    deck.position.y = 0.02; deck.receiveShadow = true; g.add(deck);
    for (const sx of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, L), mat('deckLight', () => new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x7dd3fc, emissiveIntensity: 1.2 }))); rail.position.set(sx * 0.15, 0.03, 0); g.add(rail); }
    const tube = openTubeMesh(R, L, glassMat());
    tube.rotation.x = -Math.PI / 2; tube.position.y = 0.01; tube.renderOrder = 3; tube.userData.live = true; g.add(tube);
    for (const zz of [-L / 2, L / 2]) { const arch = openArcMesh(R, 0.018, M0); arch.position.set(0, 0.01, zz); arch.castShadow = true; g.add(arch); }
    parent.add(g); return;
  }
  const M = opts.ghostMat || metalMat();
  const dark = opts.ghostMat || mat('sockDark', () => new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1 }));
  const hull = opts.ghostMat || mat('portHull', () => new THREE.MeshStandardMaterial({ color: 0xe7e9ec, metalness: 0.35, roughness: 0.45 }));
  const lamp = opts.ghostMat || mat('portLamp', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xbff7ff, emissiveIntensity: 2 }));
  const Y = 0.13;
  const tubeZ = (r1, r2, len, z, m, seg = 28) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg, 1, false), m); t.rotation.x = Math.PI / 2; t.position.set(0, Y, z); t.castShadow = true; g.add(t); return t; };
  // base flange where the port meets the building
  const flange = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.04), M); flange.position.set(0, Y, -0.02); flange.castShadow = true; g.add(flange);
  if (kind === 'o') {
    // DOCKING PORT (exit): sticks out like a spacecraft docking adapter
    tubeZ(0.1, 0.1, 0.16, 0.08, hull);                       // white pressurised body
    for (const z of [0.02, 0.12]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.008, 6, 28), M); band.position.set(0, Y, z); g.add(band); }
    tubeZ(0.125, 0.125, 0.035, 0.175, M);                     // docking ring
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.095, 28), M); hatch.position.set(0, Y, 0.193); g.add(hatch);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.005, 6, 24), dark); seam.position.set(0, Y, 0.195); g.add(seam);
    for (let k = 0; k < 3; k++) {                             // alignment petals
      const a2 = k / 3 * Math.PI * 2 + Math.PI / 2;
      const petal = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.07), M);
      petal.position.set(Math.cos(a2) * 0.115, Y + Math.sin(a2) * 0.115, 0.225); petal.rotation.z = a2; petal.rotation.x = 0.35 * (Math.sin(a2) >= 0 ? -1 : 1) * 0; g.add(petal);
    }
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), lamp); l.position.set(0.11, Y + 0.08, 0.16); g.add(l);
  } else {
    // DOCKING HATCH (entrance): a receiving funnel the ports slide into
    tubeZ(0.13, 0.13, 0.05, 0.015, M);                       // outer docking ring
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.085, 0.06, 28, 1, true), opts.ghostMat || mat('funnel', () => new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide })));
    funnel.rotation.x = -Math.PI / 2; funnel.position.set(0, Y, 0.0); g.add(funnel);
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.086, 28), dark); hatch.position.set(0, Y, -0.028); g.add(hatch);
    for (let k = 0; k < 3; k++) {                             // guide slots for the petals
      const a2 = k / 3 * Math.PI * 2 + Math.PI / 2;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.01), dark);
      slot.position.set(Math.cos(a2) * 0.118, Y + Math.sin(a2) * 0.118, 0.042); slot.rotation.z = a2; g.add(slot);
    }
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), lamp); l.position.set(sx * 0.13, Y + 0.1, 0.0); g.add(l); }
  }
  parent.add(g);
}


// ---------- signature 3D objects per room type (on top of the recorded furniture) ----------
const spinQueue = []; // [object, speedX, speedY, speedZ, bob]
function live(o) { o.traverse((c) => { c.userData.live = true; }); return o; }
function spin(o, sy = 1, sx = 0, sz = 0, bob = 0) { live(o); spinQueue.push([o, sx, sy, sz, bob, o.position.y]); return o; }
const T3 = {
  landing(g) { // a landed shuttle on the H pad
    const s = new THREE.Group(); s.position.set(0, 0, 0); s.rotation.y = 0.6;
    const hull = pm('#e5e7eb', { metalness: 0.5, roughness: 0.35 }), dark = pm('#334155', { metalness: 0.6 }), glass = pm('#38bdf8', { metalness: 0.2, roughness: 0.1, emissive: col('#0ea5e9'), emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 8, 20), hull); body.rotation.z = Math.PI / 2; body.position.y = 0.3; body.castShadow = true; s.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 20), hull); nose.rotation.z = -Math.PI / 2; nose.position.set(0.58, 0.3, 0); s.add(nose);
    const cock = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass); cock.position.set(0.32, 0.4, 0); cock.scale.set(1.5, 0.8, 0.9); s.add(cock);
    for (const sz of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.42), hull); wing.position.set(-0.1, 0.24, sz * 0.32); wing.rotation.y = sz * 0.35; wing.castShadow = true; s.add(wing);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.02), pm('#f59e0b')); tip.position.set(-0.22, 0.3, sz * 0.52); s.add(tip);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.22, 8), dark); leg.position.set(0, 0.11, sz * 0.14); s.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 12), dark); foot.position.set(0, 0.01, sz * 0.14); s.add(foot);
    }
    const legF = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.22, 8), dark); legF.position.set(0.4, 0.11, 0); s.add(legF);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.025), hull); fin.position.set(-0.4, 0.5, 0); fin.castShadow = true; s.add(fin);
    for (const sz of [-0.08, 0.08]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 16), dark); eng.rotation.z = Math.PI / 2; eng.position.set(-0.5, 0.28, sz); s.add(eng);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), glowMat('#60a5fa')); glow.rotation.y = -Math.PI / 2; glow.position.set(-0.575, 0.28, sz); s.add(glow);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.335), pm('#22c55e')); stripe.position.set(0.05, 0.3, 0); s.add(stripe);
    g.add(s);
  },
  antimatter(g) { for (const x of [-0.5, 0.5]) { const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), glowMat('#f0abfc')); core.position.set(x, 0.22, 0); g.add(core); for (let k = 0; k < 2; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 8, 40), glowMat('#ec4899')); r.position.set(x, 0.22, 0); r.rotation.set(k * 1.2, k, 0); g.add(r); spin(r, 1.4 + k, 0.8, 0); } cyl(g, 0.12, 0.15, 0.08, x, 0.04, 0, pm('#475569', { metalness: 0.6 })); } },
  small_storage(g) { for (const [x, z] of [[-0.6, -0.15], [-0.35, 0.15], [0.35, -0.15], [0.6, 0.15]]) { box(g, 0.2, 0.16, 0.2, x, 0.08, z, pm('#9a7b4f', { roughness: 0.85 })); box(g, 0.2, 0.12, 0.2, x, 0.22, z, pm('#64748b')); } },
  star_meal(g) { const p = cyl(g, 0.05, 0.05, 0.25, 0, 0.3, 0, pm('#94a3b8', { metalness: 0.6 })); void p; const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), glowMat('#facc15')); st.position.set(0, 0.5, 0); g.add(st); spin(st, 1.5); },
  sunny_bar(g) { box(g, 0.5, 0.18, 0.12, 0, 0.09, -0.22, pm('#7c2d12')); for (let i = 0; i < 5; i++) cyl(g, 0.018, 0.018, 0.08, -0.2 + i * 0.1, 0.22, -0.24, glowMat(['#f59e0b', '#22d3ee', '#a3e635', '#f472b6', '#fde047'][i])); const sun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), glowMat('#fbbf24')); sun.position.set(0, 0.45, 0); g.add(sun); spin(sun, 0, 0, 0, 0.03); },
  galaxy_zoo(g) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 24), pm('#a5f3fc', { transparent: true, opacity: 0.35 })); tank.position.y = 0.16; g.add(live(tank)); const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), glowMat('#a3e635')); c.position.y = 0.16; g.add(c); spin(c, 2, 0, 0, 0.05); },
  mim(g) { box(g, 0.24, 0.3, 0.12, 0, 0.15, 0, pm('#1e293b')); box(g, 0.2, 0.14, 0.01, 0, 0.2, 0.065, glowMat('#22d3ee')); },
  cake(g) { cyl(g, 0.16, 0.16, 0.08, 0, 0.06, 0, pm('#f9a8d4')); cyl(g, 0.11, 0.11, 0.07, 0, 0.13, 0, pm('#fde68a')); const ch = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), glowMat('#ef4444')); ch.position.y = 0.19; g.add(ch); },
  diet(g) { for (let i = 0; i < 3; i++) cyl(g, 0.05, 0.05, 0.22, -0.15 + i * 0.15, 0.11, 0, pm('#bef264', { transparent: true, opacity: 0.8 })); },
  aura(g) { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), glowMat('#d946ef')); o.position.y = 0.3; g.add(o); spin(o, 1, 0.6, 0, 0.04); },
  dorex(g) { for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.08 + k * 0.05, 0.01, 6, 32), glowMat('#b4ff39')); r.rotation.x = Math.PI / 2; r.position.y = 0.12 + k * 0.08; g.add(r); spin(r, k % 2 ? -1.2 : 1.2); } },
  jelly(g) { for (const [x, z] of [[-0.18, -0.1], [0.15, 0.12], [0.05, -0.2]]) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), pm('#a78bfa', { transparent: true, opacity: 0.75, emissive: col('#7c3aed'), emissiveIntensity: 0.4 })); j.position.set(x, 0.02, z); g.add(j); spin(j, 0.3, 0, 0, 0.01); } },
  lexius(g) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 32), pm('#38bdf8', { transparent: true, opacity: 0.7, emissive: col('#0284c7'), emissiveIntensity: 0.5 })); w.position.y = 0.04; g.add(w); cyl(g, 0.24, 0.24, 0.05, 0, 0.02, 0, pm('#cbd5e1')); },
  antigrav(g) { for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), pm(['#f472b6', '#60a5fa', '#facc15', '#34d399'][i])); b.position.set(Math.cos(i * 1.6) * 0.15, 0.25 + i * 0.05, Math.sin(i * 1.6) * 0.15); g.add(b); spin(b, 1 + i * 0.3, 0.7, 0, 0.05); } cyl(g, 0.2, 0.2, 0.02, 0, 0.01, 0, glowMat('#818cf8')); },
  matacc(g) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 10, 48), pm('#64748b', { metalness: 0.7 })); r.rotation.x = Math.PI / 2; r.position.y = 0.1; g.add(r); const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), glowMat('#ffffff')); p.position.set(0.2, 0.1, 0); const pv = new THREE.Group(); pv.add(p); g.add(pv); spin(pv, 4); },
  rainforest(g) { for (const [x, z, s] of [[-0.2, -0.15, 1], [0.18, -0.1, 0.8], [0, 0.18, 1.1]]) { cyl(g, 0.02, 0.03, 0.25 * s, x, 0.12 * s, z, pm('#6b4423')); ball(g, 0.12 * s, x, 0.3 * s, z, pm('#15803d', { roughness: 0.9 })); } },
  scrap(g) { for (let i = 0; i < 6; i++) { const b = box(g, 0.08 + (i % 3) * 0.03, 0.05, 0.06, -0.15 + (i % 3) * 0.13, 0.03 + Math.floor(i / 3) * 0.05, -0.05 + (i % 2) * 0.1, pm(['#78716c', '#a8a29e', '#b45309'][i % 3], { metalness: 0.5 })); b.rotation.y = i; } },
  oil(g) { cyl(g, 0.14, 0.14, 0.3, 0, 0.15, 0, pm('#1f2937', { metalness: 0.6 })); cyl(g, 0.145, 0.145, 0.03, 0, 0.25, 0, pm('#f59e0b')); },
  belowzero(g) { for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2 + (i % 3) * 0.08, 6), pm('#bae6fd', { transparent: true, opacity: 0.8, emissive: col('#7dd3fc'), emissiveIntensity: 0.3 })); c.position.set(Math.cos(i * 1.3) * 0.15, 0.12, Math.sin(i * 1.3) * 0.15); g.add(c); } },
  mechrest(g) { box(g, 0.1, 0.24, 0.1, 0, 0.12, 0, pm('#475569')); const arm = new THREE.Group(); arm.position.y = 0.24; box(arm, 0.3, 0.04, 0.04, 0.12, 0, 0, pm('#f59e0b')); g.add(arm); spin(arm, 0.8); },
  formatcells(g) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box(g, 0.08, 0.04 + ((i + j) % 3) * 0.04, 0.08, -0.12 + i * 0.12, 0.04, -0.12 + j * 0.12, glowMat(['#22d3ee', '#a3e635', '#f472b6'][(i + j) % 3])); },
  moonpark(g) { const w = new THREE.Group(); w.position.y = 0.28; const r = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 32), pm('#f59e0b')); w.add(r); for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), pm(['#ef4444', '#3b82f6', '#22c55e'][k % 3])); c.position.set(Math.cos(k) * 0.16, Math.sin(k) * 0.16, 0); w.add(c); } g.add(w); spin(w, 0, 0, 0.8); box(g, 0.03, 0.28, 0.03, 0, 0.14, 0, pm('#64748b')); },
  food(g) { for (let i = 0; i < 3; i++) box(g, 0.12, 0.2, 0.08, -0.15 + i * 0.15, 0.1, -0.15, pm(['#fde68a', '#bbf7d0', '#fecaca'][i])); },
  soda(g) { for (let i = 0; i < 6; i++) cyl(g, 0.03, 0.03, 0.1, -0.15 + (i % 3) * 0.15, 0.05 + Math.floor(i / 3) * 0.1, 0, pm(['#ef4444', '#22c55e', '#3b82f6'][i % 3], { metalness: 0.6 })); },
  cinema(g) { box(g, 0.5, 0.26, 0.02, 0, 0.2, -0.3, glowMat('#6366f1')); for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) box(g, 0.08, 0.08, 0.08, -0.18 + i * 0.12, 0.04, 0.05 + r * 0.15, pm('#b91c1c')); },
  beauty(g) { for (const x of [-0.18, 0.18]) { cyl(g, 0.06, 0.06, 0.12, x, 0.06, 0.05, pm('#f472b6')); box(g, 0.16, 0.22, 0.01, x, 0.2, -0.25, pm('#e0f2fe', { metalness: 0.9, roughness: 0.05 })); } },
  sport(g) { box(g, 0.02, 0.14, 0.5, 0, 0.07, 0, pm('#ffffff')); const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), pm('#f97316')); b.position.set(0.15, 0.05, 0.1); g.add(b); spin(b, 0, 0, 0, 0.06); },
  pool(g) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.4), pm('#22d3ee', { transparent: true, opacity: 0.75, emissive: col('#0891b2'), emissiveIntensity: 0.5 })); w.position.y = 0.03; g.add(w); box(g, 0.02, 0.2, 0.02, 0.3, 0.1, -0.2, pm('#e5e7eb')); },
  washateria(g) { for (let i = 0; i < 3; i++) { box(g, 0.13, 0.15, 0.12, -0.16 + i * 0.16, 0.075, -0.2, pm('#f1f5f9')); const d = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), pm('#60a5fa', { metalness: 0.4 })); d.position.set(-0.16 + i * 0.16, 0.08, -0.139); g.add(d); } },
  dead_end(g) { box(g, 0.3, 0.12, 0.3, 0, 0.06, 0, pm('#57534e')); },
};
function buildType3D(fg, type) {
  const f = T3[type]; if (!f) return;
  const g = new THREE.Group(); g.position.y = 0.014;
  try { f(g); } catch (e) { console.warn('t3', type, e); return; }
  fg.add(g);
}

function buildPiece(st, p, grid, opts = {}) {
  const def = MI.PIECES[p.type];
  const pl = st.players[p.owner];
  const race = def.neutral ? 'shared' : (pl ? pl.race : opts.race || 'shared');
  const group = new THREE.Group();
  const cells = MI.absCells(p.type, p.x, p.y, p.rot);
  if (def.outdoor) { buildSolar(group, p, race); return group; }
  // floor with the room art (rotated with the piece)
  const minX = Math.min(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y));
  const maxX = Math.max(...cells.map((c) => c.x)), maxY = Math.max(...cells.map((c) => c.y));
  const bw = maxX - minX + 1, bh = maxY - minY + 1, odd = p.rot % 2 === 1;
  const w0 = odd ? bh : bw, h0 = odd ? bw : bh;
  const floorMat = opts.ghostMat || mat('floor|' + p.type + '|' + race, () => new THREE.MeshStandardMaterial({ map: floorTexture(p.type, w0, h0, race), roughness: 0.85, metalness: 0.1 }));
  const connected = (c, d) => {
    const n = grid.get((c.y + MI.DIRS[d][1]) * W + (c.x + MI.DIRS[d][0]));
    if (!n || n.p === p) return false;
    const ne = n.c.e[(d + 2) % 4];
    return (c.e[d] === 'o' && ne === 'i') || (c.e[d] === 'i' && ne === 'o');
  };
  const corridor = def.kind === 'hallway' && p.type !== 'landing' && def.cells.length === 1;
  const domed = !corridor && p.type !== 'landing';
  const floor = new THREE.Mesh(domed ? new THREE.CircleGeometry(0.5, 64) : new THREE.PlaneGeometry(w0, h0), floorMat);
  if (domed) floor.scale.set(w0 * 1.02, h0 * 1.02, 1);
  floor.rotation.x = -Math.PI / 2;
  const fg = new THREE.Group();
  if (corridor) buildCorridor(fg, def.cells[0].e, race, floorMat, opts, (dl) => connected(cells[0], (dl + p.rot) % 4)); else fg.add(floor);
  fg.rotation.y = -p.rot * Math.PI / 2;
  fg.position.set(minX + bw / 2 - W / 2, 0.012, minY + bh / 2 - H / 2);
  floor.receiveShadow = true;
  if (!opts.ghostMat) buildProps(fg, window.Art.getProps(p.type, w0, h0, race), race, w0, h0);
  if (!opts.ghostMat) buildType3D(fg, p.type);
  group.add(fg);
  if (!corridor) buildColonyRoom(group, cells, opts, p.type === 'landing', connected);
  void connected;
  return group;
}

// small live effects
function addEffects(group, st, p, race, on) {
  const def = MI.PIECES[p.type];
  const cells = MI.absCells(p.type, p.x, p.y, p.rot);
  const cx = cells.reduce((a, c) => a + c.x, 0) / cells.length - W / 2 + 0.5, cz = cells.reduce((a, c) => a + c.y, 0) / cells.length - H / 2 + 0.5;
  const P = window.Art.pal(race);
  if (false && def.kind === 'hallway' && !def.neutral) { // replaced by the shared 2D animation layer
    const m = new THREE.MeshStandardMaterial({ color: col(P.led), emissive: col(P.led), emissiveIntensity: 1.5 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), m); orb.position.set(cx, 0.38, cz); group.add(orb);
    const ph = p.id * 1.7; anims.push((t) => { m.emissiveIntensity = on ? 1.2 + Math.sin(t / 600 + ph) * 0.8 : 0.1; });
  }
  if (false && p.type === 'antimatter') { // replaced by the shared 2D animation layer
    for (const c of cells) {
      const x = c.x - W / 2 + 0.5, z = c.y - H / 2 + 0.5;
      const m = new THREE.MeshStandardMaterial({ color: 0xf0abfc, emissive: 0xec4899, emissiveIntensity: 2 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3 }));
      core.position.set(x, 0.22, z); group.add(core);
      const rings = [0, 1, 2].map((k) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 48), m); r.position.set(x, 0.22, z); r.rotation.set(k, k * 2, 0); group.add(r); return r; });
      anims.push((t) => { rings.forEach((r, k) => { r.rotation.x = t / 700 + k; r.rotation.y = t / 900 + k * 2; }); core.scale.setScalar(1 + 0.2 * Math.sin(t / 200)); });
    }
  }
  // the same live moving parts as the 2D view, painted onto a transparent layer just above the floor
  if (!def.outdoor && window.Render.animPiece) {
    const S = 48;
    const minX = Math.min(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y));
    const bw = Math.max(...cells.map((c) => c.x)) - minX + 1, bh = Math.max(...cells.map((c) => c.y)) - minY + 1;
    const cv = document.createElement('canvas'); cv.width = bw * S; cv.height = bh * S;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), m);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(minX + bw / 2 - W / 2, 0.03, minY + bh / 2 - H / 2);
    plane.renderOrder = 2; group.add(plane);
    const local = cells.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY }));
    let last = 0;
    anims.push((t) => {
      if (t - last < 110) return; last = t;           // ~16 fps is plenty for these small motions
      ctx.clearRect(0, 0, cv.width, cv.height);
      window.Render.animPiece(ctx, p, local, 0, 0, S, t, race, on);
      tex.needsUpdate = true;
    });
  }
  if (def.kind === 'facility' && def.points) {
    // floating points badge
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    c.fillStyle = '#0b1a12'; c.beginPath(); c.arc(32, 32, 28, 0, 7); c.fill(); c.lineWidth = 5; c.strokeStyle = on ? '#facc15' : '#ef4444'; c.stroke();
    const item = st.scores.details[p.owner] && st.scores.details[p.owner].items.find((x) => x.id === p.id);
    const ok = item ? !item.reason : on, label = item ? (item.reason ? '!' : String(item.points)) : (on ? def.points : '!');
    c.fillStyle = ok ? '#facc15' : '#ef4444'; c.font = '900 ' + (label.length > 2 ? 22 : 32) + 'px Orbitron, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 32, 34);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
    sp.scale.set(0.32, 0.32, 1); sp.position.set(cx + 0.3, 0.75, cz - 0.3); group.add(sp);
    const ph = p.id; anims.push((t) => { sp.position.y = 0.75 + Math.sin(t / 500 + ph) * 0.04; });
  }
}

function rebuild(st) {
  while (root.children.length) root.remove(root.children[0]);
  anims.length = 0; spinQueue.length = 0;
  const grid = new Map();
  for (const p of st.placed) MI.absCells(p.type, p.x, p.y, p.rot).forEach((c) => grid.set(c.y * W + c.x, { p, c }));
  const powered = new Set(); st.scores.power.forEach((pw) => pw.powered.forEach((id) => powered.add(id)));
  for (const p of st.placed) {
    const g = buildPiece(st, p, grid);
    mergeStatic(g);
    const pl = st.players[p.owner];
    addEffects(g, st, p, pl ? pl.race : 'shared', !pl || powered.has(p.id));
    root.add(g);
  }
  for (const [o, sx, sy, sz, bob, y0] of spinQueue.splice(0)) {
    const ph = Math.random() * 6;
    anims.push((t) => { const k = t / 1000; if (sx) o.rotation.x = k * sx + ph; if (sy) o.rotation.y = k * sy + ph; if (sz) o.rotation.z = k * sz + ph; if (bob) o.position.y = y0 + Math.sin(k * 2 + ph) * bob; });
  }
}

function setGhost(st, ghost) {
  const sig = ghost ? [ghost.type, ghost.x, ghost.y, ghost.rot, ghost.ok].join(',') : '';
  if (sig === ghostSig) return;
  ghostSig = sig;
  if (ghostGroup) { scene.remove(ghostGroup); ghostGroup = null; }
  if (!ghost) return;
  const gm = new THREE.MeshStandardMaterial({ color: ghost.ok ? 0x4ade80 : 0xf87171, transparent: true, opacity: 0.45, emissive: ghost.ok ? 0x14532d : 0x7f1d1d });
  const fake = { id: -1, type: ghost.type, owner: st.you, x: ghost.x, y: ghost.y, rot: ghost.rot };
  ghostGroup = buildPiece(st, fake, new Map(), { ghostMat: gm, race: ghost.race });
  ghostGroup.position.y = 0.02;
  addFitMarkers(st, fake, ghostGroup);
  scene.add(ghostGroup);
}

// big ✓ / ✕ markers on every side of the piece being placed that touches something
const markTex = {};
function markSprite(ok) {
  const key = ok ? 'ok' : 'bad';
  if (!markTex[key]) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    c.fillStyle = ok ? '#16a34a' : '#dc2626'; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.fill();
    c.lineWidth = 8; c.strokeStyle = '#fff'; c.stroke();
    c.lineWidth = 16; c.lineCap = 'round'; c.beginPath();
    if (ok) { c.moveTo(36, 66); c.lineTo(56, 86); c.lineTo(92, 44); } else { c.moveTo(42, 42); c.lineTo(86, 86); c.moveTo(86, 42); c.lineTo(42, 86); }
    c.stroke();
    markTex[key] = new THREE.CanvasTexture(cv);
  }
  return new THREE.SpriteMaterial({ map: markTex[key], depthTest: false });
}
function addFitMarkers(st, p, group) {
  const occ = new Map();
  for (const q of st.placed) MI.absCells(q.type, q.x, q.y, q.rot).forEach((c) => occ.set(c.y * W + c.x, c));
  const onMoon = (x, y) => x >= 0 && y >= 0 && x < W && y < H && st.mask[y * W + x];
  for (const c of MI.absCells(p.type, p.x, p.y, p.rot)) {
    for (let d = 0; d < 4; d++) {
      const a = c.e[d]; if (a === 'x') continue;
      const [dx, dy] = MI.DIRS[d], nx = c.x + dx, ny = c.y + dy, n = occ.get(ny * W + nx);
      let ok = null;
      if (n) {
        const b = n.e[(d + 2) % 4];
        if ((a === 'o' && b === 'i') || (a === 'i' && b === 'o')) ok = true;
        else if ((a === 'o' && (b === 'o' || b === 'w')) || (b === 'o' && a === 'w')) ok = false;
      } else if (a === 'o' && !onMoon(nx, ny)) ok = false;
      if (ok === null) continue;
      const x = c.x - W / 2 + 0.5 + dx * 0.5, z = c.y - H / 2 + 0.5 + dy * 0.5;
      const sp = new THREE.Sprite(markSprite(ok)); sp.scale.set(0.36, 0.36, 1); sp.position.set(x, 0.62, z); sp.renderOrder = 10;
      group.add(sp);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), new THREE.MeshBasicMaterial({ color: ok ? 0x22c55e : 0xef4444 }));
      beam.position.set(x, 0.3, z); group.add(beam);
    }
  }
}

function update(st, ghost) {
  if (!renderer) return;
  W = st.w; H = st.h;
  const sig = st.placed.map((p) => p.id + ':' + p.type + ':' + p.x + ':' + p.y + ':' + p.rot + ':' + p.owner).join('|') + '#' + st.scores.power.map((p) => p.powered.length).join(',') + '#' + st.scores.details.map((d) => d.total).join(',');
  if (sig !== builtSig) { builtSig = sig; rebuild(st); }
  setGhost(st, ghost);
  updateHighlight(st);
  updateLinks(st);
  const t = performance.now();
  anims.forEach((f) => f(t));
  placeCamera();
  renderer.render(scene, active());
}

function pick(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, active());
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
  return { x: Math.floor(hit.x + W / 2), y: Math.floor(hit.z + H / 2), wx: hit.x, wz: hit.z };
}

function zoom(deltaY) { cam.dist = Math.min(70, Math.max(3, cam.dist * (deltaY < 0 ? 0.88 : 1.14))); }
function pan(dx, dy) {
  const s = flat ? cam.dist * 0.84 / Math.max(1, holder.clientHeight) : cam.dist * 0.0016;
  if (flat) { cam.target.x -= dx * s; cam.target.z -= dy * s; cam.target.x = Math.max(-9, Math.min(9, cam.target.x)); cam.target.z = Math.max(-9, Math.min(9, cam.target.z)); return; }
  // screen-right = (cos yaw, -sin yaw), screen-forward = (-sin yaw, -cos yaw); the ground follows the mouse
  const c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw);
  cam.target.x += (-c * dx - sn * dy) * s;
  cam.target.z += (sn * dx - c * dy) * s;
  cam.target.x = Math.max(-9, Math.min(9, cam.target.x)); cam.target.z = Math.max(-9, Math.min(9, cam.target.z));
}
function orbit(dYaw, dPitch = 0) { if (flat) return; cam.yaw += dYaw; cam.pitch = Math.min(1.45, Math.max(0.35, cam.pitch + dPitch)); }
function reset() { cam.target.set(0, 0, 0); cam.dist = 17; cam.yaw = 0; cam.pitch = 0.95; }
function setVisible(v) { if (renderer) renderer.domElement.style.display = v ? 'block' : 'none'; }

function setFlat(v) { flat = !!v; }

// score links: from a facility to every guest room that counts for its points
let linkGroup = null, linkId = null, linkSig = '';
function showScore(id) { linkId = id; }
function updateLinks(st) {
  const sig = linkId == null ? '' : linkId + '|' + builtSig;
  if (sig === linkSig) return; linkSig = sig;
  if (linkGroup) { scene.remove(linkGroup); linkGroup = null; }
  if (linkId == null) return;
  const f = st.placed.find((q) => q.id === linkId); if (!f) return;
  const item = (st.scores.details[f.owner] || { items: [] }).items.find((x) => x.id === f.id); if (!item) return;
  const center = (q) => { const cs = MI.absCells(q.type, q.x, q.y, q.rot); return new THREE.Vector3(cs.reduce((a, c) => a + c.x, 0) / cs.length - W / 2 + 0.5, 0, cs.reduce((a, c) => a + c.y, 0) / cs.length - H / 2 + 0.5); };
  linkGroup = new THREE.Group();
  const from = center(f);
  const gold = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 48), gold); ring.rotation.x = Math.PI / 2; ring.position.set(from.x, 0.05, from.z); linkGroup.add(ring);
  for (const rid of item.roomIds || []) {
    const r = st.placed.find((q) => q.id === rid); if (!r) continue;
    const to = center(r), mid = from.clone().add(to).multiplyScalar(0.5); mid.y = 0.6 + from.distanceTo(to) * 0.18;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(from.x, 0.35, from.z), mid, new THREE.Vector3(to.x, 0.35, to.z));
    linkGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.022, 6), new THREE.MeshBasicMaterial({ color: 0x4ade80 })));
    const rr = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 8, 40), new THREE.MeshBasicMaterial({ color: 0x4ade80 })); rr.rotation.x = Math.PI / 2; rr.position.set(to.x, 0.05, to.z); linkGroup.add(rr);
  }
  scene.add(linkGroup);
}

// highlight all buildings of one player (hovering a race in the sidebar)
let hlGroup = null, hlOwner = null, hlSig = '';
function highlight(owner) { hlOwner = owner; }
function updateHighlight(st) {
  const sig = hlOwner == null ? '' : hlOwner + '|' + builtSig;
  if (sig === hlSig) return; hlSig = sig;
  if (hlGroup) { scene.remove(hlGroup); hlGroup = null; }
  if (hlOwner == null || !st.players[hlOwner]) return;
  const c = col(MI.COLORS[st.players[hlOwner].color].hex);
  const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false });
  const edge = new THREE.MeshBasicMaterial({ color: c });
  hlGroup = new THREE.Group();
  for (const p of st.placed) {
    if (p.owner !== hlOwner) continue;
    for (const k of MI.absCells(p.type, p.x, p.y, p.rot)) {
      const x = k.x - W / 2 + 0.5, z = k.y - H / 2 + 0.5;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); tile.rotation.x = -Math.PI / 2; tile.position.set(x, 0.006, z); hlGroup.add(tile);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), edge); beam.position.set(x, 0.45, z); hlGroup.add(beam);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), edge); cap.position.set(x, 0.92, z); hlGroup.add(cap);
    }
  }
  scene.add(hlGroup);
}

// ---------- 3D portrait of one building for the hover card ----------
let snapR = null, snapScene = null, snapCam = null;
const snapCache = new Map();
function snapshot(st, p, wPx = 260, hPx = 180) {
  if (!renderer) return null;
  const key = p.id + '|' + builtSig + '|' + wPx;
  if (snapCache.has(key)) return snapCache.get(key);
  if (!snapR) {
    snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    snapR.outputColorSpace = THREE.SRGBColorSpace; snapR.setPixelRatio(2);
    snapScene = new THREE.Scene();
    snapScene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3a46, 1.6));
    const key2 = new THREE.DirectionalLight(0xffffff, 2.4); key2.position.set(-3, 6, 4); snapScene.add(key2);
    const rim = new THREE.DirectionalLight(0x9fe8ff, 1.2); rim.position.set(4, 3, -5); snapScene.add(rim);
    snapCam = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  }
  snapR.setSize(wPx, hPx, false); snapCam.aspect = wPx / hPx; snapCam.updateProjectionMatrix();
  const grid = new Map();
  for (const q of st.placed) MI.absCells(q.type, q.x, q.y, q.rot).forEach((c) => grid.set(c.y * W + c.x, { p: q, c }));
  const g = buildPiece(st, p, grid);
  const out = renderSnap(g, wPx, hPx);
  if (snapCache.size > 60) snapCache.clear();
  snapCache.set(key, out);
  return out;
}
function renderSnap(g, wPx, hPx) {
  if (!snapR) {
    snapR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    snapR.outputColorSpace = THREE.SRGBColorSpace; snapR.setPixelRatio(2);
    snapScene = new THREE.Scene();
    snapScene.add(new THREE.HemisphereLight(0xdde8ff, 0x3a3a46, 1.6));
    const key2 = new THREE.DirectionalLight(0xffffff, 2.4); key2.position.set(-3, 6, 4); snapScene.add(key2);
    const rim = new THREE.DirectionalLight(0x9fe8ff, 1.2); rim.position.set(4, 3, -5); snapScene.add(rim);
    snapCam = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  }
  snapR.setSize(wPx, hPx, false); snapCam.aspect = wPx / hPx; snapCam.updateProjectionMatrix();
  // a small disc of moon ground under it
  const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const ground = new THREE.Mesh(new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.7, 48), new THREE.MeshStandardMaterial({ color: 0x45464b, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(ctr.x, 0, ctr.z);
  snapScene.add(g, ground);
  const r = Math.max(size.x, size.z) * 0.95 + 0.3;
  snapCam.position.set(ctr.x + r * 0.55, r * 1.05, ctr.z + r * 1.15); snapCam.lookAt(ctr.x, 0.08, ctr.z);
  snapR.render(snapScene, snapCam);
  snapScene.remove(g, ground);
  const out = document.createElement('canvas'); out.width = snapR.domElement.width; out.height = snapR.domElement.height;
  out.getContext('2d').drawImage(snapR.domElement, 0, 0);
  out.style.cssText = 'width:' + wPx + 'px;height:' + hPx + 'px;display:block;margin:0 auto 6px;border-radius:10px;background:radial-gradient(circle at 50% 40%, #1d2b25, #050807)';
  return out;
}
// 3D picture of a piece type (tray, market, tooltips), cached
const typeSnapCache = new Map();
function snapshotType(type, race, rot = 0, wPx = 96, hPx = 80) {
  if (!renderer) return null;
  const key = type + '|' + race + '|' + rot + '|' + wPx + 'x' + hPx;
  if (typeSnapCache.has(key)) return typeSnapCache.get(key);
  const x = Math.floor(W / 2), y = Math.floor(H / 2);
  const fake = { id: -9, type, owner: -1, x, y, rot };
  const fst = { players: [], placed: [], scores: { details: [], power: [] } };
  const g = buildPiece(fst, fake, new Map(), { race });
  spinQueue.length = 0;
  const out = renderSnap(g, wPx, hPx);
  if (typeSnapCache.size > 300) typeSnapCache.clear();
  typeSnapCache.set(key, out);
  return out;
}
window.Render3D = { snapshotType, showScore, highlight, snapshot, setFlat, init, update, pick, zoom, pan, orbit, reset, setVisible, resize };
window.dispatchEvent(new Event('render3d-ready'));
