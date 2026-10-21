// Состояние сезона, геометрия поля, неделя 0 (подготовка).
// Поле: ряд r (линия матов с общим капельным поливом) × секция c. Индекс i = r*6 + c.
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim;
  const R = D.rows, C = D.cols;

  S.rowOf = i => Math.floor(i / C);
  S.colOf = i => i % C;
  S.rowCells = r => Array.from({ length: C }, (_, c) => r * C + c);
  S.neighbors4 = function (i) {
    const r = S.rowOf(i), c = S.colOf(i), out = [];
    if (c > 0) out.push(i - 1);
    if (c < C - 1) out.push(i + 1);
    if (r > 0) out.push(i - C);
    if (r < R - 1) out.push(i + C);
    return out;
  };
  S.neighbors8 = function (i) {
    const r = S.rowOf(i), c = S.colOf(i), out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < R && cc >= 0 && cc < C) out.push(rr * C + cc);
    }
    return out;
  };

  S.parseSeed = function (input) {
    const t = String(input == null ? '' : input).trim();
    if (!t) { const seed = Math.floor(Math.random() * 1e6); return { seed, shown: String(seed) }; }
    if (/^\d+$/.test(t)) return { seed: Number(t) >>> 0, shown: t };
    return { seed: AG.hashSeed(t), shown: t };
  };

  function newCell() {
    return { dis: {}, pests: {}, enemies: {}, leafProt: [], seen: { dis: {}, pests: {} },
      trap: null, sanitizeWeeks: 0, chemLoss: 0, wetHit: false };
  }

  S.newSeason = function (seed, prep) {
    prep = prep || {};
    const s = {
      seed: seed >>> 0, rngState: seed >>> 0, week: 1, over: false,
      budget: D.start.budget, hours: D.start.hours,
      stock: AG.clone(D.start.stock), orders: [], arrivedEnemies: {},
      climate: null, forecast: null, levers: {},
      cells: Array.from({ length: R * C }, newCell),
      rows: Array.from({ length: R }, () => ({ matProt: null, noHygieneWeeks: 0, chemMatWeek: 0 })),
      prepMult: { leaf: 1, botAsco: 1, rootEarly: 1 },
      crazySourceWeek: prep.disinfectDrip ? null : 2,
      solutionDisinfected: false,
      totals: { kg: 0, potentialKg: 0, lostKg: 0, revenue: 0, spend: { prep: 0, products: 0, enemies: 0, climate: 0 } },
      events: [], mistakes: [], weekActions: [], log: [], history: [],
    };
    for (const k of Object.keys(D.prep)) if (prep[k]) {
      s.budget -= D.prep[k].price; s.totals.spend.prep += D.prep[k].price;
    }
    if (prep.disinfectGreenhouse) { s.prepMult.leaf = 0.5; s.prepMult.botAsco = 0.5; }
    if (prep.gliokladinStructures) s.prepMult.botAsco *= 0.5;
    if (prep.seedlings) s.prepMult.rootEarly = 0.3;
    if (prep.matAtPlanting) {
      const p = D.products[prep.matAtPlanting];
      const cost = p.price * R * C;
      s.budget -= cost; s.totals.spend.products += cost;
      for (const row of s.rows) row.matProt = { productId: prep.matAtPlanting, eff: AG.clone(p.mat), age: 0 };
    }
    if (S.rollClimate) {
      s.climate = S.rollClimate(s, 1);
      s.nextClimate = S.rollClimate(s, 2); // скрыто от игрока
      s.forecast = S.rollForecast(s, s.nextClimate, 2);
    }
    return s;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
