const test = require('node:test');
const assert = require('node:assert/strict');
const AG = require('./load')();
const S = AG.sim, R = AG.render;
const fresh = () => S.newSeason(1, { disinfectDrip: true });
const cellSvg = (svg, i) => {
  const m = svg.match(new RegExp(`<g data-cell="${i}"[\\s\\S]*?<!--/c${i}-->`));
  return m ? m[0] : '';
};

test('36 групп data-cell и viewBox', () => {
  const svg = R.field(fresh(), {});
  assert.equal((svg.match(/data-cell="/g) || []).length, 36);
  assert.match(svg, /viewBox="[-\d.]+ [-\d.]+ \d+ \d+"/);
});

test('изометрия: соседи по ряду и между рядами сдвинуты по диагонали', () => {
  const a = R.base(0), b = R.base(1), c = R.base(6);
  assert.ok(b.x > a.x && b.y > a.y, 'по ряду — вправо-вниз');
  assert.ok(c.x < a.x && c.y > a.y, 'следующий ряд — влево-вниз');
});

test('растения рисуются от дальних к ближним', () => {
  const svg = R.field(fresh(), {});
  const order = [...svg.matchAll(/data-cell="(\d+)"/g)].map(m => Number(m[1]));
  const depth = i => S.rowOf(i) + S.colOf(i);
  for (let k = 1; k < order.length; k++) assert.ok(depth(order[k]) >= depth(order[k - 1]));
});

test('попадание пальцем: центр каждого растения выбирает свою клетку', () => {
  for (let i = 0; i < 36; i++) {
    const p = R.plantCenter(i);
    assert.equal(R.cellAt(p.x, p.y), i, 'клетка ' + i);
    assert.equal(R.cellAt(p.x + 6, p.y - 8), i, 'рядом с центром ' + i);
  }
  assert.equal(R.cellAt(-9999, -9999), null);
});

test('шаг между растениями ≥44 px в режиме «Крупнее» на экране 358 px', () => {
  const g = R.geometry();
  const scale = 358 / g.width * R.ZOOM;
  const a = R.plantCenter(0), b = R.plantCenter(1);
  const pitch = Math.hypot(b.x - a.x, b.y - a.y) * scale;
  assert.ok(pitch >= 44, 'шаг ' + pitch.toFixed(1));
});

test('видимая стадия ≥2 рисует слой симптома своего класса и маркер', () => {
  const s = fresh();
  s.cells[3].dis.powdery = { stage: 3 }; s.cells[3].seen.dis.powdery = 3;
  s.cells[4].dis.crazyRoot = { stage: 2 }; s.cells[4].seen.dis.crazyRoot = 2;
  const svg = R.field(s, {});
  assert.match(cellSvg(svg, 3), /sym-powdery/);
  assert.match(cellSvg(svg, 3), /pin pin-bad/);
  assert.match(cellSvg(svg, 4), /sym-crazyRoot/);
  assert.match(cellSvg(svg, 4), /pin pin-warn/);
});

test('скрытая инфекция не рисуется', () => {
  const s = fresh();
  s.cells[5].dis.downy = { stage: 2 };
  assert.doesNotMatch(cellSvg(R.field(s, {}), 5), /sym-|pin /);
});

test('вредители: число силуэтов = видимая плотность', () => {
  const s = fresh();
  s.cells[6].pests.mite = 3; s.cells[6].seen.pests.mite = 3;
  s.cells[7].pests.thrips = 2;
  const svg = R.field(s, {});
  assert.equal((cellSvg(svg, 6).match(/class="pest pest-mite"/g) || []).length, 3);
  assert.doesNotMatch(cellSvg(svg, 7), /pest-/);
});

test('ловушка, энтомофаги и действующая защита отмечены', () => {
  const s = S.newSeason(1, { disinfectDrip: true, matAtPlanting: 'mikozar' });
  s.cells[8].trap = 'blue';
  s.cells[9].enemies.swirskii = { lvl: 1, age: 0, sachet: 4 };
  s.cells[10].leafProt.push({ productId: 'gliokladin', eff: { botrytis: 0.6 }, weeksLeft: 1 });
  const svg = R.field(s, {});
  assert.match(cellSvg(svg, 8), /trap trap-blue/);
  assert.match(cellSvg(svg, 9), /enemy/);
  assert.match(cellSvg(svg, 10), /prot-leaf/);
  assert.match(svg, /mat-prot/);
});

test('выделение и подсветка целей', () => {
  const svg = R.field(fresh(), { selected: [1], highlight: [2, 3] });
  assert.match(cellSvg(svg, 1), /is-selected/);
  assert.match(cellSvg(svg, 2), /is-target/);
});

test('антрацитовый каркас теплицы: стойки и стекло', () => {
  const svg = R.field(fresh(), {});
  assert.match(svg, /class="post/);
  assert.match(svg, /class="glass/);
});
