const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const S = AG.sim;
const NORM = { hum: 1, temp: 'norm', mat: 'norm', cond: false };
const ALWAYS = () => 0, NEVER = () => 0.999999;
const fresh = (week = 5) => { const s = S.newSeason(1, { disinfectDrip: true }); s.week = week; s.climate = { ...NORM }; return s; };
const infected = (s, id) => s.cells.map((c, i) => (c.dis[id] ? i : -1)).filter(i => i >= 0);

test('корневые гнили распространяются только по ряду на соседние клетки', () => {
  const s = fresh();
  s.cells[2].dis.rootRot = { stage: 2, age: 0 };
  S.rollInfections(s, NORM, ALWAYS);
  assert.deepEqual(infected(s, 'rootRot'), [1, 2, 3]);
});

test('crazy root: на любую клетку ряда; при обеззараживании раствора давление ×0,5', () => {
  const s = fresh();
  s.cells[7].dis.crazyRoot = { stage: 2, age: 0 };
  S.rollInfections(s, NORM, ALWAYS);
  assert.deepEqual(infected(s, 'crazyRoot'), [6, 7, 8, 9, 10, 11]);
  assert.equal(AG.round(S.infectionProb(fresh(), 8, 'crazyRoot', S.flags(NORM), { 8: 0.15 }), 4), 0.15);
  const d = fresh(); d.solutionDisinfected = true;
  d.cells[7].dis.crazyRoot = { stage: 2, age: 0 };
  assert.equal(AG.round(S.infectionProb(d, 8, 'crazyRoot', S.flags(NORM)), 4), 0.075);
});

test('crazy root: максимум стадия 3, потеря 0,25 на стадиях 2–3', () => {
  const s = fresh();
  s.cells[0].dis.crazyRoot = { stage: 3, age: 0 };
  S.progress(s, { ...NORM, mat: 'flood' }, ALWAYS);
  assert.equal(s.cells[0].dis.crazyRoot.stage, 3);
  assert.equal(S.worstLoss(s.cells[0]), 0.25);
  s.cells[0].dis.crazyRoot.stage = 2;
  assert.equal(S.worstLoss(s.cells[0]), 0.25);
});

test('очаг crazy root на неделе 2 без дезинфекции капельной системы: 2 клетки в разных рядах', () => {
  const s = S.newSeason(11, {}); s.week = 2;
  S.rollInfections(s, NORM, NEVER);
  const c = infected(s, 'crazyRoot');
  assert.equal(c.length, 2);
  assert.notEqual(S.rowOf(c[0]), S.rowOf(c[1]));
});

test('мучнистая роса: 8 соседей + прыжок', () => {
  const s = fresh();
  s.cells[14].dis.powdery = { stage: 2, age: 0 };
  const p = S.pressure(s, 'powdery', S.flags(NORM));
  for (const j of S.neighbors8(14)) assert.equal(AG.round(p[j], 3), 0.2, 'сосед ' + j);
  assert.equal(p[35], 0);
  assert.deepEqual(S.jumps(s, 'powdery', ALWAYS), [0]);
  assert.deepEqual(S.jumps(s, 'powdery', NEVER), []);
});

test('пероноспороз: давление 0,35 при влажности ≥2, иначе 0,1; при конденсате +2 стадии', () => {
  const s = fresh();
  s.cells[14].dis.downy = { stage: 2, age: 0 };
  assert.equal(AG.round(S.pressure(s, 'downy', S.flags({ ...NORM, hum: 2 }))[15], 4), 0.35);
  assert.equal(AG.round(S.pressure(s, 'downy', S.flags(NORM))[15], 4), 0.1);
  S.progress(s, { hum: 2, temp: 'cold', mat: 'norm', cond: true }, ALWAYS);
  assert.equal(s.cells[14].dis.downy.stage, 4);
});

test('неделя формирования удваивает базу серой гнили и аскохитоза', () => {
  const f = S.flags({ ...NORM, hum: 2 });
  assert.equal(AG.round(S.baseProb(fresh(5), 0, 'botrytis', f), 4), 0.03);
  assert.equal(AG.round(S.baseProb(fresh(6), 0, 'botrytis', f), 4), 0.06);
  assert.equal(AG.round(S.baseProb(fresh(6), 0, 'ascochyta', f), 4), 0.04);
});

