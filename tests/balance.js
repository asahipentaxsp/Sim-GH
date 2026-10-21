// Балансовый прогон: node tests/balance.js [число сезонов]
// Цели (спецификация, раздел 16): nothing 45–55%, chemReactive 65–75%, bioIPM 85–90%,
// net(bioIPM) > net(chemReactive), bioIPM в пределах 600 тыс. ₽ и 20 ч/нед.
const AG = require('./load')();
const S = AG.sim, D = AG.DATA;
const N = Number(process.argv[2] || 1000);
const ALL = Array.from({ length: 36 }, (_, i) => i);

function act(s, a) {
  let r = S.applyAction(s, a);
  if (r.ok || r.error !== 'no_stock') return r.ok;
  const cost = S.actionCost(s, a);
  for (const [id, n] of Object.entries(cost.doses)) {
    const need = n - (s.stock[id] || 0);
    if (need > 0) S.applyAction(s, { type: 'order', productId: id, doses: need, urgent: true });
  }
  return S.applyAction(s, a).ok;
}
const seenDis = (s, i, kind, min) => Object.entries(s.cells[i].seen.dis).some(([id, st]) => D.diseases[id].kind === kind && st >= min);
const seenPest = (s, i, min, ids) => Object.entries(s.cells[i].seen.pests).some(([id, l]) => l >= min && (!ids || ids.includes(id)));

const strategies = {
  nothing: { prep: {}, week() {} },

  chemReactive: {
    prep: {},
    week(s) {
      // запас химии заказывается заранее, без срочной наценки
      for (const [id, n] of [['chemFungLeaf', 24], ['chemFungMat', 12], ['chemInsect', 12]])
        if ((s.stock[id] || 0) < n && !s.orders.some(o => o.id === id)) S.applyAction(s, { type: 'order', productId: id, doses: n });
      for (let k = 0; k < 12; k++) S.applyAction(s, { type: 'inspect', scope: 'cell', cell: (s.week * 12 + k) % 36 });
      const leafT = new Set(), rows = new Set(), insT = new Set();
      ALL.forEach(i => {
        if (seenDis(s, i, 'leaf', 2)) { leafT.add(i); S.neighbors4(i).forEach(j => leafT.add(j)); }
        if (seenDis(s, i, 'root', 3)) rows.add(S.rowOf(i));
        if (seenPest(s, i, 2)) insT.add(i);
      });
      for (const r of rows) act(s, { type: 'mat', productId: 'chemFungMat', scope: 'row', row: r });
      for (const i of leafT) act(s, { type: 'leaf', productId: 'chemFungLeaf', scope: 'cell', cell: i });
      for (const i of insT) act(s, { type: 'leaf', productId: 'chemInsect', scope: 'cell', cell: i });
    },
  },

  bioIPM: {
    // плановая потребность недели w в дозах (по расписанию ниже)
    needs(w) {
      const n = {};
      const add = (id, k) => { n[id] = (n[id] || 0) + k; };
      if (w % 4 === 0 && w < 16) add(w % 8 === 0 ? 'mikozar' : 'alirinGamair', 36);
      if (D.formationWeeks.includes(w)) { add('gliokladin', 36); add('vlip', 36); }
      else if (w >= 4 && w <= 9 && w % 2 === 1) { add('mikozar', 36); add('vlip', 36); }
      else if (w >= 10 && w % 2 === 0) { add('alirinGamair', 36); add('vlip', 36); }
      add('lovchiy', 4);
      return n;
    },
    prep: { disinfectGreenhouse: true, disinfectDrip: true, gliokladinStructures: true, seedlings: true, matAtPlanting: 'mikozar' },
    week(s) {
      const w = s.week, fc = s.forecast || {};
      const clim = s.climate;
      // климат: конденсат, перелив, перегрев, сушь с клещом
      if (clim.cond) act(s, { type: 'lever', lever: 'heat', on: true });
      if (clim.mat === 'flood') act(s, { type: 'lever', lever: 'irrigFix', on: true });
      if (clim.mat === 'hot') act(s, { type: 'lever', lever: 'coolMat', on: true });
      if (clim.hum === 3) act(s, { type: 'lever', lever: 'vent', on: true });
      // биозащита матов раз в 4 недели
      if (w % 4 === 0 && w < 16) act(s, { type: 'mat', productId: w % 8 === 0 ? 'mikozar' : 'alirinGamair', scope: 'all' });
      // лист: формирование — Глиокладин с Влипом; осень с риском капельной влаги — Микозар с Влипом
      if (D.formationWeeks.includes(w)) act(s, { type: 'leaf', productId: 'gliokladin', vlip: true, scope: 'all' });
      else if (w >= 4 && w <= 9 && (fc.cond || fc.hum >= 2 || clim.hum >= 2) && w % 2 === 1)
        act(s, { type: 'leaf', productId: 'mikozar', vlip: true, scope: 'all' });
      else if (w >= 10 && w % 2 === 0) act(s, { type: 'leaf', productId: 'alirinGamair', vlip: true, scope: 'all' });
      // энтомофаги: свирский пакетиками
      if (w === 1) S.applyAction(s, { type: 'order', enemyId: 'swirskii', doses: 36 });
      if (w === 2) S.applyAction(s, { type: 'release', enemyId: 'swirskii', scope: 'all' });
      // ловушки
      if (w === 1) for (const i of [7, 10, 25, 28]) S.applyAction(s, { type: 'trap', color: i < 20 ? 'yellow' : 'blue', scope: 'cell', cell: i });
      // гигиена лотков
      if (w % 3 === 0) S.applyAction(s, { type: 'trayHygiene', scope: 'all' });
      // очаги: санитария, клещ — калифорникус срочно, трипс/белокрылка — Ловчий
      ALL.forEach(i => {
        if (seenDis(s, i, 'leaf', 3) || seenDis(s, i, 'root', 4)) act(s, { type: 'sanitize', scope: 'cell', cell: i });
      });
      const miteCells = ALL.filter(i => seenPest(s, i, 2, ['mite']));
      if (miteCells.length) {
        S.applyAction(s, { type: 'order', enemyId: 'californicus', doses: miteCells.length, urgent: true });
        for (const i of miteCells) S.applyAction(s, { type: 'release', enemyId: 'californicus', scope: 'cell', cell: i });
      }
      ALL.filter(i => seenPest(s, i, 2, ['thrips', 'whitefly'])).forEach(i => act(s, { type: 'leaf', productId: 'lovchiy', scope: 'cell', cell: i }));
      // заказ на следующую неделю без срочной наценки
      for (const [id, k] of Object.entries(strategies.bioIPM.needs(w + 1))) {
        const need = k - (s.stock[id] || 0);
        if (need > 0 && w < 16) S.applyAction(s, { type: 'order', productId: id, doses: need });
      }
      // обход по оставшимся часам
      for (let k = 0; k < 6; k++) S.applyAction(s, { type: 'inspect', scope: 'cell', cell: (w * 7 + k * 5) % 36 });
    },
  },
};

