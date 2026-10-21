// Климат недели, прогноз, действие климатических рычагов.
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim;

  S.phaseOf = w => (w <= 3 ? 0 : w <= 9 ? 1 : 2);

  S.rollClimate = function (state, week) {
    const rng = AG.stateRng(state), ph = D.climatePhases[S.phaseOf(week)];
    const hum = AG.pick(rng, ph.hum);
    const temp = D.tempValues[AG.pick(rng, ph.temp)];
    const mat = D.matValues[AG.pick(rng, ph.mat)];
    return { hum, temp, mat, cond: temp === 'cold' && hum >= 2 };
  };

  // Прогноз: каждая ось совпадает с фактом с вероятностью 0,8, иначе — случайное значение фазы.
  S.rollForecast = function (state, actual, week) {
    const rng = AG.stateRng(state), ph = D.climatePhases[S.phaseOf(week || state.week + 1)];
    const f = {
      hum: rng() < 0.8 ? actual.hum : AG.pick(rng, ph.hum),
      temp: rng() < 0.8 ? actual.temp : D.tempValues[AG.pick(rng, ph.temp)],
      mat: rng() < 0.8 ? actual.mat : D.matValues[AG.pick(rng, ph.mat)],
    };
    f.cond = f.temp === 'cold' && f.hum >= 2;
    return f;
  };

  S.effectiveClimate = function (c, lv) {
    lv = lv || {};
    const e = { ...c };
    if (lv.vent) e.hum = Math.max(0, e.hum - 1);
    if (lv.humidify) e.hum = Math.min(3, e.hum + 1);
    if (lv.heat && e.temp === 'cold') e.temp = 'norm';
    if (lv.coolMat && e.mat === 'hot') e.mat = 'norm';
    if (lv.irrigFix && e.mat === 'flood') e.mat = 'norm';
    e.cond = e.temp === 'cold' && e.hum >= 2;
    return e;
  };

  S.flags = function (c) {
    return {
      dry: c.hum === 0, humHigh: c.hum === 2, humVHigh: c.hum === 3, humGE2: c.hum >= 2,
      cold: c.temp === 'cold', hot: c.temp === 'hot', cond: !!c.cond,
      matHot: c.mat === 'hot', matFlood: c.mat === 'flood',
      dryHot: c.hum === 0 && c.temp === 'hot',
    };
  };

  S.climateText = function (c) {
    const t = D.text;
    const parts = [t.humNames[c.hum], t.tempNames[c.temp]];
    if (c.cond) parts.push('конденсат');
    if (c.mat !== 'norm') parts.push(t.matNames[c.mat]);
    return parts;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
