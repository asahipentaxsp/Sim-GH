// Изометрическое поле теплицы (SVG). Ночь, свет ДНаТ, антрацитовый каркас.
// Координаты сетки: u — вдоль ряда (секция), v — поперёк (номер ряда). Экран: x=(u−v)·TW/2, y=(u+v)·TH/2.
(function (g) {
  const AG = g.AG, D = AG.DATA, S = AG.sim;
  const R = AG.render = {};
  const TW = 60, TH = 34;
  const N = D.rows * D.cols;
  const GH = 9;          // высота лотка над полом
  const PH = 80;         // высота шпалеры
  const WALL = 132;      // высота стеклянных стен
  const MINX = -200, MINY = -WALL - 18, W = 400, H = 382;
  R.ZOOM = 1.6;

  const f = n => Math.round(n * 10) / 10;
  const P = (u, v, z = 0) => ({ x: (u - v) * TW / 2, y: (u + v) * TH / 2 - z });
  const pts = arr => arr.map(p => `${f(p.x)},${f(p.y)}`).join(' ');
  const poly = (cls, arr, extra = '') => `<polygon class="${cls}" points="${pts(arr)}"${extra}/>`;
  const hsh = (i, k) => { let x = (i + 1) * 374761393 + (k + 1) * 668265263; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

  R.geometry = () => ({ width: W, height: H, minX: MINX, minY: MINY, tileW: TW, tileH: TH });
  R.base = i => P(S.colOf(i) + 0.5, S.rowOf(i) + 0.5, GH + 4);
  R.plantCenter = i => { const b = R.base(i); return { x: b.x, y: b.y - 34 }; };
  R.cellAt = function (x, y) {
    let best = null, bd = 30 * 30;
    for (let i = 0; i < N; i++) {
      const c = R.plantCenter(i), d = (c.x - x) ** 2 + ((c.y - y) * 0.8) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  // ---------- сцена ----------
  function floor() {
    const a = P(-0.35, -0.35), b = P(6.35, -0.35), c = P(6.35, 6.35), d = P(-0.35, 6.35);
    const drop = p => ({ x: p.x, y: p.y + 14 });
    const out = [poly('slab-top', [a, b, c, d]), poly('slab-left', [d, c, drop(c), drop(d)]), poly('slab-right', [c, b, drop(b), drop(c)])];
    // дорожки и трубы отопления «рельсы» между рядами
    for (let r = 0; r <= D.rows; r++) {
      const v = r === 0 ? -0.05 : r === D.rows ? 6.05 : r;
      out.push(`<line class="rail" x1="${f(P(0, v - 0.07).x)}" y1="${f(P(0, v - 0.07).y)}" x2="${f(P(6, v - 0.07).x)}" y2="${f(P(6, v - 0.07).y)}"/>`);
      out.push(`<line class="rail" x1="${f(P(0, v + 0.07).x)}" y1="${f(P(0, v + 0.07).y)}" x2="${f(P(6, v + 0.07).x)}" y2="${f(P(6, v + 0.07).y)}"/>`);
    }
    // световые пятна ДНаТ на полу
    for (let r = 0; r < D.rows; r++) for (let c = 0; c < D.cols; c += 2) {
      const p = P(c + 1, r + 0.5);
      out.push(`<ellipse class="glow" cx="${f(p.x)}" cy="${f(p.y)}" rx="${TW * 0.95}" ry="${TH * 0.95}"/>`);
    }
    return out.join('');
  }

  function walls() {
    const out = [];
    // задняя правая стена (v = −0.35) и задняя левая (u = −0.35)
    const wall = (from, to) => {
      const top = p => ({ x: p.x, y: p.y - WALL });
      out.push(poly('glass', [from, to, top(to), top(from)]));
      const steps = 6;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        const cls = k % 3 === 0 ? 'post' : 'mullion';
        out.push(`<line class="${cls}" x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(p.x)}" y2="${f(p.y - WALL)}"/>`);
      }
      out.push(`<line class="beam" x1="${f(from.x)}" y1="${f(from.y - WALL)}" x2="${f(to.x)}" y2="${f(to.y - WALL)}"/>`);
      out.push(`<line class="sill" x1="${f(from.x)}" y1="${f(from.y - 18)}" x2="${f(to.x)}" y2="${f(to.y - 18)}"/>`);
    };
    wall(P(-0.35, -0.35), P(6.35, -0.35));
    wall(P(-0.35, -0.35), P(-0.35, 6.35));
    // фермы крыши — от задних стен к ближним углам
    for (const k of [2, 4, 6]) {
      const a = P(k - 0.35, -0.35, WALL), b = P(k - 0.35, 3, WALL + 34);
      out.push(`<line class="truss" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}"/>`);
      const c = P(-0.35, k - 0.35, WALL), d = P(3, k - 0.35, WALL + 34);
      out.push(`<line class="truss" x1="${f(c.x)}" y1="${f(c.y)}" x2="${f(d.x)}" y2="${f(d.y)}"/>`);
    }
    return out.join('');
  }

  function cornerPosts() {
    const out = [];
    for (const p of [P(6.35, -0.35), P(-0.35, 6.35)]) {
      out.push(`<rect class="post-box" x="${f(p.x - 3)}" y="${f(p.y - WALL)}" width="6" height="${WALL}"/>`);
    }
    return out.join('');
  }

  function lamps() {
    const out = [];
    for (let r = 0; r < D.rows; r++) for (let c = 0; c < D.cols; c += 2) {
      const p = P(c + 1, r + 0.5, PH + 22);
      out.push(`<g class="lamp-unit"><line class="hanger" x1="${f(p.x)}" y1="${f(p.y - 10)}" x2="${f(p.x)}" y2="${f(p.y)}"/>` +
        `<polygon class="lamp-body" points="${f(p.x - 9)},${f(p.y)} ${f(p.x + 9)},${f(p.y)} ${f(p.x + 6)},${f(p.y + 4)} ${f(p.x - 6)},${f(p.y + 4)}"/>` +
        `<ellipse class="lamp-bulb" cx="${f(p.x)}" cy="${f(p.y + 4.5)}" rx="4.5" ry="1.6"/></g>`);
    }
    return `<g class="lamps">${out.join('')}</g>`;
  }

  // ---------- клетка ----------
  function tile(i) {
    const r = S.rowOf(i), c = S.colOf(i);
    return poly('tile', [P(c + 0.06, r + 0.06), P(c + 0.94, r + 0.06), P(c + 0.94, r + 0.94), P(c + 0.06, r + 0.94)]);
  }

  function gutter(i, state) {
    const r = S.rowOf(i), c = S.colOf(i);
    const v0 = r + 0.34, v1 = r + 0.66, u0 = c + 0.02, u1 = c + 0.98, zt = GH + 4;
    const mp = state.rows[r].matProt;
    const fresh = mp && D.matDecay[mp.age] >= 1;
    const out = [];
    // ножки
    out.push(`<line class="leg" x1="${f(P(c + 0.5, v1).x)}" y1="${f(P(c + 0.5, v1).y)}" x2="${f(P(c + 0.5, v1, GH).x)}" y2="${f(P(c + 0.5, v1, GH).y)}"/>`);
    out.push(poly('gutter-side', [P(u0, v1, GH), P(u1, v1, GH), P(u1, v1, zt), P(u0, v1, zt)]));
    if (c === D.cols - 1) out.push(poly('gutter-end', [P(u1, v0, GH), P(u1, v1, GH), P(u1, v1, zt), P(u1, v0, zt)]));
    out.push(poly('mat' + (mp ? ' mat-prot' + (fresh ? '' : ' mat-prot-fading') : ''), [P(u0, v0, zt), P(u1, v0, zt), P(u1, v1, zt), P(u0, v1, zt)]));
    const d0 = P(u0, r + 0.5, zt + 0.5), d1 = P(u1, r + 0.5, zt + 0.5);
    out.push(`<line class="drip" x1="${f(d0.x)}" y1="${f(d0.y)}" x2="${f(d1.x)}" y2="${f(d1.y)}"/>`);
    return out.join('');
  }

  function leafPath(x, y, s, dir) {
    const k = s * dir;
    return `M${f(x)} ${f(y)} c${f(k * 0.2)} ${f(-s * 0.55)} ${f(k * 0.75)} ${f(-s * 0.75)} ${f(k * 1.05)} ${f(-s * 0.45)} ` +
      `c${f(k * 0.12)} ${f(s * 0.18)} ${f(-k * 0.02)} ${f(s * 0.32)} ${f(-k * 0.12)} ${f(s * 0.42)} ` +
      `c${f(-k * 0.2)} ${f(s * 0.3)} ${f(-k * 0.6)} ${f(s * 0.32)} ${f(-k * 0.93)} ${f(s * 0.03)}z`;
  }
  const worstSeen = cell => Object.values(cell.seen.dis).reduce((a, b) => Math.max(a, b), 0);

  function plant(i, cell, week) {
    const r = S.rowOf(i), c = S.colOf(i);
    const b = R.base(i), top = b.y - PH + 12;
    const worst = worstSeen(cell), droop = cell.seen.dis.rootRot >= 2;
    const tone = worst >= 4 ? ' dead' : worst >= 3 ? ' sick' : '';
    const parts = [];
    // шпалерная проволока вдоль ряда
    const w0 = P(c, r + 0.5, PH + 4), w1 = P(c + 1, r + 0.5, PH + 4);
    parts.push(`<line class="wire" x1="${f(w0.x)}" y1="${f(w0.y)}" x2="${f(w1.x)}" y2="${f(w1.y)}"/>`);
    parts.push(`<line class="twine" x1="${f(b.x)}" y1="${f(top)}" x2="${f(w0.x + TW / 4)}" y2="${f(w0.y + TH / 4)}"/>`);
    parts.push(`<path class="stem" d="M${f(b.x)} ${f(b.y)} C${f(b.x - 3)} ${f(b.y - 22)} ${f(b.x + 3)} ${f(top + 24)} ${f(b.x)} ${f(top)}"/>`);
    const n = cell.sanitizeWeeks > 0 ? 3 : 6;
    const leaves = [];
    for (let k = 0; k < n; k++) {
      const ly = top + 6 + k * ((b.y - top - 12) / 6);
      const dir = k % 2 ? -1 : 1;
      const sz = 16 - k * 0.5;
      const rot = droop ? dir * 40 : dir * (-8 + hsh(i, k) * 10);
      leaves.push({ x: b.x, y: ly, dir, sz });
      const tr = ` transform="rotate(${f(rot)} ${f(b.x)} ${f(ly)})"`;
      parts.push(`<path class="leaf-under${tone}"${tr} d="${leafPath(b.x, ly, sz, dir)}"/>`);
      parts.push(`<path class="leaf-top${tone}"${tr} d="${leafPath(b.x + dir * 0.6, ly - 1.4, sz * 0.82, dir)}"/>`);
    }
    if (week >= 4 && worst < 4) {
      const nf = worst >= 3 ? 1 : 3;
      for (let k = 0; k < nf; k++) {
        const fy = top + 20 + k * 11, fx = b.x + (k % 2 ? -5 : 5);
        parts.push(`<rect class="fruit" x="${f(fx - 1.8)}" y="${f(fy)}" width="3.6" height="12" rx="1.8"/><rect class="fruit-hl" x="${f(fx - 0.9)}" y="${f(fy + 2)}" width="1" height="7" rx=".5"/>`);
      }
    }
    return { svg: parts.join(''), leaves, cx: b.x, ground: b.y, top };
  }

  function symptoms(i, cell, p) {
    const out = [];
    for (const [id, st] of Object.entries(cell.seen.dis)) {
      if (st < 2) continue;
      const n = st === 2 ? 3 : st === 3 ? 6 : 10;
      const d = [];
      const onLeaf = k => {
        const L = p.leaves[k % p.leaves.length];
        return { x: L.x + L.dir * (3 + hsh(i, k) * L.sz * 0.75), y: L.y - 2 - hsh(i, k + 50) * L.sz * 0.5 };
      };
      if (id === 'powdery') for (let k = 0; k < n; k++) { const q = onLeaf(k); d.push(`<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(1.1 + hsh(i, k + 9) * 1.2)}"/>`); }
      if (id === 'downy') for (let k = 0; k < n; k++) { const q = onLeaf(k); d.push(`<rect x="${f(q.x - 1.7)}" y="${f(q.y - 1.3)}" width="3.4" height="2.6"/>`); }
      if (id === 'bacterial') for (let k = 0; k < n; k++) { const q = onLeaf(k); d.push(`<polygon points="${f(q.x)},${f(q.y - 2)} ${f(q.x + 2)},${f(q.y)} ${f(q.x)},${f(q.y + 1.6)} ${f(q.x - 1.8)},${f(q.y)}"/>`); }
      if (id === 'botrytis') { const sy = p.ground - 12 - hsh(i, 3) * 14; d.push(`<circle cx="${f(p.cx)}" cy="${f(sy)}" r="${st >= 3 ? 5 : 3.5}"/><circle class="fuzz" cx="${f(p.cx)}" cy="${f(sy)}" r="${st >= 3 ? 7.5 : 5.5}"/>`); }
      if (id === 'ascochyta') for (let k = 0; k < Math.min(n, 5); k++) d.push(`<ellipse cx="${f(p.cx)}" cy="${f(p.top + 10 + k * 10)}" rx="1.9" ry="${st >= 3 ? 3.2 : 2.2}"/>`);
      if (id === 'rootRot') d.push(`<rect x="${f(p.cx - 2.6)}" y="${f(p.ground - 7)}" width="5.2" height="8" rx="1.5"/>`);
      if (id === 'crazyRoot') for (let k = 0; k < (st >= 3 ? 6 : 3); k++) {
        const dx = (hsh(i, k) - 0.5) * 26;
        d.push(`<path d="M${f(p.cx)} ${f(p.ground + 1)} q${f(dx / 2)} ${f(5 + hsh(i, k + 4) * 3)} ${f(dx)} ${f(4 + hsh(i, k + 7) * 5)}"/>`);
      }
      out.push(`<g class="sym sym-${id} st${st}">${d.join('')}</g>`);
    }
    return out.join('');
  }

  function pests(i, cell, p) {
    const out = [];
    for (const [id, lvl] of Object.entries(cell.seen.pests)) {
      for (let k = 0; k < lvl; k++) {
        const L = p.leaves[(k + 1) % p.leaves.length];
        const x = f(L.x + L.dir * (4 + hsh(i, k + 20) * 8)), y = f(L.y - 4 - hsh(i, k + 30) * 5);
        let sh;
        if (id === 'whitefly') sh = `<path d="M${x} ${y} l-2.6 -1.7 l0.4 2.8z M${x} ${y} l2.6 -1.7 l-0.4 2.8z"/>`;
        else if (id === 'thrips') sh = `<rect x="${x}" y="${y}" width="4.2" height="1.2" rx=".6" transform="rotate(${Math.round(hsh(i, k) * 60 - 30)} ${x} ${y})"/>`;
        else if (id === 'mite') sh = `<circle cx="${x}" cy="${y}" r="1.3"/>` + (k === 0 ? `<path class="web" d="M${x} ${y} l${f(L.dir * 9)} -6"/>` : '');
        else { const mx = f(p.cx - 12 + k * 6), my = f(p.ground + 2); sh = `<path d="M${mx} ${my} c-2 -2.5 -3.5 0 0 2 c3.5 -2 2 -4.5 0 -2z"/>`; }
        out.push(`<g class="pest pest-${id}">${sh}</g>`);
      }
    }
    return out.join('');
  }

  function extras(i, cell, p) {
    const out = [];
    if (cell.leafProt.length) out.push(`<ellipse class="prot-leaf" cx="${f(p.cx)}" cy="${f((p.top + p.ground) / 2)}" rx="16" ry="${f((p.ground - p.top) / 2 + 3)}"/>`);
    for (const [id, e] of Object.entries(cell.enemies)) {
      if (D.enemies[id].sachet) out.push(`<g class="enemy enemy-${id}"><line x1="${f(p.cx + 2)}" y1="${f(p.top + 26)}" x2="${f(p.cx + 6)}" y2="${f(p.top + 30)}"/><rect x="${f(p.cx + 4)}" y="${f(p.top + 30)}" width="6.5" height="8.5" rx="1"/></g>`);
      else out.push(`<g class="enemy enemy-${id}"><circle cx="${f(p.cx - 9)}" cy="${f(p.top + 34)}" r="1.7"/><circle cx="${f(p.cx - 6)}" cy="${f(p.top + 38)}" r="1.7"/>${e.lvl >= 2 ? `<circle cx="${f(p.cx - 11)}" cy="${f(p.top + 39)}" r="1.7"/>` : ''}</g>`);
    }
    if (cell.trap) out.push(`<g class="trap trap-${cell.trap}"><line x1="${f(p.cx + 12)}" y1="${f(p.ground - 2)}" x2="${f(p.cx + 12)}" y2="${f(p.top + 20)}"/><rect x="${f(p.cx + 8)}" y="${f(p.top + 8)}" width="8" height="12" rx="1"/></g>`);
    // маркер над растением: болезнь или вспышка вредителя
    const ws = worstSeen(cell);
    const pestHi = Object.values(cell.seen.pests).some(l => l >= 3);
    if (ws >= 2 || pestHi) {
      const cls = ws >= 3 || pestHi ? 'pin pin-bad' : 'pin pin-warn';
      out.push(`<g class="${cls}"><circle class="pin-halo" cx="${f(p.cx)}" cy="${f(p.top - 9)}" r="6.5"/><circle cx="${f(p.cx)}" cy="${f(p.top - 9)}" r="3.6"/></g>`);
    }
    return out.join('');
  }

  R.field = function (state, opts) {
    opts = opts || {};
    const sel = new Set(opts.selected || []), hl = new Set(opts.highlight || []);
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => (S.rowOf(a) + S.colOf(a)) - (S.rowOf(b) + S.colOf(b)) || S.rowOf(a) - S.rowOf(b));
    const out = [`<svg class="field" viewBox="${MINX} ${MINY} ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Теплица: 6 рядов по 6 секций">`];
    out.push(`<defs><radialGradient id="hps" cx="50%" cy="20%" r="75%"><stop offset="0" stop-color="var(--hps)" stop-opacity=".22"/><stop offset="1" stop-color="var(--hps)" stop-opacity="0"/></radialGradient></defs>`);
    out.push(`<rect class="sky" x="${MINX}" y="${MINY}" width="${W}" height="${H}"/><rect x="${MINX}" y="${MINY}" width="${W}" height="${H}" fill="url(#hps)"/>`);
    out.push(walls(), floor());
    for (const i of order) {
      const cell = state.cells[i];
      const cls = ['cell'];
      if (sel.has(i)) cls.push('is-selected');
      if (hl.has(i)) cls.push('is-target');
      const p = plant(i, cell, state.week);
      out.push(`<g data-cell="${i}" class="${cls.join(' ')}" aria-label="Ряд ${S.rowOf(i) + 1}, секция ${S.colOf(i) + 1}">`);
      out.push(tile(i), gutter(i, state), p.svg, symptoms(i, cell, p), pests(i, cell, p), extras(i, cell, p));
      if (sel.has(i)) out.push(`<ellipse class="sel-ring" cx="${f(p.cx)}" cy="${f((p.top + p.ground) / 2)}" rx="17" ry="${f((p.ground - p.top) / 2 + 5)}"/>`);
      out.push(`</g><!--/c${i}-->`);
    }
    // номера рядов у правого края
    for (let r = 0; r < D.rows; r++) {
      const p = P(6.75, r + 0.5);
      out.push(`<text class="row-num" x="${f(p.x)}" y="${f(p.y + 4)}" text-anchor="middle">${r + 1}</text>`);
    }
    out.push(cornerPosts(), '</svg>');
    return out.join('');
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
