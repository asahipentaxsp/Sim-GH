const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const S = AG.sim;
const NORM = { hum: 1, temp: 'norm', mat: 'norm', cond: false };
const ALWAYS = () => 0, NEVER = () => 0.999999;
const fresh = () => { const s = S.newSeason(1, { disinfectDrip: true }); s.week = 5; return s; };

test('клещ: +2 при сухо и жаре, +1 при одном, без появления новых при NEVER', () => {
  const s = fresh();
  s.cells[0].pests.mite = 1; s.cells[20].pests.mite = 1;
  S.growPests(s, { ...NORM, hum: 0, temp: 'hot' }, NEVER);
  assert.equal(s.cells[0].pests.mite, 3);
  S.growPests(s, { ...NORM, hum: 0 }, NEVER);
  assert.equal(s.cells[0].pests.mite, 4);
});

test('белокрылка: +1 в жару, 0,5 в норме', () => {
  const s = fresh();
  s.cells[0].pests.whitefly = 1;
  S.growPests(s, { ...NORM, temp: 'hot' }, NEVER);
  assert.equal(s.cells[0].pests.whitefly, 2);
  S.growPests(s, NORM, NEVER);
  assert.equal(s.cells[0].pests.whitefly, 2);
  S.growPests(s, NORM, ALWAYS);
  assert.equal(s.cells[0].pests.whitefly, 3);
});

test('распространение вредителей при плотности ≥2 на 4 соседей', () => {
  const s = fresh();
  s.cells[14].pests.thrips = 2;
  S.spreadPests(s, NORM, ALWAYS);
  for (const j of S.neighbors4(14)) assert.equal(s.cells[j].pests.thrips, 1);
  assert.equal(s.cells[0].pests.thrips || 0, 0);
});

test('потери от вредителей и сажистый гриб', () => {
  const c = { pests: { whitefly: 3 } };
  const L = AG.DATA.pestLoss;
  assert.equal(AG.round(S.pestLoss(c), 3), AG.round(1 - (1 - L[3]) * (1 - 0.1), 3));
  assert.equal(AG.round(S.pestLoss({ pests: { mite: 2 } }), 3), L[2]);
  assert.equal(AG.round(S.pestLoss({ pests: { psychoda: 2 } }), 3), 0.06);
});

test('энтомофаг: неделя приживания без эффекта, затем −1 добычи; на уровне 3 −2', () => {
  const s = fresh();
  s.cells[0].pests.thrips = 3;
  s.cells[0].enemies.cucumeris = { lvl: 1, age: 0, sachet: 4 };
  S.stepEnemies(s, NORM);
  assert.equal(s.cells[0].pests.thrips, 3);
  S.stepEnemies(s, NORM);
  assert.equal(s.cells[0].pests.thrips, 2);
  assert.equal(s.cells[0].enemies.cucumeris.lvl, 3); // была добыча ≥2 → рост
  s.cells[0].pests.thrips = 4;
  S.stepEnemies(s, NORM);
  assert.equal(s.cells[0].pests.thrips, 2);
});

test('фитосейулюс без эффекта при сухо + жара; калифорникус работает', () => {
  const s = fresh();
  const dh = { ...NORM, hum: 0, temp: 'hot' };
  s.cells[0].pests.mite = 3; s.cells[0].enemies.phytoseiulus = { lvl: 2, age: 2, sachet: 0 };
  s.cells[1].pests.mite = 3; s.cells[1].enemies.californicus = { lvl: 2, age: 2, sachet: 0 };
  S.stepEnemies(s, dh);
  assert.equal(s.cells[0].pests.mite, 3);
  assert.equal(s.cells[1].pests.mite, 2);
});

test('энкарзия без эффекта в неделю холодной ночи', () => {
  const s = fresh();
  s.cells[0].pests.whitefly = 2; s.cells[0].enemies.encarsia = { lvl: 2, age: 2, sachet: 0 };
  S.stepEnemies(s, { ...NORM, temp: 'cold' });
  assert.equal(s.cells[0].pests.whitefly, 2);
  S.stepEnemies(s, NORM);
  assert.equal(s.cells[0].pests.whitefly, 1);
});

