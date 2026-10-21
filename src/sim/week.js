// Конец недели: строгий порядок расчёта (спецификация, раздел 5), урожай, разбор, финал.
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim;
  const N = D.rows * D.cols;
  const FULL_KG = D.yieldCurve.reduce((a, b) => a + b, 0) * 10000;

  S.cellHarvest = function (cell, week) {
    const pot = D.yieldCurve[week] * D.cellArea;
    const keep = (1 - S.worstLoss(cell)) * (1 - S.pestLoss(cell)) * (1 - (cell.chemLoss || 0)) *
      (1 - (cell.sanitizeWeeks > 0 ? D.sanitizeLoss : 0));
    return pot * keep;
  };

  const flagPhrase = {
    cond: 'конденсат на листьях после холодной ночи', humVHigh: 'очень высокая влажность', humHigh: 'высокая влажность',
    dry: 'сухой воздух', hot: 'жара', cold: 'холодная ночь', matHot: 'перегрев матов', matFlood: 'перелив матов',
  };
  const rowsText = cells => {
    const rows = [...new Set(cells.map(i => S.rowOf(i) + 1))].sort((a, b) => a - b);
    return (rows.length === 1 ? 'ряд ' : 'ряды ') + rows.join(', ');
  };
  const cellsWord = n => n % 10 === 1 && n % 100 !== 11 ? 'клетке' : 'клетках';

  function causeText(state, id, f, cells) {
    const dz = D.diseases[id], parts = [];
    for (const [flag] of [...dz.base.max, ...(dz.base.add || [])]) if (f[flag] && flagPhrase[flag]) parts.push(flagPhrase[flag]);
    if (dz.formation && D.formationWeeks.includes(state.week)) parts.push('раны после формирования растений');
    if (!parts.length) parts.push('распространение от соседних очагов');
    const unprot = cells.filter(i => !S.protectionEff(state, i, id)).length;
    if (unprot) parts.push(dz.kind === 'leaf' ? 'лист без защиты' : 'мат без биозащиты');
    return parts.join(', ');
  }

  // Видимые итоги недели для разбора: до 4 событий, по весу ущерба.
  function review(state, f, before, chemCells, harvestLossPct) {
    const ev = [];
    const name = id => (D.text.ref[id] || {}).name || id;
    for (const id of Object.keys(D.diseases)) {
      const cells = [];
      state.cells.forEach((c, i) => { const v = c.seen.dis[id]; if (v >= 2 && !(before[i].dis[id] >= v)) cells.push(i); });
      if (!cells.length) continue;
      const w = cells.reduce((s, i) => s + state.cells[i].dis[id].stage, 0);
      ev.push({ week: state.week, code: 'disease', id, cells, weight: w * 3,
        text: `${name(id)}: симптомы в ${cells.length} ${cellsWord(cells.length)} (${rowsText(cells)}). Причина: ${causeText(state, id, f, cells)}.` });
    }
    for (const id of Object.keys(D.pests)) {
      const cells = [];
      state.cells.forEach((c, i) => { const v = c.seen.pests[id]; if (v >= 3 && !(before[i].pests[id] >= v)) cells.push(i); });
      if (!cells.length) continue;
      ev.push({ week: state.week, code: 'pest', id, cells, weight: cells.length * 4,
        text: `${name(id)}: высокая численность в ${cells.length} ${cellsWord(cells.length)} (${rowsText(cells)}). ${D.text.ref[id].conditions}` });
    }
    if (chemCells.length) ev.push({ week: state.week, code: 'chem', cells: chemCells, weight: chemCells.length * 2,
      text: `Срок ожидания после химии: сбор в ${chemCells.length} ${cellsWord(chemCells.length)} сократился.` });
    if (f.cond) ev.push({ week: state.week, code: 'cond', cells: [], weight: 5,
      text: 'Конденсат на листьях: идеальные условия для пероноспороза и бактериоза. Подогрев труб снимает его.' });
    if (f.matFlood) ev.push({ week: state.week, code: 'flood', cells: [], weight: 4,
      text: 'Перелив матов: корневые гнили и психоды получили преимущество. Коррекция полива стоит 1 час.' });
    if (f.matHot) ev.push({ week: state.week, code: 'hotmat', cells: [], weight: 4,
      text: 'Перегрев матов выше 30°: главный триггер питиоза. Нужно охлаждение раствора.' });
    if (!ev.length) ev.push({ week: state.week, code: 'calm', cells: [], weight: 0,
      text: harvestLossPct > 1 ? `Новых видимых очагов нет. Потери урожая на неделе — ${AG.round(harvestLossPct)}%.` : 'Неделя прошла спокойно: новых видимых очагов нет.' });
    return ev.sort((a, b) => b.weight - a.weight).slice(0, 4);
  }

  S.endWeek = function (state, expectedWeek) {
    if (state.over) return { ok: false, error: 'season_over', state, events: [] };
    if (expectedWeek != null && expectedWeek !== state.week) return { ok: false, error: 'stale', state, events: [] };
    const rng = AG.stateRng(state);
    const clim = S.effectiveClimate(state.climate, state.levers);
    const f = S.flags(clim);
    const before = state.cells.map(c => ({ dis: { ...c.seen.dis }, pests: { ...c.seen.pests } }));

    // 1. обработки этой недели
    S.applyTreatments(state, rng);
    S.applyPestTreatments(state, rng);
    // 2–3. болезни
    S.rollInfections(state, clim, rng);
    S.progress(state, clim, rng);
    // 4. вредители, затем энтомофаги
    S.appearPests(state, clim, rng);
    S.growPests(state, clim, rng);
    S.spreadPests(state, clim, rng);
    S.stepEnemies(state, clim);
    // 5. урожай
    let kg = 0; const chemCells = [];
    const pot = D.yieldCurve[state.week] * 10000;
    state.cells.forEach((c, i) => { kg += S.cellHarvest(c, state.week); if (c.chemLoss) chemCells.push(i); });
    state.totals.kg += kg; state.totals.potentialKg += pot; state.totals.lostKg += pot - kg;
    state.totals.revenue += kg * D.pricePerKg;
    // 6. ошибки, старение защиты, закрытие недели
    const m = code => state.mistakes.push({ week: state.week, code, cells: [] });
    if (f.cond) m('condensate_unheated');
    if (f.matFlood) m('flood_ignored');
    if (f.matHot) m('hot_mat_ignored');
    if (Object.values(state.arrivedEnemies).some(n => n > 0)) m('enemies_wasted');
    state.arrivedEnemies = {};

    for (const c of state.cells) {
      c.leafProt = c.leafProt.map(p => ({ ...p, weeksLeft: p.weeksLeft - 1 })).filter(p => p.weeksLeft > 0);
      if (c.sanitizeWeeks > 0) c.sanitizeWeeks--;
      c.chemLoss = 0;
    }
    for (const r of state.rows) {
      if (r.matProt) { r.matProt.age++; if (r.matProt.age >= D.matDecay.length) r.matProt = null; }
      r.noHygieneWeeks++;
    }
    state.history.push({ week: state.week, climate: clim, kg, potential: pot });
    S.refreshSeen(state, rng);
    S.refreshSeenPests(state);
    const events = review(state, f, before, chemCells, pot ? (1 - kg / pot) * 100 : 0);
    state.events.push(...events);

    state.weekActions = []; state.levers = {}; state.solutionDisinfected = false;
    state.hours = D.start.hours;
    if (state.week >= D.weeks) { state.over = true; return { ok: true, state, events }; }
    state.week++;
    state.climate = state.nextClimate || S.rollClimate(state, state.week);
    if (state.week < D.weeks) {
      state.nextClimate = S.rollClimate(state, state.week + 1);
      state.forecast = S.rollForecast(state, state.nextClimate, state.week + 1);
    } else { state.nextClimate = null; state.forecast = null; }
    const keep = [];
    for (const o of state.orders) {
      if (o.week > state.week) { keep.push(o); continue; }
      const bag = o.kind === 'enemy' ? state.arrivedEnemies : state.stock;
      bag[o.id] = (bag[o.id] || 0) + o.n;
    }
    state.orders = keep;
    return { ok: true, state, events };
  };

  S.rankFor = pct => (pct > 85 ? 'Главный агроном' : pct >= 70 ? 'Агроном' : 'Агроном-стажёр');

  S.finalReport = function (state) {
    const t = state.totals;
    const spend = t.spend.prep + t.spend.products + t.spend.enemies + t.spend.climate;
    const pct = (t.kg / FULL_KG) * 100;
    const agg = {};
    for (const mk of state.mistakes) {
      const a = agg[mk.code] || (agg[mk.code] = { code: mk.code, count: 0, weeks: [], cells: 0 });
      a.count++; a.cells += (mk.cells || []).length;
      if (!a.weeks.includes(mk.week)) a.weeks.push(mk.week);
    }
    const mistakes = Object.values(agg)
      .sort((a, b) => (b.count + b.cells / 6) - (a.count + a.cells / 6))
      .slice(0, 5)
      .map(a => ({ ...a, ...D.text.mistakes[a.code] }));
    return {
      kgPerM2: t.kg / 10000, pctPotential: pct, revenue: t.revenue, spend, spendBy: { ...t.spend },
      net: t.revenue - spend,
      preventionVsLoss: { spent: spend, lostRub: (FULL_KG - t.kg) * D.pricePerKg },
      mistakes, rank: S.rankFor(pct),
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