test('серая гниль: холодная ночь +0,02 к базе', () => {
  assert.equal(AG.round(S.baseProb(fresh(5), 0, 'botrytis', S.flags({ hum: 3, temp: 'cold', mat: 'norm', cond: true })), 4), 0.09);
});

test('защита 0,6 → вероятность ×0,4', () => {
  const s = fresh(5);
  const f = S.flags({ ...NORM, hum: 3 });
  const p0 = S.infectionProb(s, 0, 'botrytis', f);
  s.cells[0].leafProt.push({ productId: 'gliokladin', eff: { botrytis: 0.6 }, weeksLeft: 1 });
  assert.equal(AG.round(S.infectionProb(s, 0, 'botrytis', f), 5), AG.round(p0 * 0.4, 5));
});

test('защита мата затухает: 1 / 1 / 0,75 / 0,5 / 0', () => {
  const s = fresh();
  s.rows[0].matProt = { productId: 'gliokladin', eff: { rootRot: 0.8 }, age: 0 };
  const e = [0, 1, 2, 3, 4].map(age => { s.rows[0].matProt.age = age; return AG.round(S.protectionEff(s, 0, 'rootRot'), 3); });
  assert.deepEqual(e, [0.8, 0.8, 0.6, 0.4, 0]);
});

test('биопрепарат: стадия 1 излечена при удаче, стадия 2 остановлена, 3 без эффекта', () => {
  const s = fresh();
  s.cells[0].dis.botrytis = { stage: 1, age: 0 };
  s.cells[1].dis.botrytis = { stage: 2, age: 0 };
  s.cells[2].dis.botrytis = { stage: 3, age: 0 };
  for (const i of [0, 1, 2]) s.cells[i].leafProt.push({ productId: 'gliokladin', eff: { botrytis: 0.6 }, weeksLeft: 1 });
  s.weekActions.push({ type: 'leaf', productId: 'gliokladin', cells: [0, 1, 2] });
  S.applyTreatments(s, ALWAYS);
  assert.equal(s.cells[0].dis.botrytis, undefined);
  assert.equal(s.cells[1].dis.botrytis.hold, true);
  S.progress(s, { ...NORM, hum: 3 }, ALWAYS);
  assert.equal(s.cells[1].dis.botrytis.stage, 2);
  assert.equal(s.cells[2].dis.botrytis.stage, 4);
});

test('биопрепарат в мат лечит корневую гниль стадии 1 в ряду', () => {
  const s = fresh();
  s.cells[3].dis.rootRot = { stage: 1, age: 1 };
  s.rows[0].matProt = { productId: 'mikozar', eff: { rootRot: 0.8 }, age: 0 };
  s.weekActions.push({ type: 'mat', productId: 'mikozar', cells: S.rowCells(0), rows: [0] });
  S.applyTreatments(s, ALWAYS);
  assert.equal(s.cells[3].dis.rootRot, undefined);
});

test('химия по листу: стадия ≥2 снижается на cure.d с вероятностью 0,9; в мат — корневые гнили', () => {
  const s = fresh();
  s.cells[0].dis.powdery = { stage: 3, age: 0 };
  s.cells[0].dis.rootRot = { stage: 3, age: 0 };
  s.cells[1].dis.rootRot = { stage: 2, age: 0 };
  s.weekActions.push({ type: 'leaf', productId: 'chemFungLeaf', cells: [0] });
  s.weekActions.push({ type: 'mat', productId: 'chemFungMat', cells: S.rowCells(0), rows: [0] });
  S.applyTreatments(s, ALWAYS);
  const d = AG.DATA.products.chemFungLeaf.cure.d;
  assert.equal(s.cells[0].dis.powdery.stage, 3 - d);
  assert.equal(s.cells[0].dis.rootRot.stage, 3 - AG.DATA.products.chemFungMat.cure.d);
  assert.equal(s.cells[1].dis.rootRot, undefined, 'стадия 2 вылечена полностью');
  const t = fresh(); t.cells[0].dis.powdery = { stage: 3, age: 0 };
  t.weekActions.push({ type: 'leaf', productId: 'chemFungLeaf', cells: [0] });
  S.applyTreatments(t, () => 0.95);
  assert.equal(t.cells[0].dis.powdery.stage, 3, 'в 10% не сработала');
});

