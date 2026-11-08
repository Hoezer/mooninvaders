const assert = require('assert');
const R = require('../shared/rules');

function state() {
  return { w: R.BOARD_W, h: R.BOARD_H, mask: R.makeMask(), placed: [], players: [{ race: 'humans' }, { race: 'machines' }] };
}

const s = state();
s.placed.push({ id: 1, type: 'hall_cross_out', owner: 0, x: 4, y: 4, rot: 0 });
// all-in hallway east of the start: exit meets entrance -> ok
assert.ok(R.canPlace(s, 0, 'hall_cross_in', 5, 4, 0).ok);
// all-out next to all-out: two exits collide
assert.strictEqual(R.canPlace(s, 0, 'hall_cross_out', 5, 4, 0).ok, false);
// room with entrance facing the start hallway (entrance on W after rot 3)
assert.ok(R.canPlace(s, 0, 'room_in', 5, 4, 3).ok);
// room with wall facing the exit -> blocked
assert.strictEqual(R.canPlace(s, 0, 'room_in', 5, 4, 0).ok, false);
// other player's building on my hallway -> blocked
assert.strictEqual(R.canPlace(s, 1, 'room_in', 5, 4, 3).ok, false);
// outside moon
assert.strictEqual(R.canPlace(s, 0, 'dead_end', 0, 0, 0).ok, false);

// Build a scoring setup: hallway(in) east, solar onto it, room + facility on start hallway
s.placed.push({ id: 2, type: 'hall_cross_in', owner: 0, x: 5, y: 4, rot: 0 });
assert.ok(R.canPlace(s, 0, 'solar', 6, 4, 3).ok, R.canPlace(s, 0, 'solar', 6, 4, 3).reason);
s.placed.push({ id: 3, type: 'solar', owner: 0, x: 6, y: 4, rot: 3 });
s.placed.push({ id: 4, type: 'room_in', owner: 0, x: 4, y: 5, rot: 0 });
s.placed.push({ id: 5, type: 'sunny_bar', owner: 0, x: 4, y: 3, rot: 2 });
s.placed.forEach((p) => delete p.abs);
const sc = R.computeScores(s);
assert.strictEqual(sc.details[0].total, 8, JSON.stringify(sc.details[0]));
console.log('All rules tests passed.');
