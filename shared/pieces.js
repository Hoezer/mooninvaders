// Piece catalogue for Moon Invaders.
// Data taken from docs/Docs/Moon-Invaders Race.xls (capsules, power, points, count per player)
// Edges per cell side in order [North, East, South, West]:
//   'w' = wall, 'i' = entrance (notch), 'o' = exit (tab), 'x' = internal side of a 2-cell piece.
(function (exp) {
  const one = (e) => [{ dx: 0, dy: 0, e }];
  const two = (a, b) => [{ dx: 0, dy: 0, e: a }, { dx: 1, dy: 0, e: b }];

  // kind: hallway | room | generator | resource | facility | storage | deadend
  const PIECES = {
    // ---- Central landing base (one on the board, owned by nobody, never in supply) ----
    landing: { name: 'Landing Base', kind: 'hallway', neutral: true, cost: 0, power: 0, points: 0, count: 0, cells: [
      { dx: 0, dy: 0, e: ['o', 'x', 'x', 'o'] }, { dx: 1, dy: 0, e: ['o', 'o', 'x', 'x'] },
      { dx: 0, dy: 1, e: ['x', 'x', 'o', 'o'] }, { dx: 1, dy: 1, e: ['x', 'o', 'o', 'x'] }] },

    // ---- Shared set (every race) ----
    hall_cross_out: { name: 'Hallway (all exits)', kind: 'hallway', cost: 1, power: 0, points: 0, count: 4, cells: one(['o', 'o', 'o', 'o']) },
    hall_cross_in:  { name: 'Hallway (all entrances)', kind: 'hallway', cost: 1, power: 0, points: 0, count: 4, cells: one(['i', 'i', 'i', 'i']) },
    hall_half:      { name: 'Hallway (half)', kind: 'hallway', cost: 1, power: 0, points: 0, count: 4, cells: one(['i', 'o', 'i', 'o']) },
    hall_corner:    { name: 'Hallway (half-next)', kind: 'hallway', cost: 1, power: 0, points: 0, count: 4, cells: one(['o', 'o', 'i', 'i']) },
    room_in:   { name: 'Rooms (entrance)', kind: 'room', cost: 2, power: -5, points: 0, count: 6, cells: one(['i', 'w', 'w', 'w']) },
    room_out:  { name: 'Rooms (exit)', kind: 'room', cost: 2, power: -5, points: 0, count: 6, cells: one(['o', 'w', 'w', 'w']) },
    dead_end:  { name: 'Dead End', kind: 'deadend', cost: 1, power: 0, points: 0, count: 1, cells: one(['w', 'w', 'w', 'w']) },
    solar:     { name: 'Solar Plant', kind: 'generator', outdoor: true, cost: 2, power: 50, points: 0, count: 3, cells: one(['o', 'w', 'w', 'w']) },
    antimatter:{ name: 'Anti-Matter Lab', kind: 'generator', cost: 2, power: 150, points: 0, count: 2, cells: two(['o', 'x', 'w', 'w'], ['w', 'w', 'o', 'x']) },
    small_storage: { name: 'Small Storage', kind: 'storage', cost: 2, power: -5, points: 0, count: 2, cells: two(['w', 'x', 'w', 'o'], ['w', 'w', 'w', 'x']) },
    star_meal: { name: 'Star Meal', kind: 'facility', cost: 2, power: -25, points: 5, count: 1, cells: two(['w', 'x', 'w', 'i'], ['w', 'w', 'w', 'x']) },
    sunny_bar: { name: 'Sunny Bar', kind: 'facility', cost: 2, power: -35, points: 4, count: 1, cells: one(['i', 'w', 'w', 'w']) },
    galaxy_zoo:{ name: 'Galaxy Zoo', kind: 'facility', cost: 2, power: -20, points: 2, count: 1, cells: one(['i', 'o', 'w', 'w']) },
    mim:       { name: 'MiM', kind: 'facility', cost: 2, power: -15, points: 1, count: 1, cells: one(['i', 'w', 'w', 'w']) },

    // ---- boZob ----
    cake:  { race: 'bozob', name: 'ekaC-Cake', kind: 'resource', cost: 3, power: -15, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    diet:  { race: 'bozob', name: 'dieT-Teid', kind: 'resource', cost: 2, power: -10, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    aura:  { race: 'bozob', name: 'aurA-Arua', kind: 'facility', cost: 2, power: -20, points: 1, count: 4, cells: one(['i', 'o', 'w', 'w']) },
    dorex: { race: 'bozob', name: 'doreX-Xerod', kind: 'facility', cost: 3, power: -20, points: 1, count: 6, cells: one(['i', 'w', 'o', 'w']) },

    // ---- Lustroms ----
    jelly:   { race: 'lustroms', name: 'Jelly Fields', kind: 'resource', cost: 3, power: -15, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    lexius:  { race: 'lustroms', name: 'Lexius Water', kind: 'resource', cost: 2, power: -10, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    antigrav:{ race: 'lustroms', name: 'Anti-Gravity Chamber', kind: 'facility', cost: 5, power: -40, points: 3, count: 2, cells: one(['i', 'w', 'w', 'w']) },
    matacc:  { race: 'lustroms', name: 'Material-Accelerator', kind: 'facility', cost: 4, power: -35, points: 2, count: 2, cells: one(['i', 'o', 'w', 'w']) },
    rainforest: { race: 'lustroms', name: 'Rain Forest', kind: 'facility', cost: 3, power: -25, points: 1, count: 3, cells: one(['i', 'w', 'o', 'w']) },

    // ---- Machines ----
    scrap:   { race: 'machines', name: 'Scrap Yard', kind: 'resource', cost: 3, power: -15, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    oil:     { race: 'machines', name: 'Oil Reservoir', kind: 'resource', cost: 2, power: -10, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    belowzero: { race: 'machines', name: 'Below Zero Spot', kind: 'facility', cost: 5, power: -40, points: 3, count: 2, cells: one(['i', 'w', 'w', 'w']) },
    mechrest:  { race: 'machines', name: 'Mechanical Restoration', kind: 'facility', cost: 3, power: -30, points: 2, count: 2, cells: one(['i', 'o', 'w', 'w']) },
    formatcells: { race: 'machines', name: 'Format Cells', kind: 'facility', cost: 4, power: -25, points: 2, count: 2, cells: one(['i', 'w', 'w', 'w']) },
    moonpark:  { race: 'machines', name: 'Moon Park', kind: 'facility', cost: 2, power: -20, points: 1, count: 2, cells: one(['i', 'w', 'o', 'w']) },

    // ---- Humans ----
    food:    { race: 'humans', name: 'Food Supplements', kind: 'resource', cost: 3, power: -15, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    soda:    { race: 'humans', name: 'Soda Storage', kind: 'resource', cost: 2, power: -10, points: 0, count: 2, cells: one(['o', 'w', 'w', 'w']) },
    cinema:  { race: 'humans', name: 'Simulation Cinema', kind: 'facility', cost: 5, power: -40, points: 3, count: 1, cells: one(['i', 'w', 'w', 'w']) },
    beauty:  { race: 'humans', name: 'Beauty Salon', kind: 'facility', cost: 4, power: -35, points: 2, count: 1, cells: one(['i', 'w', 'w', 'w']) },
    sport:   { race: 'humans', name: 'Sporting Area', kind: 'facility', cost: 4, power: -30, points: 2, count: 2, cells: one(['i', 'o', 'w', 'w']) },
    pool:    { race: 'humans', name: 'Swimming Pool', kind: 'facility', cost: 3, power: -30, points: 1, count: 2, cells: one(['i', 'w', 'o', 'w']) },
    washateria: { race: 'humans', name: 'Washateria House', kind: 'facility', cost: 2, power: -25, points: 1, count: 2, cells: one(['i', 'w', 'w', 'w']) },
  };

  // Flavour texts (from docs/Docs/Resouces&facilities.doc where available)
  const FLAVOR = {
    scrap: 'Always wanted a new leg? Get a wheel on your arm? Every possibility is possible. Upgrade yourself, polish your skin or be reborn so nobody recognizes you.',
    oil: 'The name says it all.',
    dorex: 'Nobody knows what this room is. It can be anything: a sweet living room, a poisonous scorpion, a drunken dragon... We just don’t know. And never will.',
    moonpark: 'Stroll on the moon, enjoy the fresh air, meet your future love. So relaxing it almost makes you stress again.',
    pool: 'Turn around, swap your legs, taste the ocean. Salt water, sweet water and a never-ending water-slide.',
    mim: 'Moon Information & Merchandise. Lost in the immense hotel? Get a map, and try the Cheese Chips, made of the moon itself.',
    star_meal: 'Five-star dining under a billion stars.',
    sunny_bar: 'The only bar where the sun never sets. Literally.',
    galaxy_zoo: 'Creatures from every corner of the galaxy, safely behind glass. Mostly.',
    solar: 'Clean power straight from the sun.',
    antimatter: 'Enormous power. Please do not touch anything.',
    small_storage: 'Lets you keep one landed piece for a later turn.',
    dead_end: 'A sealed module. Fills any gap where nothing points in.',
  };

  exp.PIECES = PIECES;
  exp.FLAVOR = FLAVOR;
})(typeof module !== 'undefined' ? module.exports : (window.MI = window.MI || {}));
