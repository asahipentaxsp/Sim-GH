// Вредители и энтомофаги. Порядок в конце недели: обработки → появление → рост →
// распространение → хищники.
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim;
  const N = D.rows * D.cols;
  const PESTS = Object.keys(D.pests);

  function rate(id, f) {
    const r = D.pests[id].rate;
    if (r.both != null && f.dry && f.hot) return r.both;
    if (r.hotOrDry != null && (f.dry || f.hot)) return r.hotOrDry;
    if (r.hot != null && f.hot) return r.hot;
    if (r.flood != null && f.matFlood) return r.flood;
    return r.else;
  }

  S.applyPestTreatments = function (state, rng) {
    for (const a of state.weekActions) {
      const p = a.productId && D.products[a.productId];
      if (!p || !p.pests) continue;
      for (const i of a.cells) {
        const ps = state.cells[i].pests;
        for (const [id, eff] of Object.entries(p.pests)) {
          if (ps[id] > 0 && rng() < eff.p) ps[id] = Math.max(0, ps[id] - eff.d);
        }
      }
    }
  };

  S.appearPests = function (state, clim, rng) {
    const f = S.flags(clim);
    for (let i = 0; i < N; i++) {
      const c = state.cells[i];
      for (const id of PESTS) {
        if (c.pests[id] > 0) continue;
        const pd = D.pests[id];
        if (pd.onlyFlood && !f.matFlood && state.rows[S.rowOf(i)].noHygieneWeeks < 4) continue;
        if (rng() < pd.appear) { c.pests[id] = 1; (c.newPests || (c.newPests = {}))[id] = true; }
      }
    }
  };

  S.growPests = function (state, clim, rng) {
    const f = S.flags(clim);
    for (const c of state.cells) for (const id of PESTS) {
      if (!(c.pests[id] > 0)) continue;
      if (c.newPests && c.newPests[id]) continue; // появился на этой неделе
      const r = rate(id, f);
      const inc = Math.floor(r) + (rng() < r - Math.floor(r) ? 1 : 0);
      c.pests[id] = Math.min(4, c.pests[id] + inc);
    }
  };

  S.spreadPests = function (state, clim, rng) {
    for (const c of state.cells) delete c.newPests;
    const snap = state.cells.map(c => ({ ...c.pests }));
    for (let i = 0; i < N; i++) for (const id of PESTS) {
      if (!(snap[i][id] >= 2)) continue;
      let ts = S.neighbors4(i);
      if (id === 'psychoda') ts = ts.filter(j => S.rowOf(j) === S.rowOf(i));
      for (const j of ts) {
        const c = state.cells[j];
        if (!(c.pests[id] > 0) && rng() < D.pests[id].spread) c.pests[id] = 1;
      }
    }
  };

  S.stepEnemies = function (state, clim) {
    const f = S.flags(clim);
    for (const c of state.cells) {
      for (const [id, e] of Object.entries(c.enemies)) {
        const ed = D.enemies[id];
        if (e.age === 0) { e.age = 1; continue; } // неделя приживания
        if (e.age === 1 && e.lvl < 2) e.lvl = 2; // прижился — активен
        const blocked = ed.blockedBy && f[ed.blockedBy];
        const preyBefore = ed.targets.map(t => c.pests[t] || 0);
        if (!blocked) for (const t of ed.targets) {
          if (c.pests[t] > 0) c.pests[t] = Math.max(0, c.pests[t] - (e.lvl >= 3 ? 2 : 1));
        }
        const anyPrey = preyBefore.some(x => x >= 1);
        const hadSachet = e.sachet > 0;
        if (hadSachet) e.sachet--;
        if (!blocked && preyBefore.some(x => x >= 2)) e.lvl = Math.min(3, e.lvl + 1);
        else if (!anyPrey && !hadSachet) e.lvl -= 1;
        e.age++;
        if (e.lvl <= 0) delete c.enemies[id];
      }
    }
  };

  S.pestLoss = function (cell) {
    let keep = 1;
    for (const [id, lvl] of Object.entries(cell.pests)) {
      if (!lvl) continue;
      const pd = D.pests[id];
      if (pd.lossPerLvl) keep *= 1 - pd.lossPerLvl * lvl;
      else keep *= 1 - D.pestLoss[lvl];
      if (pd.sooty && lvl >= 3) keep *= 1 - pd.sooty;
    }
    return 1 - keep;
  };

  function trapArea(i) { return [i, ...S.neighbors8(i)]; }
  function trapPests(color) { return PESTS.filter(id => D.pests[id].trap === color); }

  S.trapView = function (state, i) {
    const color = state.cells[i].trap, out = {};
    if (!color) return out;
    const ids = trapPests(color);
    for (const j of trapArea(i)) for (const id of ids) {
      const lvl = state.cells[j].pests[id] || 0;
      if (lvl > 0) out[id] = Math.max(out[id] || 0, lvl);
    }
    return out;
  };

  S.refreshSeenPests = function (state) {
    for (const c of state.cells) {
      c.seen.pests = {};
      for (const [id, lvl] of Object.entries(c.pests)) if (lvl >= 3) c.seen.pests[id] = lvl;
    }
    state.cells.forEach((c, i) => {
      if (!c.trap) return;
      const ids = trapPests(c.trap);
      for (const j of trapArea(i)) for (const id of ids) {
        const lvl = state.cells[j].pests[id] || 0;
        if (lvl > 0) state.cells[j].seen.pests[id] = lvl;
      }
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
