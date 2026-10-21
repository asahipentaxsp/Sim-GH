const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const S = AG.sim;
const fresh = (seed = 1) => {
  const s = S.newSeason(seed, { disinfectDrip: true });
  s.climate = { hum: 1, temp: 'norm', mat: 'norm', cond: false };
  return s;
};
const ok = (r) => { assert.equal(r.ok, true, r.error); return r.state; };

test('обход: −0,5 ч, стадия 2 видна, скрытая видна примерно в 50%', () => {
  let hidden = 0; const n = 400;
  for (let k = 0; k < n; k++) {
    const s = fresh(k);
    s.cells[0].dis.powdery = { stage: 2, age: 0 };
    s.cells[0].dis.downy = { stage: 1, age: 0 };
    s.cells[0].pests.mite = 1;
    const t = ok(S.applyAction(s, { type: 'inspect', scope: 'cell', cell: 0 }));
    assert.equal(t.hours, 19.5);
    assert.equal(t.cells[0].seen.dis.powdery, 2);
    assert.equal(t.cells[0].seen.pests.mite, 1);
    if (t.cells[0].seen.dis.downy === 1) hidden++;
  }
  assert.ok(hidden / n > 0.4 && hidden / n < 0.6, String(hidden / n));
});

test('в мат нельзя на клетку → bad_scope', () => {
  const r = S.applyAction(fresh(), { type: 'mat', productId: 'gliokladin', scope: 'cell', cell: 0 });
  assert.equal(r.ok, false); assert.equal(r.error, 'bad_scope');
});

test('трихоцин после недели 0 → week0_only', () => {
  const s = fresh(); s.stock.trichocin = 36;
  assert.equal(S.applyAction(s, { type: 'mat', productId: 'trichocin', scope: 'row', row: 0 }).error, 'week0_only');
});

test('в мат на ряд: 6 доз, 0,5 ч, защита ряда с возрастом 0', () => {
  const t = ok(S.applyAction(fresh(), { type: 'mat', productId: 'gliokladin', scope: 'row', row: 2 }));
  assert.equal(t.stock.gliokladin, 6);
  assert.equal(t.hours, 19.5);
  assert.equal(t.rows[2].matProt.productId, 'gliokladin');
  assert.equal(t.rows[2].matProt.age, 0);
});

test('по листу с Влипом: 2 недели, +0,1 эффективности, доза Влипа списана', () => {
  const s = fresh(); s.stock.vlip = 5; s.stock.mikozar = 5;
  const t = ok(S.applyAction(s, { type: 'leaf', productId: 'mikozar', vlip: true, scope: 'cell', cell: 3 }));
  const p = t.cells[3].leafProt[0];
  assert.equal(p.weeksLeft, 2);
  assert.equal(AG.round(p.eff.downy, 2), 0.7);
  assert.equal(t.stock.vlip, 4); assert.equal(t.stock.mikozar, 4);
  assert.equal(t.hours, 19.75);
});

test('нет доз → no_stock, состояние не изменилось', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  const r = S.applyAction(s, { type: 'leaf', productId: 'mikozar', scope: 'cell', cell: 0 });
  assert.equal(r.error, 'no_stock');
  assert.equal(JSON.stringify(r.state), before);
});

test('не хватает часов на всю теплицу (8 ч) → no_hours, состояние не изменилось', () => {
  const s = fresh(); s.hours = 7; s.stock.gliokladin = 100;
  const before = JSON.stringify(s);
  const r = S.applyAction(s, { type: 'leaf', productId: 'gliokladin', scope: 'all' });
  assert.equal(r.error, 'no_hours');
  assert.equal(JSON.stringify(r.state), before);
});

test('повторная обработка: эффективность не растёт, срок максимальный, ресурсы списаны дважды', () => {
  const s = fresh(); s.stock.vlip = 5;
  let t = ok(S.applyAction(s, { type: 'leaf', productId: 'gliokladin', vlip: true, scope: 'cell', cell: 0 }));
  t = ok(S.applyAction(t, { type: 'leaf', productId: 'gliokladin', scope: 'cell', cell: 0 }));
  assert.equal(t.cells[0].leafProt.length, 1);
  assert.equal(AG.round(t.cells[0].leafProt[0].eff.botrytis, 2), 0.7);
  assert.equal(t.cells[0].leafProt[0].weeksLeft, 2);
  assert.equal(t.stock.gliokladin, 10);
  assert.equal(t.hours, 19.5);
});

test('заказ: обычный приходит позже, срочный сразу за ×1,5', () => {
  let t = ok(S.applyAction(fresh(), { type: 'order', productId: 'mikozar', doses: 10, urgent: false }));
  assert.equal(t.stock.mikozar || 0, 0);
  assert.equal(t.orders.length, 1);
  assert.equal(AG.round(t.budget, 2), AG.round(600 - 40 - 10, 2));
  t = ok(S.applyAction(fresh(), { type: 'order', productId: 'mikozar', doses: 10, urgent: true }));
  assert.equal(t.stock.mikozar, 10);
  assert.equal(AG.round(t.budget, 2), AG.round(600 - 40 - 15, 2));
});

test('нет денег → no_budget', () => {
  const s = fresh(); s.budget = 1;
  assert.equal(S.applyAction(s, { type: 'order', productId: 'mikozar', doses: 10 }).error, 'no_budget');
});

