const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const S = AG.sim;
const C = (o) => ({ hum: 1, temp: 'norm', mat: 'norm', cond: false, ...o });

test('фазы сезона', () => {
  assert.equal(S.phaseOf(1), 0); assert.equal(S.phaseOf(3), 0);
  assert.equal(S.phaseOf(4), 1); assert.equal(S.phaseOf(9), 1);
  assert.equal(S.phaseOf(10), 2); assert.equal(S.phaseOf(16), 2);
});

test('проветривание −1 влажность, не ниже 0', () => {
  assert.equal(S.effectiveClimate(C({ hum: 2 }), { vent: true }).hum, 1);
  assert.equal(S.effectiveClimate(C({ hum: 0 }), { vent: true }).hum, 0);
});

test('подогрев убирает холодную ночь и конденсат', () => {
  const c = S.effectiveClimate(C({ hum: 2, temp: 'cold', cond: true }), { heat: true });
  assert.equal(c.temp, 'norm'); assert.equal(c.cond, false);
});

test('проветривание при холодной ночи снимает конденсат, если влажность стала ниже 2', () => {
  const c = S.effectiveClimate(C({ hum: 2, temp: 'cold', cond: true }), { vent: true });
  assert.equal(c.cond, false);
});

test('охлаждение раствора убирает перегрев, коррекция полива — перелив', () => {
  assert.equal(S.effectiveClimate(C({ mat: 'hot' }), { coolMat: true }).mat, 'norm');
  assert.equal(S.effectiveClimate(C({ mat: 'flood' }), { irrigFix: true }).mat, 'norm');
  assert.equal(S.effectiveClimate(C({ mat: 'flood' }), { coolMat: true }).mat, 'flood');
});

test('увлажнение +1, не выше 3', () => {
  assert.equal(S.effectiveClimate(C({ hum: 0 }), { humidify: true }).hum, 1);
  assert.equal(S.effectiveClimate(C({ hum: 3 }), { humidify: true }).hum, 3);
});

test('конденсат = холодная ночь при влажности ≥ 2', () => {
  const s = S.newSeason(9, {});
  for (let i = 0; i < 300; i++) {
    const c = S.rollClimate(s, 6);
    assert.equal(c.cond, c.temp === 'cold' && c.hum >= 2);
  }
});

test('частоты фазы осени на 20000 бросков в пределах ±0,02 от таблицы', () => {
  const s = S.newSeason(3, {});
  const n = 20000, hum = [0, 0, 0, 0], temp = { norm: 0, cold: 0, hot: 0 };
  for (let i = 0; i < n; i++) { const c = S.rollClimate(s, 5); hum[c.hum]++; temp[c.temp]++; }
  const ph = AG.DATA.climatePhases[1];
  hum.forEach((x, k) => assert.ok(Math.abs(x / n - ph.hum[k]) < 0.02, 'hum ' + k));
  assert.ok(Math.abs(temp.cold / n - ph.temp[1]) < 0.02);
});

test('прогноз совпадает с фактом примерно в 80% по оси', () => {
  const s = S.newSeason(4, {});
  let same = 0; const n = 5000;
  for (let i = 0; i < n; i++) { const a = S.rollClimate(s, 6); if (S.rollForecast(s, a, 6).temp === a.temp) same++; }
  // 0,8 + 0,2 × P(случайный совпал) — для осени около 0,88
  assert.ok(same / n > 0.8 && same / n < 0.95, String(same / n));
});

test('flags для таблиц болезней', () => {
  const f = S.flags(C({ hum: 3, temp: 'cold', cond: true, mat: 'flood' }));
  assert.equal(f.humVHigh, true); assert.equal(f.humGE2, true); assert.equal(f.cold, true);
  assert.equal(f.cond, true); assert.equal(f.matFlood, true); assert.equal(f.dry, false);
});
