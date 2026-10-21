const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const sum = a => a.reduce((s, x) => s + x, 0);

test('rng детерминирован', () => {
  const a = AG.makeRng(42), b = AG.makeRng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const c = AG.makeRng(43);
  assert.notEqual(AG.makeRng(42)(), c());
});

test('rng в [0,1)', () => {
  const r = AG.makeRng(7);
  for (let i = 0; i < 1000; i++) { const x = r(); assert.ok(x >= 0 && x < 1); }
});

test('hashSeed стабилен и различает строки', () => {
  assert.equal(AG.hashSeed('abc'), AG.hashSeed('abc'));
  assert.notEqual(AG.hashSeed('abc'), AG.hashSeed('abd'));
});

test('кривая урожая = 31,7 кг/м²', () => {
  assert.equal(AG.DATA.yieldCurve.length, 17);
  assert.equal(Math.round(sum(AG.DATA.yieldCurve) * 10) / 10, 31.7);
});

test('вероятности фаз климата в сумме 1', () => {
  assert.equal(AG.DATA.climatePhases.length, 3);
  for (const ph of AG.DATA.climatePhases)
    for (const axis of ['hum', 'temp', 'mat']) assert.ok(Math.abs(sum(ph[axis]) - 1) < 1e-9, axis);
});

test('цели средств ссылаются на существующие id', () => {
  const { products, diseases, pests } = AG.DATA;
  for (const [id, p] of Object.entries(products)) {
    for (const k of Object.keys(p.leaf || {})) assert.ok(diseases[k], id + ' leaf ' + k);
    for (const k of Object.keys(p.mat || {})) assert.ok(diseases[k], id + ' mat ' + k);
    for (const k of Object.keys(p.pests || {})) assert.ok(pests[k], id + ' pests ' + k);
  }
});

test('у каждой болезни и вредителя есть карточка справочника', () => {
  for (const id of [...Object.keys(AG.DATA.diseases), ...Object.keys(AG.DATA.pests), ...Object.keys(AG.DATA.enemies)])
    assert.ok(AG.DATA.text.ref[id] && AG.DATA.text.ref[id].name, id);
});

test('Трихоцин только при высадке', () => assert.equal(AG.DATA.products.trichocin.matOnlyWeek0, true));
test('стартовые ресурсы по спецификации', () => {
  assert.equal(AG.DATA.start.budget, 600);
  assert.equal(AG.DATA.start.hours, 20);
  assert.deepEqual(AG.DATA.start.stock, { gliokladin: 12, alirinGamair: 12 });
  assert.deepEqual(AG.DATA.formationWeeks, [3, 6, 9, 12]);
});
