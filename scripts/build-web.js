// Builds the static site for Netlify (or any static host) into ./site.
// MI_SERVER = address of an online game server (e.g. wss://moon-invaders.onrender.com).
// Without it the site runs in "local mode": the game runs inside the browser
// (play against computers / watch computers; no online multiplayer).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'site');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(out, 'vendor/three.module.js'));

const server = process.env.MI_SERVER || 'local';
fs.writeFileSync(path.join(out, 'config.js'), `window.MI_SERVER = ${JSON.stringify(server)};\n`);

// browser build of the server-side Game class, used by local mode
const gameSrc = fs.readFileSync(path.join(root, 'server/game.js'), 'utf8');
const shim = `
var module = { exports: {} };
var require = function (p) {
  if (p === 'crypto') return { randomBytes: function (n) {
    var a = self.crypto.getRandomValues(new Uint8Array(n));
    return { toString: function () { return Array.from(a, function (x) { return x.toString(16).padStart(2, '0'); }).join(''); } };
  } };
  return window.MI;
};
`;
fs.writeFileSync(path.join(out, 'game-local.js'), `(function () {\n${shim}\n${gameSrc}\nwindow.MIGame = module.exports.Game;\n})();\n`);

console.log('Static site built in ./site (game server: ' + server + ')');
