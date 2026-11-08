// Builds the static site for Netlify (or any static host) into ./site.
// The game server runs elsewhere (e.g. Render); set MI_SERVER to its address, e.g. wss://moon-invaders.onrender.com
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'site');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(out, 'vendor/three.module.js'));
const server = process.env.MI_SERVER || '';
fs.writeFileSync(path.join(out, 'config.js'), `window.MI_SERVER = ${JSON.stringify(server)};\n`);
console.log('Static site built in ./site' + (server ? ' (game server: ' + server + ')' : ' (game server: same host)'));
