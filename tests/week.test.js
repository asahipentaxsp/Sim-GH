const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const S = AG.sim, D = AG.DATA;
const NORM = { hum: 1, temp: 'norm', mat: 'norm', cond: false };

test('урожай клетки = кривая × площадь × (1 − потери) × (1 − срок ожидания)', () => {
  const c = { dis: { powdery: { stage: 3 } }, pests: { mite: 2 }, chemLoss: 0.4, sanitizeWeeks: 0 };
  const exp = 2.8 * D.cellArea * (1 - D.stageLoss[3]) * (1 - D.pestLoss[2]) * (1 - 0.4);
  assert.equal(AG.round(S.cellHarvest(c, 7), 4), AG.round(exp, 4));
  assert.equal(AG.round(S.cellHarvest({ dis: {}, pests: {}, chemLoss: 0, sanitizeWeeks: 1 }, 7), 4), AG.round(2.8 * D.cellArea * 0.7, 4));
});

test('неделя 4 при чистой теплице: 1,0 кг/м²', () => {
  const s = S.newSeason(1, { disinfectDrip: true });
  s.week = 4; s.climate = { ...NORM };
  const r = S.endWeek(s, 4);
  assert.equal(r.ok, true);
  assert.equal(AG.round(s.history[0].kg / 10000, 3), 1.0);
  assert.equal(s.week, 5);
});

test('после недели 16: over=true; повторный endWeek → season_over', () => {
  const s = S.newSeason(2, {});
  for (let w = 1; w <= 16; w++) assert.equal(S.endWeek(s, w).ok, true, 'неделя ' + w);
  assert.equal(s.over, true);
  assert.equal(s.week, 16);
  const r = S.endWeek(s, 16);
  assert.equal(r.ok, false); assert.equal(r.error, 'season_over');
  assert.equal(S.applyAction(s, { type: 'inspect', scope: 'cell', cell: 0 }).error, 'season_over');
});

test('двойной вызов endWeek с одним номером недели продвигает неделю один раз', () => {
  const s = S.newSeason(3, {});
  assert.equal(S.endWeek(s, 1).ok, true);
  const r = S.endWeek(s, 1);
  assert.equal(r.ok, false); assert.equal(r.error, 'stale');
  assert.equal(s.week, 2);
});

test('новая неделя: часы восстановлены, рычаги сброшены, климат = подготовленный, заказ пришёл', () => {
  const s = S.newSeason(4, {});
  const next = s.nextClimate;
  S.applyAction(s, { type: 'lever', lever: 'heat', on: true });
  S.applyAction(s, { type: 'order', productId: 'mikozar', doses: 6 });
  S.applyAction(s, { type: 'inspect', scope: 'cell', cell: 0 });
  S.endWeek(s, 1);
  assert.equal(s.hours, 20);
  assert.deepEqual(s.levers, {});
  assert.deepEqual(s.climate, next);
  assert.equal(s.stock.mikozar, 6);
  assert.equal(s.orders.length, 0);
});

test('защита стареет: лист −1 неделя, мат +1 возраст', () => {
  const s = S.newSeason(5, { matAtPlanting: 'gliokladin' });
  s.cells[0].leafProt.push({ productId: 'gliokladin', eff: { botrytis: 0.6 }, weeksLeft: 1 });
  S.endWeek(s, 1);
  assert.equal(s.cells[0].leafProt.length, 0);
  assert.equal(s.rows[0].matProt.age, 1);
});

test('энтомофаги, не выпущенные в неделю прибытия, пропадают → enemies_wasted', () => {
  const s = S.newSeason(6, {});
  s.arrivedEnemies.swirskii = 5;
  S.endWeek(s, 1);
  assert.equal(s.arrivedEnemies.swirskii || 0, 0);
  assert.ok(s.mistakes.some(m => m.code === 'enemies_wasted'));
});

test('перелив без коррекции → flood_ignored; с коррекцией — нет', () => {
  const a = S.newSeason(7, {}); a.climate = { ...NORM, mat: 'flood' };
  S.endWeek(a, 1);
  assert.ok(a.mistakes.some(m => m.code === 'flood_ignored'));
  const b = S.newSeason(7, {}); b.climate = { ...NORM, mat: 'flood' };
  S.applyAction(b, { type: 'lever', lever: 'irrigFix', on: true });
  S.endWeek(b, 1);
  assert.ok(!b.mistakes.some(m => m.code === 'flood_ignored'));
});

test('разбор недели: не больше 4 событий, у каждого есть текст', () => {
  const s = S.newSeason(8, {});
  s.climate = { hum: 3, temp: 'cold', mat: 'flood', cond: true };
  s.cells[0].dis.downy = { stage: 3, age: 0 };
  s.cells[1].pests.mite = 3;
  const r = S.endWeek(s, 1);
  assert.ok(r.events.length >= 1 && r.events.length <= 4);
  for (const e of r.events) assert.ok(e.text && e.text.length > 10, JSON.stringify(e));
});

function script(s) {
  if (s.week === 1) S.applyAction(s, { type: 'mat', productId: 'gliokladin', scope: 'all' });
  if (s.week % 3 === 0) S.applyAction(s, { type: 'leaf', productId: 'alirinGamair', scope: 'row', row: s.week % 6 });
  S.applyAction(s, { type: 'inspect', scope: 'cell', cell: s.week });
}

test('один сид + одинаковые действия → одинаковый финальный отчёт', () => {
  const run = () => { const s = S.newSeason(77, { disinfectDrip: true });
    while (!s.over) { script(s); S.endWeek(s, s.week); } return S.finalReport(s); };
  assert.deepEqual(run(), run());
});

test('финальный отчёт: проценты, деньги, звание', () => {
  const s = S.newSeason(9, {});
  while (!s.over) S.endWeek(s, s.week);
  const f = S.finalReport(s);
  assert.ok(f.pctPotential > 0 && f.pctPotential <= 100);
  assert.equal(AG.round(f.kgPerM2, 3), AG.round(s.totals.kg / 10000, 3));
  assert.equal(AG.round(f.net, 2), AG.round(f.revenue - f.spend, 2));
  assert.ok(f.mistakes.length <= 5);
  assert.equal(AG.round(f.preventionVsLoss.lostRub, 1), AG.round((31.7 * 10000 - s.totals.kg) * D.pricePerKg, 1));
});

test('звание: <70 стажёр, 70–85 агроном, >85 главный агроном', () => {
  assert.equal(S.rankFor(69.9), 'Агроном-стажёр');
  assert.equal(S.rankFor(70), 'Агроном');
  assert.equal(S.rankFor(85), 'Агроном');
  assert.equal(S.rankFor(85.1), 'Главный агроном');
});