test('выпуск энтомофага без прибывшей партии → no_enemies_arrived; с партией — приживание', () => {
  const s = fresh();
  assert.equal(S.applyAction(s, { type: 'release', enemyId: 'swirskii', scope: 'cell', cell: 0 }).error, 'no_enemies_arrived');
  s.arrivedEnemies.swirskii = 6;
  const t = ok(S.applyAction(s, { type: 'release', enemyId: 'swirskii', scope: 'row', row: 0 }));
  assert.equal(t.arrivedEnemies.swirskii, 0);
  assert.deepEqual(t.cells[5].enemies.swirskii, { lvl: 1, age: 0, sachet: 4 });
});

test('химия по листу: потеря сбора 0,4; инсектоакарицид 0,7 и хищники клетки и 8 соседей = 0', () => {
  const s = fresh(); s.stock.chemFungLeaf = 2; s.stock.chemInsect = 2;
  s.cells[7].enemies.swirskii = { lvl: 2, age: 2, sachet: 2 };
  s.cells[14].enemies.phytoseiulus = { lvl: 2, age: 2, sachet: 0 };
  s.cells[20].enemies.phytoseiulus = { lvl: 2, age: 2, sachet: 0 };
  let t = ok(S.applyAction(s, { type: 'leaf', productId: 'chemFungLeaf', scope: 'cell', cell: 0 }));
  assert.equal(t.cells[0].chemLoss, 0.4);
  t = ok(S.applyAction(t, { type: 'leaf', productId: 'chemInsect', scope: 'cell', cell: 8 }));
  assert.equal(t.cells[8].chemLoss, 0.7);
  assert.deepEqual(t.cells[7].enemies, {});
  assert.deepEqual(t.cells[14].enemies, {});
  assert.ok(t.cells[20].enemies.phytoseiulus, 'не сосед — жив');
  assert.ok(t.mistakes.some(m => m.code === 'chem_killed_enemies'));
});

test('химия в мат снимает биозащиту ряда', () => {
  const s = S.newSeason(1, { disinfectDrip: true, matAtPlanting: 'gliokladin' }); s.stock.chemFungMat = 6;
  const t = ok(S.applyAction(s, { type: 'mat', productId: 'chemFungMat', scope: 'row', row: 1 }));
  assert.equal(t.rows[1].matProt, null);
  assert.ok(t.rows[2].matProt);
});

test('бактериоз: работа в ряду с бактериозом при конденсате без подогрева — заражение ~0,3', () => {
  let hits = 0; const n = 600;
  for (let k = 0; k < n; k++) {
    const s = fresh(k);
    s.climate = { hum: 2, temp: 'cold', mat: 'norm', cond: true };
    s.cells[0].dis.bacterial = { stage: 1, age: 0 };
    const t = ok(S.applyAction(s, { type: 'inspect', scope: 'cell', cell: 3 }));
    if (t.cells[3].dis.bacterial) hits++;
  }
  assert.ok(hits / n > 0.24 && hits / n < 0.36, String(hits / n));
});

test('бактериоз: с подогревом мокрой работы нет', () => {
  const s = fresh(); s.climate = { hum: 2, temp: 'cold', mat: 'norm', cond: true };
  s.levers.heat = true;
  s.cells[0].dis.bacterial = { stage: 2, age: 0 };
  for (let k = 0; k < 30; k++) {
    const t = ok(S.applyAction(s, { type: 'inspect', scope: 'cell', cell: 3 }));
    assert.equal(t.cells[3].dis.bacterial, undefined);
  }
});

test('рычаг: включение списывает деньги, выключение возвращает', () => {
  let t = ok(S.applyAction(fresh(), { type: 'lever', lever: 'heat', on: true }));
  assert.equal(t.levers.heat, true); assert.equal(AG.round(t.budget, 2), 548);
  t = ok(S.applyAction(t, { type: 'lever', lever: 'heat', on: false }));
  assert.equal(AG.round(t.budget, 2), 560);
  t = ok(S.applyAction(t, { type: 'lever', lever: 'irrigFix', on: true }));
  assert.equal(t.hours, 19);
});

test('ловушка: 0,1 ч и 0,1 тыс. ₽', () => {
  const t = ok(S.applyAction(fresh(), { type: 'trap', color: 'yellow', scope: 'cell', cell: 9 }));
  assert.equal(t.cells[9].trap, 'yellow');
  assert.equal(AG.round(t.hours, 2), 19.9);
});

test('после конца сезона → season_over', () => {
  const s = fresh(); s.over = true;
  assert.equal(S.applyAction(s, { type: 'inspect', scope: 'cell', cell: 0 }).error, 'season_over');
});

test('пачка действий: не хватает часов на все клетки → ошибка до применения', () => {
  const s = fresh(); s.hours = 0.6;
  const acts = [0, 1, 2].map(i => ({ type: 'leaf', productId: 'gliokladin', scope: 'cell', cell: i }));
  assert.equal(S.batchCheck(s, acts, null), 'no_hours');
  s.hours = 0.75;
  assert.equal(S.batchCheck(s, acts, null), null);
});

test('пачка действий: срочная докупка учитывается в бюджете', () => {
  const s = fresh(); s.budget = 1;
  const acts = [{ type: 'leaf', productId: 'mikozar', scope: 'row', row: 0 }];
  assert.equal(S.batchCheck(s, acts, { mikozar: 6 }), 'no_budget');
  s.budget = 9;
  assert.equal(S.batchCheck(s, acts, { mikozar: 6 }), null);
});
