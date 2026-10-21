// Общее пространство имён, генератор случайности, утилиты.
(function (g) {
  const AG = g.AG || (g.AG = {});
  AG.sim = AG.sim || {};

  // mulberry32: состояние — одно 32-битное число, удобно хранить в state.
  AG.rngNext = function (s) {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { s, x: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  };
  AG.makeRng = function (seed) {
    let s = seed >>> 0;
    const r = () => { const o = AG.rngNext(s); s = o.s; return o.x; };
    r.state = () => s;
    return r;
  };
  // RNG, привязанный к state.rngState: каждое число продвигает состояние сезона.
  AG.stateRng = function (state) {
    return () => { const o = AG.rngNext(state.rngState); state.rngState = o.s; return o.x; };
  };
  AG.hashSeed = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  };
  AG.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Выбор индекса по массиву вероятностей.
  AG.pick = function (rng, probs) {
    let x = rng(), acc = 0;
    for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (x < acc) return i; }
    return probs.length - 1;
  };
  AG.clone = o => JSON.parse(JSON.stringify(o));
  AG.round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
})(typeof globalThis !== 'undefined' ? globalThis : window);
