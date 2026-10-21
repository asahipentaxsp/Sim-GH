// Болезни: заражение, развитие по стадиям, лечение, видимость.
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim;
  const N = D.rows * D.cols;
  const IDS = Object.keys(D.diseases);

  S.protectionEff = function (state, i, id) {
    const dz = D.diseases[id];
    if (dz.kind === 'leaf') {
      let e = 0;
      for (const p of state.cells[i].leafProt) if (p.weeksLeft > 0 && p.eff[id]) e = Math.max(e, p.eff[id]);
      return e;
    }
    const mp = state.rows[S.rowOf(i)].matProt;
    if (!mp || !mp.eff[id]) return 0;
    const k = D.matDecay[mp.age];
    return k ? mp.eff[id] * k : 0;
  };

  function climBase(id, f) {
    const b = D.diseases[id].base;
    let v = null;
    for (const [flag, p] of b.max) if (f[flag]) v = Math.max(v == null ? 0 : v, p);
    const favorable = v != null;
    if (v == null) v = b.else;
    for (const [flag, p] of b.add || []) if (f[flag]) v += p;
    return { v, favorable };
  }
  S.isFavorable = (id, f) => climBase(id, f).favorable;

  function rowHasPsychoda(state, r) {
    return S.rowCells(r).some(i => (state.cells[i].pests.psychoda || 0) > 0);
  }

  S.baseProb = function (state, i, id, f) {
    const dz = D.diseases[id];
    let v = climBase(id, f).v;
    const w = state.week;
    if (dz.formation && D.formationWeeks.includes(w)) v *= dz.formation;
    if (w <= 4 && dz.kind === 'leaf') v *= (id === 'botrytis' || id === 'ascochyta') ? state.prepMult.botAsco : state.prepMult.leaf;
    if (id === 'rootRot') {
      if (rowHasPsychoda(state, S.rowOf(i))) v += D.pests.psychoda.rootRotAdd;
      if (w <= 2) v *= state.prepMult.rootEarly;
    }
    return v;
  };

  // Давление соседей: массив вероятностей заражения от источников стадии ≥2.
  S.pressure = function (state, id, f) {
    const sp = D.diseases[id].spread;
    const miss = new Array(N).fill(1);
    let p = sp.p;
    if (sp.pHum && f.humGE2) p = sp.pHum;
    if (id === 'crazyRoot' && state.solutionDisinfected) p *= 0.5;
    for (let i = 0; i < N; i++) {
      const d = state.cells[i].dis[id];
      if (!d || d.stage < 2) continue;
      let ts;
      if (sp.mode === 'rowAdj') ts = S.neighbors4(i).filter(j => S.rowOf(j) === S.rowOf(i));
      else if (sp.mode === 'rowAny') ts = S.rowCells(S.rowOf(i)).filter(j => j !== i);
      else if (sp.mode === 'n8') ts = S.neighbors8(i);
      else ts = S.neighbors4(i);
      for (const j of ts) miss[j] *= 1 - p;
    }
    return miss.map(m => 1 - m);
  };

  // «Прыжки» мучнистой росы: каждый источник с вероятностью jump заражает случайную клетку.
  S.jumps = function (state, id, rng) {
    const sp = D.diseases[id].spread, out = [];
    if (!sp.jump) return out;
    for (let i = 0; i < N; i++) {
      const d = state.cells[i].dis[id];
      if (d && d.stage >= 2 && rng() < sp.jump) out.push(Math.min(N - 1, Math.floor(rng() * N)));
    }
    return out;
  };

  S.infectionProb = function (state, i, id, f, pres) {
    pres = pres || S.pressure(state, id, f);
    const p = Math.min(1, S.baseProb(state, i, id, f) + (pres[i] || 0));
    return p * (1 - S.protectionEff(state, i, id));
  };

  function mistake(state, code, cells) { state.mistakes.push({ week: state.week, code, cells }); }

  S.rollInfections = function (state, clim, rng) {
    const f = S.flags(clim), events = [];
    if (state.crazySourceWeek === state.week) {
      const r1 = Math.floor(rng() * D.rows), r2 = (r1 + 1 + Math.floor(rng() * (D.rows - 1))) % D.rows;
      for (const r of [r1, r2]) {
        const i = r * D.cols + Math.floor(rng() * D.cols);
        state.cells[i].dis.crazyRoot = { stage: 1, age: 0, fresh: true };
      }
      events.push({ code: 'crazy_source' });
    }
    for (const id of IDS) {
      const pres = S.pressure(state, id, f);
      const jumped = new Set(S.jumps(state, id, rng));
      const newCells = [];
      for (let i = 0; i < N; i++) {
        const c = state.cells[i];
        if (c.dis[id]) continue;
        const hit = jumped.has(i) ? rng() < 1 - S.protectionEff(state, i, id) : rng() < S.infectionProb(state, i, id, f, pres);
        if (hit) { c.dis[id] = { stage: 1, age: 0, fresh: true }; newCells.push(i); }
      }
      if (!newCells.length) continue;
      events.push({ code: 'infect', disease: id, cells: newCells });
      const dz = D.diseases[id];
      if (dz.formation && D.formationWeeks.includes(state.week)) {
        const unprot = newCells.filter(i => !S.protectionEff(state, i, id));
        if (unprot.length) mistake(state, 'formation_unprotected', unprot);
      }
      if (dz.kind === 'root') {
        const unprot = newCells.filter(i => !state.rows[S.rowOf(i)].matProt);
        if (unprot.length) mistake(state, 'mat_unprotected', unprot);
      }
    }
    return events;
  };

  S.progress = function (state, clim, rng) {
    const f = S.flags(clim), events = [];
    for (let i = 0; i < N; i++) {
      const c = state.cells[i];
      for (const [id, d] of Object.entries(c.dis)) {
        const dz = D.diseases[id];
        if (d.fresh) { delete d.fresh; continue; }
        if (d.hold) { delete d.hold; continue; }
        const before = d.stage;
        if (d.stage === 1) {
          d.age++;
          if (d.age >= dz.latency) { d.stage = 2; d.age = 0; }
        } else if (d.stage < dz.maxStage) {
          if (S.isFavorable(id, f) || rng() < 0.5) d.stage += (dz.condBoost && f.cond) ? dz.condBoost : 1;
          d.stage = Math.min(d.stage, dz.maxStage);
        }
        if (d.stage !== before) events.push({ code: 'stage', disease: id, cell: i, from: before, to: d.stage });
        if (before < 3 && d.stage >= 3 && !d.spotted) mistake(state, 'late_detection', [i]);
      }
    }
    return events;
  };

  // Шаг 1 конца недели: лечение и санитария по записанным действиям.
  S.applyTreatments = function (state, rng) {
    const events = [];
    for (const a of state.weekActions) {
      if (a.type === 'sanitize') {
        for (const i of a.cells) {
          const c = state.cells[i];
          c.dis = {}; c.seen.dis = {};
          c.sanitizeWeeks = D.sanitizeWeeks;
        }
        events.push({ code: 'sanitize', cells: a.cells });
        continue;
      }
      const p = D.products[a.productId];
      if (p.cure) {
        for (const i of a.cells) for (const [id, d] of Object.entries(state.cells[i].dis)) {
          const dz = D.diseases[id];
          if (dz.kind !== p.cure.kind || (p.cure.only && !p.cure.only.includes(id))) continue;
          if (d.stage >= 2 && rng() < p.cure.p) {
            d.stage -= p.cure.d || 1; d.age = 0;
            if (d.stage <= 0) delete state.cells[i].dis[id];
          }
        }
        continue;
      }
      const effMap = a.type === 'leaf' ? p.leaf : p.mat;
      if (!effMap) continue;
      for (const i of a.cells) {
        const c = state.cells[i];
        for (const [id, d] of Object.entries(c.dis)) {
          if (!effMap[id] || D.diseases[id].kind !== (a.type === 'leaf' ? 'leaf' : 'root')) continue;
          const eff = S.protectionEff(state, i, id);
          if (d.stage === 1 && rng() < eff) delete c.dis[id];
          else if (d.stage === 2 && rng() < eff) d.hold = true;
        }
      }
    }
    return events;
  };

  S.worstLoss = function (cell) {
    let l = 0;
    for (const [id, d] of Object.entries(cell.dis)) {
      const dz = D.diseases[id];
      const v = dz.fixedLoss != null ? (d.stage >= 2 ? dz.fixedLoss : 0) : D.stageLoss[d.stage];
      l = Math.max(l, v);
    }
    return l;
  };

  // Что видно игроку без обхода в начале новой недели.
  S.refreshSeen = function (state, rng) {
    for (const c of state.cells) {
      c.seen.dis = {}; c.seen.inspected = false;
      for (const [id, d] of Object.entries(c.dis)) {
        if (d.stage >= 3 || (d.stage === 2 && rng() < 0.3)) {
          c.seen.dis[id] = d.stage;
          if (d.stage === 2) d.spotted = true;
        }
      }
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