test('санитария: болезни клетки сняты, потеря 0,3 на 2 недели', () => {
  const s = fresh();
  s.cells[4].dis.downy = { stage: 4, age: 0 };
  s.weekActions.push({ type: 'sanitize', cells: [4] });
  S.applyTreatments(s, ALWAYS);
  assert.deepEqual(s.cells[4].dis, {});
  assert.equal(s.cells[4].sanitizeWeeks, 2);
});

test('латентность: заражённая на этой неделе клетка не прогрессирует; через латентность → стадия 2', () => {
  const s = fresh();
  s.cells[0].dis.rootRot = { stage: 1, age: 0, fresh: true };
  S.progress(s, NORM, ALWAYS);
  assert.equal(s.cells[0].dis.rootRot.stage, 1);
  S.progress(s, NORM, ALWAYS);
  assert.equal(s.cells[0].dis.rootRot.stage, 1);
  S.progress(s, NORM, ALWAYS);
  assert.equal(s.cells[0].dis.rootRot.stage, 2);
});

test('без благоприятных условий развитие с вероятностью 0,5', () => {
  const s = fresh();
  s.cells[0].dis.downy = { stage: 2, age: 0 };
  S.progress(s, NORM, NEVER);
  assert.equal(s.cells[0].dis.downy.stage, 2);
  S.progress(s, NORM, () => 0.4);
  assert.equal(s.cells[0].dis.downy.stage, 3);
});

test('психоды в ряду: корневым гнилям ряда +0,03', () => {
  const s = fresh();
  const f = S.flags(NORM);
  assert.equal(S.baseProb(s, 3, 'rootRot', f), 0);
  s.cells[1].pests.psychoda = 1;
  assert.equal(AG.round(S.baseProb(s, 3, 'rootRot', f), 4), 0.03);
  assert.equal(S.baseProb(s, 9, 'rootRot', f), 0);
});

test('видимость: 3–4 всегда, 2 — примерно в 30% без обхода, 1 — никогда', () => {
  let seen2 = 0; const n = 1000;
  const s = fresh();
  s.cells[0].dis.powdery = { stage: 3, age: 0 };
  s.cells[1].dis.powdery = { stage: 2, age: 0 };
  s.cells[2].dis.powdery = { stage: 1, age: 0 };
  const rng = AG.makeRng(5);
  for (let k = 0; k < n; k++) {
    S.refreshSeen(s, rng);
    assert.equal(s.cells[0].seen.dis.powdery, 3);
    assert.equal(s.cells[2].seen.dis.powdery, undefined);
    if (s.cells[1].seen.dis.powdery === 2) seen2++;
  }
  assert.ok(seen2 / n > 0.25 && seen2 / n < 0.35, String(seen2 / n));
});

test('множители подготовки действуют в недели 1–4 и не действуют на 5-й', () => {
  const f = S.flags({ ...NORM, hum: 3 });
  const prep = { disinfectGreenhouse: true, gliokladinStructures: true, disinfectDrip: true };
  const a = S.newSeason(1, prep); a.week = 4;
  const b = S.newSeason(1, prep); b.week = 5;
  assert.equal(AG.round(S.baseProb(a, 0, 'botrytis', f), 4), AG.round(0.07 * 0.25, 4));
  assert.equal(AG.round(S.baseProb(a, 0, 'downy', f), 4), 0.025);
  assert.equal(AG.round(S.baseProb(b, 0, 'botrytis', f), 4), 0.07);
});

test('ошибка formation_unprotected при заражении серой гнилью в неделю формирования без защиты', () => {
  const s = fresh(6);
  S.rollInfections(s, { hum: 3, temp: 'norm', mat: 'norm', cond: false }, ALWAYS);
  assert.ok(s.mistakes.some(m => m.code === 'formation_unprotected'));
});

test('ошибка late_detection при переходе в стадию 3 незамеченной болезни', () => {
  const s = fresh();
  s.cells[0].dis.powdery = { stage: 2, age: 0 };
  S.progress(s, { ...NORM, hum: 0 }, ALWAYS);
  assert.ok(s.mistakes.some(m => m.code === 'late_detection'));
  const t = fresh();
  t.cells[0].dis.powdery = { stage: 2, age: 0, spotted: true };
  S.progress(t, { ...NORM, hum: 0 }, ALWAYS);
  assert.ok(!t.mistakes.some(m => m.code === 'late_detection'));
});
