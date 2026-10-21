const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const S = AG.sim;
const none = { disinfectGreenhouse: false, disinfectDrip: false, gliokladinStructures: false, seedlings: false, matAtPlanting: null };

test('36 клеток, 6 рядов, неделя 1', () => {
  const s = S.newSeason(1, none);
  assert.equal(s.cells.length, 36);
  assert.equal(s.rows.length, 6);
  assert.equal(s.week, 1);
  assert.equal(s.over, false);
  assert.equal(s.hours, 20);
});

test('бюджет = 600 − подготовка − доза в маты', () => {
  const s = S.newSeason(1, { ...none, disinfectGreenhouse: true, disinfectDrip: true, matAtPlanting: 'gliokladin' });
  assert.equal(AG.round(s.budget, 3), AG.round(600 - 60 - 40 - 36 * 0.4, 3));
  assert.equal(s.rows[0].matProt.productId, 'gliokladin');
  assert.equal(s.rows[5].matProt.age, 0);
});

test('без дезинфекции капельной системы очаг crazy root на неделе 2', () => {
  assert.equal(S.newSeason(1, none).crazySourceWeek, 2);
});
test('с дезинфекцией очага нет', () => {
  assert.equal(S.newSeason(1, { ...none, disinfectDrip: true }).crazySourceWeek, null);
});

test('множители подготовки: серая гниль и аскохитоз ×0,25 при двух мерах', () => {
  const s = S.newSeason(1, { ...none, disinfectGreenhouse: true, gliokladinStructures: true, seedlings: true });
  assert.equal(s.prepMult.leaf, 0.5);
  assert.equal(s.prepMult.botAsco, 0.25);
  assert.equal(s.prepMult.rootEarly, 0.3);
  const n = S.newSeason(1, none);
  assert.deepEqual(n.prepMult, { leaf: 1, botAsco: 1, rootEarly: 1 });
});

test('стартовый склад', () => {
  assert.deepEqual(S.newSeason(1, none).stock, { gliokladin: 12, alirinGamair: 12 });
});

test('соседи и ряды', () => {
  assert.deepEqual(S.neighbors4(0).sort((a, b) => a - b), [1, 6]);
  assert.equal(S.neighbors8(7).length, 8);
  assert.equal(S.rowOf(13), 2);
  assert.deepEqual(S.rowCells(1), [6, 7, 8, 9, 10, 11]);
});

test('parseSeed: число, строка, пусто', () => {
  assert.deepEqual(S.parseSeed('123'), { seed: 123, shown: '123' });
  assert.equal(S.parseSeed('abc').seed, AG.hashSeed('abc'));
  assert.equal(S.parseSeed('abc').shown, 'abc');
  const e = S.parseSeed('   ');
  assert.ok(Number.isInteger(e.seed));
  assert.ok(e.shown.length > 0);
});

test('одинаковый сид — одинаковый климат первой недели', () => {
  assert.deepEqual(S.newSeason(5, none).climate, S.newSeason(5, none).climate);
});
