// Действия игрока в течение недели. Сначала полная проверка (деньги, часы, дозы),
// потом изменение состояния — при ошибке состояние не трогается.
// Лечебные и разовые эффекты не применяются здесь: они пишутся в state.weekActions
// и срабатывают в endWeek (шаг 1 порядка из спецификации).
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim;
  const EPS = 1e-9;
  const ALL = Array.from({ length: D.rows * D.cols }, (_, i) => i);

  function targets(a) {
    if (a.scope === 'cell') return [a.cell];
    if (a.scope === 'row') return S.rowCells(a.row);
    if (a.scope === 'all') return ALL;
    return [];
  }
  function rowsOf(a) {
    if (a.scope === 'row') return [a.row];
    if (a.scope === 'all') return Array.from({ length: D.rows }, (_, r) => r);
    return [];
  }

  // Возвращает {money, hours, doses:{id:n}, enemies:{id:n}} или {error}.
  S.actionCost = function (state, a) {
    const L = D.labor, out = { money: 0, hours: 0, doses: {}, enemies: {} };
    const p = a.productId ? D.products[a.productId] : null;
    switch (a.type) {
      case 'inspect':
        if (a.scope !== 'cell') return { error: 'bad_scope' };
        out.hours = L.inspect; break;
      case 'leaf': {
        if (!p || !p.modes.includes('leaf')) return { error: 'bad_product' };
        if (!L.leaf[a.scope]) return { error: 'bad_scope' };
        const n = targets(a).length;
        out.hours = L.leaf[a.scope];
        out.doses[a.productId] = n;
        if (a.vlip) out.doses.vlip = n;
        break;
      }
      case 'mat': {
        if (!p || !p.modes.includes('mat')) return { error: 'bad_product' };
        if (a.scope !== 'row' && a.scope !== 'all') return { error: 'bad_scope' };
        if (p.matOnlyWeek0) return { error: 'week0_only' };
        out.hours = L.mat[a.scope];
        out.doses[a.productId] = targets(a).length;
        break;
      }
      case 'release': {
        if (!D.enemies[a.enemyId] || !targets(a).length) return { error: 'bad_scope' };
        const n = targets(a).length;
        out.hours = L.release * n;
        out.enemies[a.enemyId] = n;
        break;
      }
      case 'trap':
        if (a.scope !== 'cell') return { error: 'bad_scope' };
        out.hours = L.trap; out.money = D.products.trapYellow.price; break;
      case 'sanitize':
        if (a.scope !== 'cell') return { error: 'bad_scope' };
        out.hours = L.sanitize; break;
      case 'trayHygiene':
        if (a.scope !== 'row' && a.scope !== 'all') return { error: 'bad_scope' };
        out.hours = L.trayHygiene * rowsOf(a).length; break;
      case 'disinfectSolution':
        if (state.solutionDisinfected) return { error: 'already' };
        out.money = D.solutionDisinfectPrice; break;
      case 'order': {
        const n = Math.floor(a.doses || 0);
        if (n <= 0) return { error: 'bad_amount' };
        const item = a.enemyId ? D.enemies[a.enemyId] : p;
        if (!item) return { error: 'bad_product' };
        out.money = item.price * n * (a.urgent ? D.urgentMult : 1);
        break;
      }
      case 'lever': {
        const lv = D.levers[a.lever];
        if (!lv) return { error: 'bad_lever' };
        const isOn = !!state.levers[a.lever];
        if (a.on === isOn) return out;
        const sign = a.on ? 1 : -1;
        out.money = lv.price * sign; out.hours = lv.hours * sign;
        break;
      }
      default: return { error: 'bad_action' };
    }
    return out;
  };

  function check(state, a, cost) {
    if (state.over) return 'season_over';
    if (cost.error) return cost.error;
    if (cost.hours > state.hours + EPS) return 'no_hours';
    if (cost.money > state.budget + EPS) return 'no_budget';
    for (const [id, n] of Object.entries(cost.doses)) if ((state.stock[id] || 0) < n) return 'no_stock';
    for (const [id, n] of Object.entries(cost.enemies)) if ((state.arrivedEnemies[id] || 0) < n) return 'no_enemies_arrived';
    return null;
  }

  function addLeafProt(cell, productId, eff, weeks) {
    const ex = cell.leafProt.find(x => x.productId === productId);
    if (!ex) { cell.leafProt.push({ productId, eff: { ...eff }, weeksLeft: weeks }); return; }
    for (const [k, v] of Object.entries(eff)) ex.eff[k] = Math.max(ex.eff[k] || 0, v);
    ex.weeksLeft = Math.max(ex.weeksLeft, weeks);
  }

  function addMistake(state, code, cells) {
    state.mistakes.push({ week: state.week, code, cells: cells || [] });
  }

  // Работа людей в клетке при конденсате без подогрева разносит бактериоз по мокрому листу.
  function wetWork(state, cells, rng) {
    const clim = S.effectiveClimate(state.climate, state.levers);
    if (!clim.cond) return;
    const rowsWithBact = new Set();
    state.cells.forEach((c, i) => { if (c.dis.bacterial) rowsWithBact.add(S.rowOf(i)); });
    for (const i of cells) {
      const c = state.cells[i];
      if (c.dis.bacterial || !rowsWithBact.has(S.rowOf(i))) continue;
      if (rng() < D.diseases.bacterial.wetWork) {
        c.dis.bacterial = { stage: 1, age: 0 };
        state.log.push({ week: state.week, code: 'wet_work', cell: i });
      }
    }
  }

  S.applyAction = function (state, a) {
    const cost = S.actionCost(state, a);
    const err = check(state, a, cost);
    if (err) return { ok: false, error: err, state };

    const rng = AG.stateRng(state);
    state.hours = AG.round(state.hours - cost.hours, 4);
    state.budget -= cost.money;
    for (const [id, n] of Object.entries(cost.doses)) state.stock[id] -= n;
    for (const [id, n] of Object.entries(cost.enemies)) state.arrivedEnemies[id] -= n;
    const cells = targets(a);
    const p = a.productId ? D.products[a.productId] : null;

    switch (a.type) {
      case 'inspect': {
        const c = state.cells[a.cell];
        for (const [id, d] of Object.entries(c.dis)) {
          if (d.stage >= 2 || rng() < 0.5) { c.seen.dis[id] = d.stage; d.spotted = true; }
        }
        for (const [id, lvl] of Object.entries(c.pests)) if (lvl > 0) c.seen.pests[id] = lvl;
        c.seen.inspected = true;
        wetWork(state, cells, rng);
        break;
      }
      case 'leaf': {
        if (p.leaf) {
          const eff = {};
          for (const [k, v] of Object.entries(p.leaf)) eff[k] = Math.min(0.95, v + (a.vlip ? D.vlipBonus : 0));
          for (const i of cells) addLeafProt(state.cells[i], a.productId, eff, a.vlip ? D.leafWeeksVlip : D.leafWeeks);
        }
        if (p.harvestLoss) for (const i of cells) state.cells[i].chemLoss = Math.max(state.cells[i].chemLoss, p.harvestLoss);
        if (p.killsEnemies || p.enemyHit) {
          const hit = new Set(cells);
          if (p.killsEnemies) for (const i of cells) S.neighbors8(i).forEach(j => hit.add(j));
          const lost = [];
          for (const i of hit) {
            const en = state.cells[i].enemies;
            if (!Object.keys(en).length) continue;
            if (p.killsEnemies) { state.cells[i].enemies = {}; lost.push(i); }
            else for (const k of Object.keys(en)) { en[k].lvl -= p.enemyHit; if (en[k].lvl <= 0) { delete en[k]; lost.push(i); } }
          }
          if (lost.length) addMistake(state, 'chem_killed_enemies', lost);
        }
        if (p.pests || p.cure) state.weekActions.push({ type: 'leaf', productId: a.productId, cells });
        wetWork(state, cells, rng);
        break;
      }
      case 'mat': {
        for (const r of rowsOf(a)) {
          const row = state.rows[r];
          if (p.stripsMat) { row.matProt = null; row.chemMatWeek = state.week; continue; }
          if (p.mat) {
            const eff = { ...p.mat };
            if (row.matProt) for (const [k, v] of Object.entries(row.matProt.eff)) eff[k] = Math.max(eff[k] || 0, v);
            row.matProt = { productId: a.productId, eff, age: 0 };
          }
        }
        if (p.pests || p.cure) state.weekActions.push({ type: 'mat', productId: a.productId, cells, rows: rowsOf(a) });
        break;
      }
      case 'release':
        for (const i of cells) {
          const en = state.cells[i].enemies, ex = en[a.enemyId];
          en[a.enemyId] = { lvl: Math.max(ex ? ex.lvl : 0, 1), age: ex ? ex.age : 0, sachet: D.enemies[a.enemyId].sachet || 0 };
        }
        break;
      case 'trap':
        state.cells[a.cell].trap = a.color;
        state.totals.spend.products += cost.money;
        break;
      case 'sanitize':
        state.weekActions.push({ type: 'sanitize', cells });
        wetWork(state, cells, rng);
        break;
      case 'trayHygiene':
        for (const r of rowsOf(a)) state.rows[r].noHygieneWeeks = 0;
        break;
      case 'disinfectSolution':
        state.solutionDisinfected = true;
        state.totals.spend.climate += cost.money;
        break;
      case 'order': {
        const n = Math.floor(a.doses);
        const isEnemy = !!a.enemyId, id = a.enemyId || a.productId;
        state.totals.spend[isEnemy ? 'enemies' : 'products'] += cost.money;
        if (a.urgent) {
          if (isEnemy) state.arrivedEnemies[id] = (state.arrivedEnemies[id] || 0) + n;
          else state.stock[id] = (state.stock[id] || 0) + n;
        } else state.orders.push({ id, n, kind: isEnemy ? 'enemy' : 'product', week: state.week + 1 });
        break;
      }
      case 'lever':
        state.levers[a.lever] = !!a.on;
        state.totals.spend.climate += cost.money;
        break;
    }
    return { ok: true, state };
  };

  // Проверка пачки действий целиком (с учётом срочной докупки buy = {productId: n}).
  // Возвращает код ошибки или null — тогда все действия пройдут.
  S.batchCheck = function (state, actions, buy) {
    if (state.over) return 'season_over';
    let money = 0, hours = 0; const doses = {}, enemies = {};
    for (const a of actions) {
      const c = S.actionCost(state, a);
      if (c.error) return c.error;
      money += c.money; hours += c.hours;
      for (const [k, v] of Object.entries(c.doses)) doses[k] = (doses[k] || 0) + v;
      for (const [k, v] of Object.entries(c.enemies)) enemies[k] = (enemies[k] || 0) + v;
    }
    for (const [id, n] of Object.entries(buy || {})) money += D.products[id].price * n * D.urgentMult;
    if (hours > state.hours + EPS) return 'no_hours';
    if (money > state.budget + EPS) return 'no_budget';
    for (const [id, n] of Object.entries(doses)) if ((state.stock[id] || 0) + ((buy || {})[id] || 0) < n) return 'no_stock';
    for (const [id, n] of Object.entries(enemies)) if ((state.arrivedEnemies[id] || 0) < n) return 'no_enemies_arrived';
    return null;
  };

  S.errorText = {
    no_hours: 'Не хватает рабочих часов на этой неделе.',
    no_budget: 'Не хватает бюджета.',
    no_stock: 'Нет нужного количества доз на складе — закажите (срочно, если нужно сейчас).',
    bad_scope: 'Так применить нельзя: в мат — только ряд или вся теплица, обход и ловушки — только клетка.',
    week0_only: 'Трихоцин вносится только при высадке.',
    season_over: 'Сезон окончен.',
    no_enemies_arrived: 'Энтомофаги ещё не пришли — закажите партию.',
    already: 'Уже сделано на этой неделе.',
    bad_product: 'Это средство так не применяется.',
    bad_amount: 'Укажите количество.',
    bad_lever: 'Нет такого рычага.',
    bad_action: 'Неизвестное действие.',
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