function run(name, seed) {
  const st = strategies[name];
  const s = S.newSeason(seed, st.prep);
  let minHours = 20;
  while (!s.over) { st.week(s); minHours = Math.min(minHours, s.hours); S.endWeek(s, s.week); }
  const f = S.finalReport(s);
  return { pct: f.pctPotential, net: f.net, spend: f.spend, budgetLeft: s.budget, minHours };
}

module.exports = { strategies, run };
if (require.main === module) main();
function main() {
const out = {};
for (const name of Object.keys(strategies)) {
  const rs = [];
  for (let k = 1; k <= N; k++) rs.push(run(name, k * 7919));
  const avg = key => rs.reduce((a, r) => a + r[key], 0) / rs.length;
  const pcts = rs.map(r => r.pct).sort((a, b) => a - b);
  out[name] = { pct: avg('pct'), p10: pcts[Math.floor(N * 0.1)], p90: pcts[Math.floor(N * 0.9)], net: avg('net'), spend: avg('spend'),
    minBudget: Math.min(...rs.map(r => r.budgetLeft)), minHours: Math.min(...rs.map(r => r.minHours)) };
  const o = out[name];
  console.log(`${name.padEnd(13)} урожай ${o.pct.toFixed(1)}% (p10 ${o.p10.toFixed(1)}, p90 ${o.p90.toFixed(1)})  расходы ${o.spend.toFixed(0)}  чистый ${o.net.toFixed(0)}  мин.бюджет ${o.minBudget.toFixed(0)}`);
}
const ok = out.nothing.pct >= 45 && out.nothing.pct <= 55 && out.chemReactive.pct >= 65 && out.chemReactive.pct <= 75 &&
  out.bioIPM.pct >= 85 && out.bioIPM.pct <= 90 && out.bioIPM.net > out.chemReactive.net && out.bioIPM.minBudget >= -0.01;
console.log(ok ? 'БАЛАНС: OK' : 'БАЛАНС: не в целевых коридорах');
process.exitCode = ok ? 0 : 1;
}
