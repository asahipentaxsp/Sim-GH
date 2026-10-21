// Интерфейс: старт, игра, карточки, разбор, справочник, финал.
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim, T = D.text;
  const $app = () => document.getElementById('app');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = x => (Math.abs(x) >= 1000 ? AG.round(x / 1000, 2).toLocaleString('ru-RU') + ' млн ₽' : Math.round(x).toLocaleString('ru-RU') + ' тыс. ₽');
  const hrs = x => AG.round(x, 2).toLocaleString('ru-RU') + ' ч';
  const name = id => (T.ref[id] || {}).name || (D.products[id] || {}).name || id;
  const stageName = ['здорово', 'скрытая инфекция', 'ранние симптомы', 'развитие', 'сильное поражение'];
  const pestLvl = ['', 'единично', 'заметно', 'много', 'вспышка'];
  const ALL = Array.from({ length: 36 }, (_, i) => i);

  const G = {
    screen: 'start', state: null, seedShown: '', prep: { disinfectGreenhouse: false, disinfectDrip: false, gliokladinStructures: false, seedlings: false, matAtPlanting: null },
    tab: 'look', tool: null, sel: new Set(), selRows: new Set(), sheet: null, toast: null, hints: true, qty: {}, busy: false, lastReview: null,
  };

  // ---------- инструменты ----------
  const TABS = [
    ['look', 'Осмотр'], ['leaf', 'По листу'], ['mat', 'В мат'], ['enemies', 'Энтомоф.'],
    ['traps', 'Ловушки'], ['climate', 'Климат'], ['chem', 'Химия'], ['stock', 'Склад'],
  ];
  const HINTS = {
    look: 'Обход находит болезнь до симптомов, пока биопрепарат ещё лечит. Нажмите на растение — увидите, что с ним.',
    leaf: 'Профилактика по листу работает неделю, с Влипом — две. Перед неделями формирования (3, 6, 9, 12) закройте стебли Глиокладином.',
    mat: 'Защита в мате выдыхается за 4 недели. Вносите биопрепараты ежемесячно, на весь ряд или теплицу.',
    enemies: 'Энтомофагов выпускают заранее: неделя уходит на приживание. Пришедшую партию нельзя хранить.',
    traps: 'Ловушка показывает вредителей в квадрате 3×3 вокруг себя без обхода.',
    climate: 'Сырость кормит болезни, сухость и жара — клеща и трипса. Рычаги действуют одну неделю.',
    chem: 'Химия лечит быстро, но срок ожидания режет сбор, а инсектицид убивает энтомофагов вокруг.',
    stock: 'Обычный заказ приходит на следующей неделе. Срочный — сразу, но в полтора раза дороже.',
  };
  function toolsFor(tab) {
    const prod = (id, mode) => ({ kind: mode, productId: id });
    switch (tab) {
      case 'look': return [{ kind: 'inspect' }, { kind: 'sanitize' }, { kind: 'tray' }];
      case 'leaf': return ['gliokladin', 'alirinGamair', 'mikozar', 'lovchiy', 'endobacterin'].map(id => prod(id, 'leaf'));
      case 'mat': return ['gliokladin', 'alirinGamair', 'mikozar', 'boverin'].map(id => prod(id, 'mat'));
      case 'enemies': return Object.keys(D.enemies).map(id => ({ kind: 'release', enemyId: id }));
      case 'traps': return [{ kind: 'trap', color: 'yellow' }, { kind: 'trap', color: 'blue' }];
      case 'chem': return [prod('chemFungLeaf', 'leaf'), prod('chemFungMat', 'mat'), prod('chemInsect', 'leaf')];
      default: return [];
    }
  }
  const scopesFor = t => ({ inspect: ['cell'], sanitize: ['cell'], tray: ['row', 'all'], mat: ['row', 'all'], leaf: ['cell', 'row', 'all'], release: ['cell', 'row', 'all'], trap: ['cell'] }[t.kind]);
  const sameTool = (a, b) => a && b && a.kind === b.kind && a.productId === b.productId && a.enemyId === b.enemyId && a.color === b.color;

  function targetsText(p, mode) {
    const ids = [...(mode !== 'mat' ? Object.keys(p.leaf || {}) : []), ...(mode !== 'leaf' ? Object.keys(p.mat || {}) : []), ...Object.keys(p.pests || {})];
    if (p.cure && p.cure.kind === 'leaf') return 'листовые болезни';
    if (p.cure) return 'корневые гнили';
    return [...new Set(ids)].map(id => (T.ref[id] || {}).short || id).join(', ');
  }
  function toolLabel(t) {
    const s = G.state;
    if (t.kind === 'inspect') return { title: 'Обход', sub: 'клетка, 0,5 ч — находит скрытое' };
    if (t.kind === 'sanitize') return { title: 'Санитарная чистка', sub: 'клетка, 1 ч — удалить очаг, сбор −30% на 2 нед.' };
    if (t.kind === 'tray') return { title: 'Гигиена лотков', sub: 'ряд, 1 ч — против психод' };
    if (t.kind === 'trap') return { title: t.color === 'yellow' ? 'Жёлтая ловушка' : 'Синяя ловушка', sub: t.color === 'yellow' ? 'белокрылка, психоды' : 'трипсы' };
    if (t.kind === 'release') {
      const n = s.arrivedEnemies[t.enemyId] || 0;
      return { title: T.ref[t.enemyId].name, sub: `против: ${D.enemies[t.enemyId].targets.map(x => T.ref[x].short).join(', ')}`, tag: n ? `пришло ${n}` : 'не заказан', zero: !n };
    }
    const p = D.products[t.productId], n = s.stock[t.productId] || 0;
    return { title: p.name, sub: 'против: ' + targetsText(p, t.kind), tag: `склад ${n}`, zero: !n, chem: p.chem };
  }

  // ---------- построение действий из выбора ----------
  function buildActions() {
    const t = G.tool; if (!t) return [];
    const base = { inspect: 'inspect', sanitize: 'sanitize', tray: 'trayHygiene', mat: 'mat', leaf: 'leaf', release: 'release', trap: 'trap' }[t.kind];
    const extra = { productId: t.productId, enemyId: t.enemyId, color: t.color, vlip: t.kind === 'leaf' && G.vlip && !D.products[t.productId].chem };
    const scope = G.scope;
    if (scope === 'all') return [{ type: base, scope: 'all', ...extra }];
    if (scope === 'row') return [...G.selRows].sort().map(r => ({ type: base, scope: 'row', row: r, ...extra }));
    return [...G.sel].sort((a, b) => a - b).map(i => ({ type: base, scope: 'cell', cell: i, ...extra }));
  }
  function totalCost(actions) {
    const out = { money: 0, hours: 0, doses: {}, enemies: {}, error: null };
    for (const a of actions) {
      const c = S.actionCost(G.state, a);
      if (c.error) { out.error = c.error; continue; }
      out.money += c.money; out.hours += c.hours;
      for (const [k, v] of Object.entries(c.doses)) out.doses[k] = (out.doses[k] || 0) + v;
      for (const [k, v] of Object.entries(c.enemies)) out.enemies[k] = (out.enemies[k] || 0) + v;
    }
    return out;
  }
  function shortage(cost) {
    const miss = {};
    for (const [id, n] of Object.entries(cost.doses)) { const m = n - (G.state.stock[id] || 0); if (m > 0) miss[id] = m; }
    return miss;
  }
  const urgentPrice = miss => Object.entries(miss).reduce((s, [id, n]) => s + D.products[id].price * n * D.urgentMult, 0);

  function applyActions(actions, buyUrgent) {
    const s = G.state;
    const err = S.batchCheck(s, actions, buyUrgent);
    if (err) return toast((S.errorText[err] || err) + ' Ничего не применено — уменьшите выбор.');
    if (buyUrgent) {
      for (const [id, n] of Object.entries(buyUrgent)) {
        const r = S.applyAction(s, { type: 'order', productId: id, doses: n, urgent: true });
        if (!r.ok) return toast(S.errorText[r.error]);
      }
    }
    let done = 0;
    for (const a of actions) {
      const r = S.applyAction(s, a);
      if (!r.ok) { toast(S.errorText[r.error] || r.error); break; }
      done++;
    }
    if (done) { G.sel.clear(); G.selRows.clear(); if (!G.toast) toast('Готово.', true); }
    render();
  }

  function toast(msg, ok) { G.toast = { msg, ok }; render(); }

  // ---------- экраны ----------
  function startScreen() {
    const pr = G.prep;
    const matOpts = [[null, 'Без внесения', 0], ['gliokladin', 'Глиокладин', D.products.gliokladin.price * 36], ['trichocin', 'Трихоцин', D.products.trichocin.price * 36], ['mikozar', 'Микозар', D.products.mikozar.price * 36]];
    let cost = 0;
    for (const k of Object.keys(D.prep)) if (pr[k]) cost += D.prep[k].price;
    const mo = matOpts.find(m => m[0] === pr.matAtPlanting); cost += mo[2];
    if (!G.preview) { G.preview = S.newSeason(7, {}); G.preview.week = 6; }
    return `<div class="hero">
        <span class="label">Защищённый грунт</span>
        <h1>Агроном по защите</h1>
        <p>Огурец на светокультуре, блок 1 га, оборот 16 недель с высадки в конце августа. Соберите урожай и не сожгите бюджет защиты.</p>
        <div class="board">${AG.render.field(G.preview, {})}</div>
      </div>
      <section class="panel">
        <h2>Неделя 0: подготовка теплицы</h2>
        <p class="small muted">До высадки ещё можно убрать стартовый запас инфекции. Всё оплачивается из бюджета агронома — ${money(D.start.budget)} на оборот.</p>
        <div class="prep">
          ${Object.entries(D.prep).map(([k, p]) => `<button class="switch" data-act="prep" data-k="${k}" aria-pressed="${!!pr[k]}"><span><b>${p.name}</b><small>${money(p.price)}. ${p.hint}</small></span><i class="knob"></i></button>`).join('')}
        </div>
        <h3>Внесение в маты при высадке</h3>
        <div class="seg" role="group" aria-label="Внесение в маты">
          ${matOpts.map(([id, n]) => `<button data-act="matPlant" data-id="${id || ''}" aria-pressed="${pr.matAtPlanting === id}">${n}</button>`).join('')}
        </div>
        <p class="small muted">${mo[0] ? `${mo[1]}: ${money(mo[2])}, защита матов на 4 недели.` : 'Маты останутся без биозащиты.'}</p>
        <label class="field-input" for="seed"><span class="small">Номер сезона — у всех, кто введёт тот же номер, будет одинаковая погода и вспышки</span>
          <input id="seed" inputmode="numeric" autocomplete="off" placeholder="случайный" value="${esc(G.seedShown)}"></label>
        <dl class="kv"><dt>Подготовка</dt><dd>${money(cost)}</dd><dt>Останется на сезон</dt><dd>${money(D.start.budget - cost)}</dd></dl>
      </section>`;
  }
  function startDock() {
    return `<button class="btn primary" data-act="begin">Высадить рассаду</button><button class="btn" data-act="ref">Справочник болезней и вредителей</button>`;
  }

  function weatherHtml() {
    const s = G.state, raw = s.climate, eff = S.effectiveClimate(raw, s.levers);
    const chips = [];
    const humRisk = raw.hum === 0 || raw.hum === 3;
    chips.push(`<span class="chip ${raw.hum !== eff.hum ? 'fixed' : humRisk ? 'risk' : ''}">${T.humNames[raw.hum]}</span>`);
    if (raw.hum !== eff.hum) chips.push(`<span class="chip">→ ${T.humNames[eff.hum]}</span>`);
    if (raw.temp !== 'norm') chips.push(`<span class="chip ${eff.temp !== raw.temp ? 'fixed' : 'risk'}">${T.tempNames[raw.temp]}</span>`);
    if (raw.cond) chips.push(`<span class="chip ${eff.cond ? 'risk' : 'fixed'}">конденсат</span>`);
    if (raw.mat !== 'norm') chips.push(`<span class="chip ${eff.mat !== raw.mat ? 'fixed' : 'risk'}">${T.matNames[raw.mat]}</span>`);
    const fc = s.forecast ? S.climateText(s.forecast).join(', ') : 'последняя неделя оборота';
    const form = D.formationWeeks.includes(s.week) ? '<span class="chip risk">формирование растений</span>' : '';
    return `<div class="weather">${chips.join('')}${form}<span class="forecast small">Прогноз: ${fc}</span></div>`;
  }

  function panelHtml() {
    const s = G.state, tab = G.tab;
    const hint = G.hints && s.week <= 3 ? `<div class="hint"><span>${HINTS[tab]}</span><button data-act="hints">Скрыть</button></div>` : '';
    if (tab === 'climate') return hint + climatePanel();
    if (tab === 'stock') return hint + stockPanel();
    const tools = toolsFor(tab);
    let body = `<div class="tools">${tools.map(t => {
      const l = toolLabel(t);
      return `<button class="tool${l.chem ? ' chem' : ''}" data-act="tool" data-t='${esc(JSON.stringify(t))}' aria-pressed="${sameTool(t, G.tool)}"><b>${esc(l.title)}</b><small>${esc(l.sub)}</small>${l.tag ? `<small class="stock-tag${l.zero ? ' zero' : ''}">${l.tag}</small>` : ''}</button>`;
    }).join('')}</div>`;
    if (G.tool) {
      const scopes = scopesFor(G.tool);
      const nm = { cell: 'Клетки', row: 'Ряды', all: 'Вся теплица' };
      if (scopes.length > 1) body += `<div class="seg" role="group" aria-label="Где применить">${scopes.map(sc => `<button data-act="scope" data-sc="${sc}" aria-pressed="${G.scope === sc}">${nm[sc]}</button>`).join('')}</div>`;
      if (G.tool.kind === 'leaf' && !D.products[G.tool.productId].chem) body += `<button class="switch" data-act="vlip" aria-pressed="${!!G.vlip}"><span><b>С Влипом</b><small>действует 2 недели вместо 1 и сильнее. Склад Влипа: ${s.stock.vlip || 0}</small></span><i class="knob"></i></button>`;
      const instr = G.scope === 'all' ? 'Обработка всей теплицы.' : G.scope === 'row' ? 'Нажмите на ряды теплицы.' : G.tool.kind === 'inspect' ? 'Нажмите на растение — сразу осмотрите его.' : 'Нажмите на растения.';
      body += `<p class="small muted">${instr}</p>`;
      if (G.tool.kind === 'release' && !(s.arrivedEnemies[G.tool.enemyId] > 0)) body += `<p class="warnline">Партии нет. Закажите на вкладке «Склад» — обычный заказ придёт на следующей неделе.</p>`;
    } else body += `<p class="small muted">Выберите средство или нажмите на растение, чтобы посмотреть его состояние.</p>`;
    if (tab === 'mat') body += `<button class="btn" data-act="solution" ${s.solutionDisinfected ? 'disabled' : ''}>Обеззаразить раствор — ${money(D.solutionDisinfectPrice)} ${s.solutionDisinfected ? '(сделано)' : ''}</button><p class="small muted">Вдвое замедляет бешеный корень на эту неделю.</p>`;
    if (tab === 'chem') body += `<p class="warnline">Срок ожидания: фунгицид −40% сбора с клетки на неделе, инсектоакарицид −70% и гибель энтомофагов в клетке и вокруг. Фунгицид в мат снимает биозащиту ряда.</p>`;
    return hint + body;
  }

  function climatePanel() {
    const s = G.state;
    return `<div class="list">${Object.entries(D.levers).map(([k, lv]) => {
      const cost = [lv.price ? money(lv.price) : '', lv.hours ? hrs(lv.hours) : ''].filter(Boolean).join(', ');
      return `<button class="switch" data-act="lever" data-k="${k}" aria-pressed="${!!s.levers[k]}"><span><b>${lv.name}</b><small>${lv.hint}. ${cost} на неделю</small></span><i class="knob"></i></button>`;
    }).join('')}</div>`;
  }

  function stockPanel() {
    const s = G.state;
    const items = [...Object.keys(D.products).filter(id => !D.products[id].modes.includes('trap') && id !== 'trichocin').map(id => ['p', id]),
      ...Object.keys(D.enemies).map(id => ['e', id])];
    const pend = s.orders.length ? `<p class="small">В пути: ${s.orders.map(o => `${name(o.id)} ×${o.n}`).join(', ')} — придёт на неделе ${s.orders[0].week}.</p>` : '';
    return pend + `<div class="list">${items.map(([kind, id]) => {
      const it = kind === 'p' ? D.products[id] : D.enemies[id];
      const have = kind === 'p' ? (s.stock[id] || 0) : (s.arrivedEnemies[id] || 0);
      const q = G.qty[id] || (kind === 'e' ? 36 : 36);
      return `<div class="row-item"><b>${name(id)}</b>
        <div class="stepper"><button data-act="qty" data-id="${id}" data-d="-6" aria-label="меньше">−</button><output class="num">${q}</output><button data-act="qty" data-id="${id}" data-d="6" aria-label="больше">+</button></div>
        <span class="meta">${kind === 'p' ? 'на складе' : 'пришло'} ${have}. ${money(it.price)} за дозу на клетку. ${it.chem ? 'Химия.' : ''}</span>
        <div class="btn-row" style="grid-column:1/-1"><button class="btn" data-act="order" data-kind="${kind}" data-id="${id}">Заказать — ${money(it.price * q)}</button><button class="btn" data-act="order" data-kind="${kind}" data-id="${id}" data-urgent="1">Срочно — ${money(it.price * q * D.urgentMult)}</button></div>
      </div>`;
    }).join('')}</div>`;
  }

  function gameScreen() {
    const s = G.state;
    const hl = G.tool && G.scope !== 'all' ? ALL : [];
    const sel = G.scope === 'row' ? ALL.filter(i => G.selRows.has(S.rowOf(i))) : [...G.sel];
    if (G.sheet && G.sheet.type === 'cell') sel.push(G.sheet.i);
    const lowB = s.budget < 60, lowH = s.hours < 2;
    return `<header class="top">
        <div class="title"><span class="label">Теплица №${esc(G.seedShown)}, огурец</span><b>Неделя ${s.week}<span> из 16</span></b></div>
        <div class="res"><div class="pill${lowB ? ' low' : ''}"><b>${Math.round(s.budget)}</b><small>тыс. ₽</small></div><div class="pill${lowH ? ' low' : ''}"><b>${AG.round(s.hours, 2).toLocaleString('ru-RU')}</b><small>часов</small></div></div>
        <button class="icon-btn" data-act="ref" aria-label="Справочник">?</button>
      </header>
      ${weatherHtml()}
      <div class="board${G.zoom ? ' zoom' : ''}">
        <div class="board-tools"><button data-act="zoom" aria-pressed="${!!G.zoom}">${G.zoom ? 'Обычно' : 'Крупнее'}</button></div>
        <div class="board-scroll" id="board-scroll">${AG.render.field(s, { selected: sel, highlight: hl })}</div>
      </div>
      <div class="legend"><span><i style="background:var(--warn)"></i>ранние симптомы</span><span><i style="background:var(--bad)"></i>очаг или вспышка</span><span><i style="background:var(--mat-prot)"></i>биозащита мата и листа</span></div>
      <nav class="tabs" role="tablist">${TABS.map(([k, n]) => `<button class="tab" role="tab" data-act="tab" data-k="${k}" aria-selected="${G.tab === k}">${n}</button>`).join('')}</nav>
      <section class="panel">${panelHtml()}</section>
      ${journalHtml()}`;
  }

  function journalHtml() {
    const ev = G.state.events.slice(-8).reverse();
    if (!ev.length) return '';
    return `<section class="panel"><span class="label">Журнал</span><div class="journal">${ev.map(e => `<p class="${e.code}"><span>нед. ${e.week}</span><span>${esc(e.text)}</span></p>`).join('')}</div></section>`;
  }

  function gameDock() {
    const parts = [];
    if (G.toast) parts.push(`<div class="toast${G.toast.ok ? ' ok' : ''}">${esc(G.toast.msg)}</div>`);
    const acts = buildActions();
    if (G.tool && acts.length && G.tool.kind !== 'inspect') {
      const c = totalCost(acts);
      const miss = shortage(c), up = urgentPrice(miss);
      const what = G.scope === 'all' ? 'вся теплица' : G.scope === 'row' ? `рядов: ${acts.length}` : `клеток: ${acts.length}`;
      const dose = Object.entries(c.doses).map(([id, n]) => `${name(id)} ${n}`).join(', ');
      parts.push(`<div class="summary">${esc(toolLabel(G.tool).title)}${acts[0].vlip ? ' + Влип' : ''}: ${what}. ${hrs(c.hours)}${c.money ? ', ' + money(c.money) : ''}${dose ? '. Доз: ' + esc(dose) : ''}.</div>`);
      if (Object.keys(miss).length) parts.push(`<button class="btn primary" data-act="apply" data-buy="1">Купить срочно (${money(up)}) и применить</button>`);
      else parts.push(`<div class="btn-row"><button class="btn" data-act="clearSel">Сбросить</button><button class="btn primary" data-act="apply">Применить</button></div>`);
    } else {
      parts.push(`<button class="btn primary" data-act="endWeek" ${G.busy ? 'disabled' : ''}>Завершить неделю ${G.state.week}</button>`);
    }
    return parts.join('');
  }

  // ---------- листы ----------
  function cellSheet(i) {
    const s = G.state, c = s.cells[i];
    const dis = Object.entries(c.seen.dis);
    const pests = Object.entries(c.seen.pests);
    const lines = [];
    if (dis.length) lines.push(...dis.map(([id, st]) => `<li><button class="link" data-act="refItem" data-id="${id}">${name(id)}</button> — <span class="stage-${st}">${stageName[st]}</span></li>`));
    if (pests.length) lines.push(...pests.map(([id, l]) => `<li><button class="link" data-act="refItem" data-id="${id}">${name(id)}</button> — ${pestLvl[l]}</li>`));
    const seenTxt = lines.length ? `<ul class="list" style="padding-left:18px;margin:0">${lines.join('')}</ul>` :
      `<p class="small">${c.seen.inspected ? 'Обход: видимых симптомов и вредителей нет. Скрытая инфекция находится не всегда.' : 'Симптомов не видно. Скрытую инфекцию и единичных вредителей находит только обход.'}</p>`;
    const prot = [];
    for (const p of c.leafProt) prot.push(`${D.products[p.productId].name} по листу: ещё ${p.weeksLeft} нед.`);
    const mp = s.rows[S.rowOf(i)].matProt;
    if (mp) prot.push(`${D.products[mp.productId].name} в мате: ${Math.round(D.matDecay[mp.age] * 100)}% силы, ещё ${D.matDecay.length - mp.age} нед.`);
    const en = Object.entries(c.enemies).map(([id, e]) => `${T.ref[id].name}: ${e.age === 0 ? 'приживается' : 'работает'}${e.sachet ? `, пакетик ещё ${e.sachet} нед.` : ''}`);
    const trap = c.trap ? Object.entries(S.trapView(s, i)) : null;
    const canInspect = !c.seen.inspected;
    return `<div class="sheet-head"><h2>Ряд ${S.rowOf(i) + 1}, секция ${S.colOf(i) + 1}</h2><button class="close" data-act="close" aria-label="Закрыть">×</button></div>
      <section><h3>Что видно</h3>${seenTxt}</section>
      ${trap ? `<section><h3>${c.trap === 'yellow' ? 'Жёлтая' : 'Синяя'} ловушка, 3×3 вокруг</h3><p class="small">${trap.length ? trap.map(([id, l]) => `${name(id)}: ${pestLvl[l]}`).join('; ') : 'пусто'}</p></section>` : ''}
      <section><h3>Защита</h3><p class="small">${prot.length ? prot.join('<br>') : 'Не защищено.'}</p></section>
      ${en.length ? `<section><h3>Энтомофаги</h3><p class="small">${en.join('<br>')}</p></section>` : ''}
      <div class="btn-row">${canInspect ? `<button class="btn primary" data-act="inspectCell" data-i="${i}">Обход — 0,5 ч</button>` : ''}${dis.length ? `<button class="btn" data-act="sanitizeCell" data-i="${i}">Санитарная чистка — 1 ч</button>` : ''}</div>`;
  }

  function reviewSheet() {
    const r = G.lastReview, s = G.state;
    const h = s.history[s.history.length - 1];
    const kgm2 = h.kg / 10000, pot = h.potential / 10000;
    const next = s.over ? '' : `<section><h3>Неделя ${s.week}</h3><p class="small">${S.climateText(s.climate).join(', ')}${D.formationWeeks.includes(s.week) ? ', формирование растений' : ''}.</p></section>`;
    return `<div class="sheet-head"><h2>Итоги недели ${h.week}</h2><button class="close" data-act="close" aria-label="Закрыть">×</button></div>
      <dl class="kv"><dt>Сбор</dt><dd>${AG.round(kgm2, 2).toLocaleString('ru-RU')} кг/м²${pot ? ` из ${pot.toLocaleString('ru-RU')}` : ''}</dd>
      <dt>За оборот</dt><dd>${AG.round(s.totals.kg / 10000, 1).toLocaleString('ru-RU')} кг/м²</dd></dl>
      <div class="list">${r.map(e => `<p class="event ${e.code}">${esc(e.text)}</p>`).join('')}</div>
      ${next}
      <button class="btn primary" data-act="close">${s.over ? 'Итоги сезона' : 'К неделе ' + s.week}</button>`;
  }

  function refSheet(focus) {
    const groups = [['Болезни', Object.keys(D.diseases)], ['Вредители', Object.keys(D.pests)], ['Энтомофаги', Object.keys(D.enemies)]];
    const card = id => { const r = T.ref[id]; return `<article class="card" id="ref-${id}"><h3>${r.name}</h3><span class="lat">${r.agent}</span>
      <p><b>Симптомы.</b> ${r.symptoms}</p><p><b>Условия.</b> ${r.conditions}</p>${r.spread ? `<p><b>Распространение.</b> ${r.spread}</p>` : ''}<p><b>Защита.</b> ${r.control}</p></article>`; };
    const prods = Object.entries(D.products).filter(([, p]) => p.abt).map(([id, p]) => `<article class="card"><h3>${p.name}</h3><p>${id === 'vlip' ? 'Биоприлипатель: обработка по листу держится две недели вместо одной и работает сильнее.' : 'Против: ' + targetsText(p) + '. ' + (p.modes.includes('mat') && p.modes.includes('leaf') ? 'В мат и по листу.' : p.modes.includes('mat') ? (id === 'boverin' ? 'С поливом.' : 'В мат.') : 'По листу.')}</p></article>`).join('');
    const list = focus ? card(focus) : groups.map(([t, ids]) => `<h3>${t}</h3>${ids.map(card).join('')}`).join('') + `<h3>Препараты АгроБиоТехнологии</h3>${prods}`;
    return `<div class="sheet-head"><h2>${focus ? 'Справочник' : 'Справочник агронома'}</h2><button class="close" data-act="close" aria-label="Закрыть">×</button></div>${list}${focus ? '<button class="btn" data-act="ref">Весь справочник</button>' : ''}`;
  }

  function finalScreen() {
    const f = S.finalReport(G.state);
    const by = f.spendBy;
    return `<div class="hero"><p>Сезон №${esc(G.seedShown)} окончен</p><div class="big">${AG.round(f.pctPotential, 1).toLocaleString('ru-RU')}%</div>
      <p>урожая от потенциала: ${AG.round(f.kgPerM2, 1).toLocaleString('ru-RU')} из 31,7 кг/м²</p><div class="rank">${f.rank}</div></div>
      <div class="bar" aria-hidden="true"><i style="width:${Math.min(100, f.pctPotential)}%"></i></div>
      <section class="panel"><h2>Цена профилактики против цены потерь</h2>
        <dl class="kv"><dt>Потрачено на защиту</dt><dd>${money(f.preventionVsLoss.spent)}</dd><dt>Потеряно урожая</dt><dd style="color:var(--bad)">${money(f.preventionVsLoss.lostRub)}</dd></dl>
        <p class="small muted">Каждый процент потерь на гектаре огурца — около ${money(31.7 * 100 * D.pricePerKg)} выручки.</p>
      </section>
      <section class="panel"><h2>Деньги</h2>
        <dl class="kv"><dt>Выручка</dt><dd>${money(f.revenue)}</dd><dt>Подготовка</dt><dd>${money(by.prep)}</dd><dt>Препараты и ловушки</dt><dd>${money(by.products)}</dd>
        <dt>Энтомофаги</dt><dd>${money(by.enemies)}</dd><dt>Климат</dt><dd>${money(by.climate)}</dd><dt>Чистый результат</dt><dd>${money(f.net)}</dd></dl></section>
      <section class="panel"><h2>Главные ошибки</h2>${f.mistakes.length ? f.mistakes.map(m => `<div class="mistake"><b>${m.title}</b><span class="small muted">Недели: ${m.weeks.slice(0, 6).join(', ')}${m.weeks.length > 6 ? '…' : ''}</span><span class="small">${m.fix}</span></div>`).join('') : '<p>Ошибок не найдено. Отличный сезон.</p>'}</section>`;
  }
  const finalDock = () => `<div class="btn-row"><button class="btn" data-act="again" data-same="1">Этот же сезон ещё раз</button><button class="btn primary" data-act="again">Новый сезон</button></div>`;

  // ---------- рендер ----------
  function render() {
    const app = $app();
    let body, dock;
    if (G.screen === 'start') { body = startScreen(); dock = startDock(); }
    else if (G.screen === 'final') { body = finalScreen(); dock = finalDock(); }
    else { body = gameScreen(); dock = gameDock(); }
    let sheet = '';
    if (G.sheet) {
      const inner = G.sheet.type === 'cell' ? cellSheet(G.sheet.i) : G.sheet.type === 'review' ? reviewSheet() : refSheet(G.sheet.focus);
      sheet = `<div class="sheet-back" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`;
    }
    app.innerHTML = `<main class="app">${body}</main><div class="dock"><div class="dock-in">${dock}</div></div>${sheet}`;
  }

  // ---------- события ----------
  function onClick(ev) {
    const svg = ev.target.closest('svg.field');
    const el = ev.target.closest('[data-act]');
    if (svg && G.screen === 'game' && !G.sheet) {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
        const i = AG.render.cellAt(pt.x, pt.y);
        if (i != null) return onCell(i);
      }
      return;
    }
    if (!el) return;
    const act = el.dataset.act, s = G.state;
    if (act !== 'backdrop') G.toast = null;
    switch (act) {
      case 'prep': G.prep[el.dataset.k] = !G.prep[el.dataset.k]; break;
      case 'matPlant': G.prep.matAtPlanting = el.dataset.id || null; break;
      case 'begin': {
        const inp = document.getElementById('seed');
        const ps = S.parseSeed(inp ? inp.value : '');
        G.seedShown = ps.shown; G.state = S.newSeason(ps.seed, G.prep); G.screen = 'game'; G.tab = 'look'; G.tool = null;
        break;
      }
      case 'zoom': G.zoom = !G.zoom; render(); if (G.zoom) { const b = document.getElementById('board-scroll'); if (b) b.scrollLeft = (b.scrollWidth - b.clientWidth) / 2; } return;
      case 'tab': G.tab = el.dataset.k; G.tool = null; G.sel.clear(); G.selRows.clear(); break;
      case 'tool': {
        const t = JSON.parse(el.dataset.t);
        if (sameTool(t, G.tool)) { G.tool = null; break; }
        G.tool = t; G.scope = scopesFor(t)[0]; G.sel.clear(); G.selRows.clear();
        if (G.vlip === undefined) G.vlip = true;
        break;
      }
      case 'scope': G.scope = el.dataset.sc; G.sel.clear(); G.selRows.clear(); break;
      case 'vlip': G.vlip = !G.vlip; break;
      case 'hints': G.hints = false; break;
      case 'clearSel': G.sel.clear(); G.selRows.clear(); break;
      case 'apply': {
        const acts = buildActions();
        const miss = el.dataset.buy ? shortage(totalCost(acts)) : null;
        return applyActions(acts, miss);
      }
      case 'lever': {
        const r = S.applyAction(s, { type: 'lever', lever: el.dataset.k, on: !s.levers[el.dataset.k] });
        if (!r.ok) return toast(S.errorText[r.error]);
        break;
      }
      case 'solution': { const r = S.applyAction(s, { type: 'disinfectSolution' }); if (!r.ok) return toast(S.errorText[r.error]); break; }
      case 'qty': { const id = el.dataset.id; G.qty[id] = Math.max(6, Math.min(216, (G.qty[id] || 36) + Number(el.dataset.d))); break; }
      case 'order': {
        const id = el.dataset.id, q = G.qty[id] || 36;
        const a = el.dataset.kind === 'e' ? { type: 'order', enemyId: id, doses: q, urgent: !!el.dataset.urgent } : { type: 'order', productId: id, doses: q, urgent: !!el.dataset.urgent };
        const r = S.applyAction(s, a);
        if (!r.ok) return toast(S.errorText[r.error]);
        return toast(`${name(id)} ×${q}: ${el.dataset.urgent ? 'уже на месте' : 'придёт на неделе ' + (s.week + 1)}.`, true);
      }
      case 'endWeek': {
        if (G.busy) return;
        G.busy = true;
        const r = S.endWeek(s, s.week);
        G.busy = false;
        if (!r.ok) { if (r.error === 'season_over') G.screen = 'final'; break; }
        G.lastReview = r.events; G.sheet = { type: 'review' }; G.tool = null; G.sel.clear(); G.selRows.clear();
        break;
      }
      case 'inspectCell': {
        const r = S.applyAction(s, { type: 'inspect', scope: 'cell', cell: Number(el.dataset.i) });
        if (!r.ok) return toast(S.errorText[r.error]);
        break;
      }
      case 'sanitizeCell': {
        const r = S.applyAction(s, { type: 'sanitize', scope: 'cell', cell: Number(el.dataset.i) });
        G.sheet = null;
        if (!r.ok) return toast(S.errorText[r.error]);
        return toast('Очаг удалён в конце недели.', true);
      }
      case 'ref': G.sheet = { type: 'ref' }; break;
      case 'refItem': G.sheet = { type: 'ref', focus: el.dataset.id }; break;
      case 'backdrop': if (ev.target !== el) return; // клик внутри листа
      // fallthrough
      case 'close':
        if (G.sheet && G.sheet.type === 'review' && G.state.over) G.screen = 'final';
        G.sheet = null; break;
      case 'again': {
        const same = !!el.dataset.same;
        G.screen = 'start'; G.state = null; G.sheet = null; if (!same) G.seedShown = '';
        break;
      }
      default: return;
    }
    render();
  }

  function onCell(i) {
    const t = G.tool;
    if (!t || G.scope === 'all') { G.sheet = { type: 'cell', i }; G.toast = null; return render(); }
    G.toast = null;
    if (t.kind === 'inspect') {
      const r = S.applyAction(G.state, { type: 'inspect', scope: 'cell', cell: i });
      if (!r.ok) return toast(S.errorText[r.error]);
      G.sheet = { type: 'cell', i }; return render();
    }
    if (G.scope === 'row') { const r = S.rowOf(i); G.selRows.has(r) ? G.selRows.delete(r) : G.selRows.add(r); }
    else G.sel.has(i) ? G.sel.delete(i) : G.sel.add(i);
    render();
  }

  function boot(saved) {
    if (saved && saved.G) Object.assign(G, saved.G, { sel: new Set(saved.G.sel || []), selRows: new Set(saved.G.selRows || []) });
    document.addEventListener('click', onClick);
    try { g.claude && g.claude.hot && g.claude.hot.snapshot && g.claude.hot.snapshot(() => ({ G: { ...G, sel: [...G.sel], selRows: [...G.selRows] } })); } catch (e) { /* нет хука */ }
    render();
  }
  AG.ui = { G, render, boot };
  const h = g.claude && g.claude.hot;
  if (h && h.ready) h.ready(boot); else boot(h && h.data);
})(window);