test('пакетик свирского держится 4 недели без добычи, обычный хищник вымирает', () => {
  const s = fresh();
  s.cells[0].enemies.swirskii = { lvl: 1, age: 0, sachet: 4 };
  s.cells[1].enemies.phytoseiulus = { lvl: 2, age: 2, sachet: 0 };
  S.stepEnemies(s, NORM); // приживание
  for (let k = 0; k < 4; k++) { S.stepEnemies(s, NORM); assert.ok(s.cells[0].enemies.swirskii, 'неделя ' + k); }
  S.stepEnemies(s, NORM); S.stepEnemies(s, NORM);
  assert.equal(s.cells[0].enemies.swirskii, undefined);
  assert.equal(s.cells[1].enemies.phytoseiulus, undefined);
});

test('Боверин: психоды −2 уровня в ряду', () => {
  const s = fresh();
  s.cells[2].pests.psychoda = 3; s.cells[8].pests.psychoda = 3;
  s.weekActions.push({ type: 'mat', productId: 'boverin', cells: S.rowCells(0), rows: [0] });
  S.applyPestTreatments(s, ALWAYS);
  assert.equal(s.cells[2].pests.psychoda, 1);
  assert.equal(s.cells[8].pests.psychoda, 3);
});

test('Ловчий: трипсы и белокрылка −1; Эндобактерин: клещ и трипсы −1', () => {
  const s = fresh();
  s.cells[0].pests = { thrips: 2, whitefly: 2, mite: 2 };
  s.cells[1].pests = { thrips: 2, whitefly: 2, mite: 2 };
  s.weekActions.push({ type: 'leaf', productId: 'lovchiy', cells: [0] });
  s.weekActions.push({ type: 'leaf', productId: 'endobacterin', cells: [1] });
  S.applyPestTreatments(s, ALWAYS);
  assert.deepEqual(s.cells[0].pests, { thrips: 1, whitefly: 1, mite: 2 });
  assert.deepEqual(s.cells[1].pests, { thrips: 1, whitefly: 2, mite: 1 });
  const t = fresh(); t.cells[0].pests = { thrips: 2 };
  t.weekActions.push({ type: 'leaf', productId: 'lovchiy', cells: [0] });
  S.applyPestTreatments(t, () => 0.75);
  assert.equal(t.cells[0].pests.thrips, 2, 'с вероятностью 0,3 не сработал');
});

test('инсектоакарицид: все вредители −2', () => {
  const s = fresh();
  s.cells[0].pests = { thrips: 3, whitefly: 1, mite: 4 };
  s.weekActions.push({ type: 'leaf', productId: 'chemInsect', cells: [0] });
  S.applyPestTreatments(s, ALWAYS);
  assert.deepEqual(s.cells[0].pests, { thrips: 1, whitefly: 0, mite: 2 });
});

test('психоды появляются только при переливе или 4+ недели без гигиены', () => {
  const s = fresh();
  S.appearPests(s, NORM, ALWAYS);
  assert.ok(s.cells.every(c => !c.pests.psychoda));
  S.appearPests(s, { ...NORM, mat: 'flood' }, ALWAYS);
  assert.ok(s.cells.every(c => c.pests.psychoda === 1));
  const t = fresh(); t.rows[3].noHygieneWeeks = 4;
  S.appearPests(t, NORM, ALWAYS);
  assert.equal(t.cells[18].pests.psychoda, 1);
  assert.ok(!t.cells[0].pests.psychoda);
});

test('ловушки: жёлтая — белокрылка и психоды в 3×3, синяя — трипсы', () => {
  const s = fresh();
  s.cells[14].trap = 'yellow';
  s.cells[7].pests = { whitefly: 1, thrips: 2, psychoda: 1 };
  s.cells[0].pests = { whitefly: 2 };
  S.refreshSeenPests(s);
  assert.deepEqual(s.cells[7].seen.pests, { whitefly: 1, psychoda: 1 });
  assert.deepEqual(s.cells[0].seen.pests, {});
  assert.deepEqual(S.trapView(s, 14), { whitefly: 1, psychoda: 1 });
  s.cells[14].trap = 'blue';
  S.refreshSeenPests(s);
  assert.deepEqual(s.cells[7].seen.pests, { thrips: 2 });
});

test('плотность ≥3 видна без обхода', () => {
  const s = fresh();
  s.cells[5].pests = { mite: 3, thrips: 1 };
  S.refreshSeenPests(s);
  assert.deepEqual(s.cells[5].seen.pests, { mite: 3 });
});
