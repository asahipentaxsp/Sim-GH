# «Агроном по защите» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** пошаговая игра на телефоне про защиту огурца на светокультуре, один HTML-файл.

**Architecture:** чистое ядро симуляции (`src/sim/*`) без DOM, покрытое тестами `node:test`; данные отдельно (`src/data.js`); SVG-рендер и UI поверх ядра; `build.js` склеивает всё в один HTML. Каждый файл — IIFE, кладёт свой модуль в `globalThis.AG`, поэтому одни и те же файлы работают и в Node (тесты), и в браузере.

**Tech Stack:** чистый JS (ES2020), SVG, CSS; Node 22 только для тестов и сборки; внешних зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-10-17-teplitsa-zashchita-design.md`

## Global Constraints

- Один HTML-файл, без внешних библиотек и CDN, рисование через SVG.
- Телефон, вертикальный экран, только тапы, минимальная зона тапа 44 px.
- Без localStorage, sessionStorage и любых браузерных хранилищ.
- Светлая тема = дневная теплица, тёмная = ночь под ДНаТ, через `prefers-color-scheme`; все цвета — CSS-переменные на `:root`.
- Сид сезона виден на экране и задаётся вручную; одинаковый сид + одинаковые действия = одинаковый результат.
- Цены условные, игровые; деньги в тыс. ₽; урожай в кг/м².
- Весь текст интерфейса на русском.
- UI-задачи (9, 10) начинаются с чтения `/mnt/skills/public/frontend-design/SKILL.md`.

## Review Focus

1. Двойной тап «Завершить неделю» — неделя продвигается ровно один раз (тест в задаче 7).
2. Действию не хватает часов, бюджета или доз — действие отклоняется целиком, без частичного применения, с понятной причиной (тест в задаче 4).
3. После недели 16 игра закрыта: `endWeek` и `applyAction` возвращают ошибку `season_over`, недели 17 нет (тест в задаче 7).
4. Сид пустой или не число — строка хешируется в число; пустой сид → случайный, и он показывается на экране (тест в задаче 2).
5. Повторная обработка той же клетки тем же средством в ту же неделю — эффективность не складывается выше максимальной, срок берётся максимальный, деньги и часы списываются повторно (тест в задаче 4).

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/core.js` | `AG` namespace, `makeRng(seed)`, `hashSeed(str)`, утилиты `clamp`, `pick` |
| `src/data.js` | все таблицы спецификации и тексты справочника/событий; без логики |
| `src/sim/state.js` | `newSeason`, геометрия поля, соседи |
| `src/sim/climate.js` | `rollClimate`, `effectiveClimate` (с рычагами), прогноз |
| `src/sim/actions.js` | `applyAction` и валидация |
| `src/sim/disease.js` | заражение, развитие, видимость, лечение |
| `src/sim/pests.js` | вредители и энтомофаги |
| `src/sim/week.js` | `endWeek`: порядок расчёта, урожай, события, ошибки; `finalReport` |
| `src/render.js` | SVG поля по состоянию |
| `src/ui.js` | экраны, панели, выбор целей, справочник, финал |
| `src/styles.css`, `src/index.html` | оболочка и стили |
| `build.js` | склейка в `dist/agronom-po-zashchite.html` |
| `tests/*.test.js` | модульные тесты ядра |
| `tests/balance.js` | балансовый прогон стратегий |

Идентификаторы (используются во всех задачах):
- болезни: `rootRot, crazyRoot, powdery, downy, botrytis, ascochyta, bacterial`
- вредители: `whitefly, thrips, mite, psychoda`
- энтомофаги: `encarsia, swirskii, cucumeris, phytoseiulus, californicus`
- средства: `gliokladin, trichocin, alirinGamair, mikozar, vlip, endobacterin, lovchiy, boverin, chemFungLeaf, chemFungMat, chemInsect, trapYellow, trapBlue`
- климат: `hum` 0–3 (сухо/норма/высокая/очень высокая), `temp` `'norm'|'cold'|'hot'`, `mat` `'norm'|'hot'|'flood'`, `cond` boolean
- рычаги: `vent, heat, coolMat, humidify, irrigFix`

---

### Task 1: Ядро, генератор случайности, таблицы данных

**Files:**
- Create: `src/core.js`, `src/data.js`, `tests/load.js`, `tests/data.test.js`

**Interfaces:**
- Produces: `AG.makeRng(seed:number) → () => number` в [0,1) (mulberry32); `AG.hashSeed(s:string) → uint32` (FNV-1a); `AG.DATA` с ключами `diseases, pests, enemies, products, climatePhases, levers, labor, yieldCurve, prep, start, text`; `tests/load.js` — `require` всех `src`-файлов по порядку, возвращает `globalThis.AG`.

- [ ] **Step 1: тесты целостности данных**

```js
test('rng детерминирован', () => { const a=AG.makeRng(42), b=AG.makeRng(42);
  assert.deepEqual([a(),a(),a()], [b(),b(),b()]); });
test('кривая урожая = 31,7 кг/м²', () =>
  assert.equal(Math.round(AG.DATA.yieldCurve.reduce((s,x)=>s+x,0)*10)/10, 31.7));
test('вероятности фаз климата в сумме 1', () => { for (const ph of AG.DATA.climatePhases)
  for (const axis of ['hum','temp','mat']) assert.ok(Math.abs(sum(ph[axis])-1) < 1e-9); });
test('цели средств ссылаются на существующие id', () => { /* каждый ключ products[*].leaf/mat/pests — в diseases или pests */ });
test('Трихоцин только при высадке', () => assert.equal(AG.DATA.products.trichocin.matOnlyWeek0, true));
```

- [ ] **Step 2:** `node --test tests/` → FAIL (модулей нет).
- [ ] **Step 3: реализовать `src/core.js` и `src/data.js`.** Значения — дословно из спецификации, разделы 4–11: `yieldCurve` из 17 элементов (индекс = неделя, 0–3 нули), цена 140, бюджет 600, часы 20, стартовый склад `{gliokladin:12, alirinGamair:12}`, недели формирования `[3,6,9,12]`, таблицы болезней (база по климату, распространение, латентность, особенности), вредителей, энтомофагов, средств (способ, эффективность, цена, `matOnlyWeek0`), рычагов, трудозатрат, подготовки. `text` — карточки справочника (возбудитель, симптомы, условия, распространение, чем защищать) и шаблоны событий; содержание из спецификации и материалов АБТ, указанных в разделе 14.
- [ ] **Step 4:** `node --test tests/` → PASS.
- [ ] **Step 5:** `git commit -m "feat: core rng and data tables"`

### Task 2: Состояние сезона и неделя 0

**Files:**
- Create: `src/sim/state.js`, `tests/state.test.js`

**Interfaces:**
- Consumes: `AG.makeRng`, `AG.hashSeed`, `AG.DATA`.
- Produces: `AG.sim.parseSeed(input:string) → {seed:number, shown:string}`; `AG.sim.newSeason(seed:number, prep:{disinfectGreenhouse, disinfectDrip, gliokladinStructures, seedlings, matAtPlanting: 'gliokladin'|'trichocin'|'mikozar'|null}) → State`; `AG.sim.neighbors4(i)`, `neighbors8(i)`, `rowOf(i)`, `rowCells(r)`.
- State: `{seed, rngState, week:1, over:false, budget, hours, stock, orders:[], arrivedEnemies:{}, climate, forecast, levers, cells[36], rows[6], prepMult:{leaf, botAsco, rootEarly}, crazySourceWeek, totals:{kg, potentialKg, revenue, spend:{prep, products, enemies, climate}}, events:[], mistakes:[], weekActions:[]}`.
- Cell: `{dis:{[id]:{stage, age}}, pests:{[id]:0-4}, enemies:{[id]:{lvl, age, sachet}}, leafProt:[{productId, eff:{[id]:n}, weeksLeft}], seen:{dis:{}, pests:{}}, trap:null|'yellow'|'blue', sanitizeWeeks:0, chemLoss:0}`.
- Row: `{matProt:{productId, eff:{[id]:n}, age}|null, noHygieneWeeks:0}`.

- [ ] **Step 1: тесты**

```js
test('36 клеток, 6 рядов', ...);
test('бюджет = 600 − подготовка − доза в маты', () => { const s = newSeason(1,{disinfectGreenhouse:true, disinfectDrip:true, gliokladinStructures:false, seedlings:false, matAtPlanting:'gliokladin'});
  assert.equal(s.budget, 600-60-40-36*0.4); });
test('без дезинфекции капельной системы очаг crazy root на неделе 2', () => assert.equal(newSeason(1,{...none}).crazySourceWeek, 2));
test('с дезинфекцией очага нет', () => assert.equal(newSeason(1,{...none, disinfectDrip:true}).crazySourceWeek, null));
test('множители подготовки складываются: ×0,25 для серой гнили и аскохитоза', ...);
test('parseSeed: "abc" → hashSeed, "" → случайный и shown непустой', ...);
```

- [ ] **Step 2:** запустить → FAIL.
- [ ] **Step 3:** реализовать. Состояние RNG хранится в `rngState` (число), чтобы сезон воспроизводился и сериализовался.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat: season state and week 0`.

### Task 3: Климат

**Files:**
- Create: `src/sim/climate.js`, `tests/climate.test.js`

**Interfaces:**
- Produces: `AG.sim.phaseOf(week) → 0|1|2` (1–3, 4–9, 10–16); `AG.sim.rollClimate(state, week) → Climate` (оси независимо по таблице фазы; `cond = temp==='cold' && hum>=2`); `AG.sim.rollForecast(state, actual) → Climate` (каждая ось совпадает с вероятностью 0,8, иначе случайное значение фазы); `AG.sim.effectiveClimate(climate, levers) → Climate`.

- [ ] **Step 1: тесты `effectiveClimate`**

```js
test('проветривание −1 влажность, не ниже 0', ...);
test('подогрев убирает холодную ночь и конденсат', () => { const c = effectiveClimate({hum:2,temp:'cold',mat:'norm',cond:true},{heat:true});
  assert.equal(c.temp,'norm'); assert.equal(c.cond,false); });
test('охлаждение раствора убирает перегрев, коррекция полива — перелив', ...);
test('увлажнение +1, не выше 3', ...);
test('частоты фазы 2 на 20000 бросков в пределах ±0,02 от таблицы', ...);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS. **Step 5:** commit `feat: climate`.

### Task 4: Действия игрока

**Files:**
- Create: `src/sim/actions.js`, `tests/actions.test.js`

**Interfaces:**
- Consumes: Task 2 State, `AG.DATA.labor`, `AG.DATA.products`, `AG.DATA.enemies`.
- Produces: `AG.sim.applyAction(state, action) → {ok:true, state} | {ok:false, error:string, state}` (state не меняется при ошибке); `AG.sim.actionCost(state, action) → {money, hours, doses}` для экрана подтверждения.
- Action: `{type:'inspect'|'leaf'|'mat'|'release'|'trap'|'sanitize'|'trayHygiene'|'disinfectSolution'|'order'|'lever', productId?, vlip?, scope:'cell'|'row'|'all', cell?, row?, enemyId?, color?, lever?, on?, doses?, urgent?}`.
- Боверин вносится действием `mat` (через полив, ряд или вся теплица).
- Ошибки: `no_hours`, `no_budget`, `no_stock`, `bad_scope`, `week0_only`, `season_over`, `no_enemies_arrived`.

- [ ] **Step 1: тесты**

```js
test('обход клетки: −0,5 ч, видны стадии ≥2 и скрытые с вероятностью 0,5', ...);
test('в мат нельзя на клетку → bad_scope', ...);
test('trichocin после недели 0 → week0_only', ...);
test('по листу с Влипом: weeksLeft 2, эффективность +0,1, доза Влипа списана', ...);
test('не хватает часов на всю теплицу (8 ч) → no_hours, состояние не изменилось', ...);
test('повторная обработка: eff = max, weeksLeft = max, деньги и часы списаны дважды', ...);
test('заказ обычный приходит на следующей неделе, срочный сразу за ×1,5', ...);
test('выпуск энтомофага без прибывшей партии → no_enemies_arrived', ...);
test('химия по листу: chemLoss клетки 0,4; инсектоакарицид 0,7, хищники клетки и 8 соседей = 0', ...);
test('химия в мат снимает matProt ряда', ...);
test('бактериоз: обход в неделю конденсата без подогрева при бактериозе в ряду — бросок заражения 0,3', ...);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. Лечебные эффекты не применяются здесь — действия записываются в `state.weekActions` и применяются в `endWeek` (шаг 1 порядка из спецификации, раздел 5). Здесь — только списание ресурсов, защита, ловушки, заказы, рычаги, мгновенная видимость от обхода и бросок бактериоза по мокрому листу. **Step 4:** PASS. **Step 5:** commit `feat: player actions`.

### Task 5: Болезни

**Files:**
- Create: `src/sim/disease.js`, `tests/disease.test.js`

**Interfaces:**
- Consumes: State, `effectiveClimate`, соседи из Task 2.
- Produces: `AG.sim.protectionEff(state, i, diseaseId) → 0..1` (максимум из листовой и матовой, матовая по возрасту 1/1/0,75/0,5); `AG.sim.applyTreatments(state, rng) → events[]`; `AG.sim.rollInfections(state, clim, rng) → events[]`; `AG.sim.progress(state, clim, rng) → events[]`; `AG.sim.worstLoss(cell) → 0..1`.

- [ ] **Step 1: тесты (rng подменяется массивом заданных чисел)**

```js
test('корневые гнили распространяются только внутри ряда', ...);
test('crazy root: на любую клетку ряда 0,15; максимум стадия 3; потеря 0,25 на стадиях 2–3', ...);
test('мучнистая роса: 8 соседей + прыжок 0,1', ...);
test('пероноспороз при конденсате +2 стадии за неделю', ...);
test('неделя формирования удваивает базу серой гнили и аскохитоза', ...);
test('защита 0,6 → вероятность ×0,4', ...);
test('биопрепарат: стадия 1 излечена с вероятностью eff, стадия 2 остановлена, 3–4 без эффекта', ...);
test('санитария: стадия 0, потеря 0,3 на 2 недели', ...);
test('психоды в ряду: корневым гнилям ряда +0,03', ...);
test('видимость: 3–4 всегда, 2 — с вероятностью 0,3 без обхода', ...);
test('множители подготовки действуют в недели 1–4 и не действуют на 5-й', ...);
test('обеззараживание раствора: распространение crazy root ×0,5 в эту неделю', ...);
test('химия по листу: стадия 2–3 → −1 с вероятностью 0,9; химия в мат — то же для корневых гнилей', ...);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS. **Step 5:** commit `feat: disease engine`.

### Task 6: Вредители и энтомофаги

**Files:**
- Create: `src/sim/pests.js`, `tests/pests.test.js`

**Interfaces:**
- Produces: `AG.sim.stepPests(state, clim, rng) → events[]` (появление, рост, распространение, затем хищники); `AG.sim.pestLoss(cell) → 0..1`; `AG.sim.trapView(state, i) → {[pestId]:lvl}` для 3×3.

- [ ] **Step 1: тесты**

```js
test('клещ: +2 при сухо и жаре', ...);
test('белокрылка ≥3: дополнительно −0,1 (сажистый гриб)', ...);
test('энтомофаг: неделя приживания, затем −1 добычи (−2 на уровне 3)', ...);
test('фитосейулюс без эффекта при сухо + жара; калифорникус работает', ...);
test('энкарзия без эффекта в неделю холодной ночи', ...);
test('пакетик свирского держится 4 недели без добычи', ...);
test('Боверин: психоды −2 уровня в ряду', ...);
test('Ловчий: трипсы и белокрылка −1 с вероятностью 0,7; Эндобактерин: клещ и трипсы −1 с вероятностью 0,7', ...);
test('инсектоакарицид: все вредители −2 с вероятностью 0,9', ...);
test('психоды появляются только при переливе или 4+ недели без гигиены', ...);
test('жёлтая ловушка показывает белокрылку и психод в 3×3, синяя — трипсов', ...);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS. **Step 5:** commit `feat: pests and natural enemies`.

### Task 7: Конец недели, урожай, ошибки, финал

**Files:**
- Create: `src/sim/week.js`, `tests/week.test.js`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces: `AG.sim.endWeek(state) → {ok, state, events[], error?}` в порядке раздела 5 спецификации; `AG.sim.finalReport(state) → {kgPerM2, pctPotential, revenue, spend, net, preventionVsLoss:{spent, lostRub}, mistakes:[top5], rank}`.
- Event: `{week, code, cells:number[], text}`; коды ошибок: `formation_unprotected, condensate_unheated, chem_killed_enemies, enemies_wasted, mat_unprotected, late_detection, flood_ignored`.

- [ ] **Step 1: тесты**

```js
test('урожай клетки = кривая × 280 м² × (1 − потери) × (1 − chemLoss)', ...);
test('неделя 4 при чистой теплице: 1,0 кг/м²', ...);
test('после недели 16: over=true; повторный endWeek → season_over', ...);
test('двойной вызов endWeek на одном объекте state продвигает неделю один раз (guard по state.week)', ...);
test('один сид + одинаковые действия → одинаковый finalReport', ...);
test('звание: <70 стажёр, 70–85 агроном, >85 главный агроном', ...);
test('ошибка formation_unprotected фиксируется, если в неделю формирования серая гниль заразила клетку без листовой защиты', ...);
test('энтомофаги, не выпущенные в неделю прибытия, пропадают и дают enemies_wasted', ...);
```

- [ ] **Step 2:** FAIL. **Step 3:** реализовать. Разбор недели — до 4 событий с наибольшим ущербом. **Step 4:** PASS. **Step 5:** commit `feat: week loop and final report`.

### Task 8: Балансовый прогон

**Files:**
- Create: `tests/balance.js`
- Modify: `src/data.js` (только числа)

**Interfaces:**
- Consumes: `newSeason`, `applyAction`, `endWeek`, `finalReport`.

- [ ] **Step 1:** написать три стратегии как функции `(state) → action[]` на неделю:
  - `nothing` — без действий;
  - `chemReactive` — подготовка отсутствует; химия по листу и в мат на клетки и ряды с видимой стадией ≥3 и их соседей; инсектоакарицид при плотности ≥3;
  - `bioIPM` — полная подготовка; биозащита в мат на всю теплицу каждые 4 недели (чередуя Алирин-Б + Гамаир и Микозар); Глиокладин с Влипом по листу в недели формирования; подогрев и Микозар с Влипом при прогнозе конденсата; свирский профилактически на неделе 2; фитосейулюс или калифорникус в видимые очаги клеща; Ловчий при плотности ≥2; санитария стадий ≥3; гигиена лотков каждые 3 недели.
- [ ] **Step 2:** `node tests/balance.js` (1000 сезонов на стратегию) печатает среднюю долю потенциала и чистый результат.
- [ ] **Step 3:** подогнать числа в `data.js`, пока не выполнится: `nothing` 45–55%; `chemReactive` 65–75%; `bioIPM` 85–90%; `net(bioIPM) > net(chemReactive)`; `bioIPM` укладывается в 600 тыс. ₽ и 20 ч в неделю. Каждое изменённое число записать в `docs/superpowers/balance-notes.md` с причиной.
- [ ] **Step 4:** `node --test tests/` → PASS (тесты не должны зависеть от подогнанных чисел, кроме явно указанных в спецификации).
- [ ] **Step 5:** commit `chore: balance pass`.

### Task 9: SVG-рендер поля

**Files:**
- Create: `src/render.js`, `tests/render.test.js`

**Interfaces:**
- Produces: `AG.render.field(state, {selected:number[], highlight:number[]}) → string` (SVG); каждая клетка — `<g data-cell="i">` с зоной тапа не меньше 44 px на экране шириной 360 px.

- [ ] **Step 1:** прочитать `/mnt/skills/public/frontend-design/SKILL.md`; сделать план токенов (палитра день/ночь ДНаТ, шрифт, изометрия) и проверить его против шаблонных решений из скилла.
- [ ] **Step 2: тесты**

```js
test('36 групп data-cell', ...);
test('видимая стадия ≥2 рисует слой симптома своего класса (sym-powdery и т.д.)', ...);
test('скрытая инфекция не рисуется', ...);
test('вредители: число силуэтов = плотность', ...);
test('ловушка и действующая защита отмечены', ...);
```

- [ ] **Step 3:** FAIL → реализовать → PASS. Симптомы — по спецификации, раздел 12, «Визуал».
- [ ] **Step 4:** commit `feat: svg field render`.

### Task 10: Интерфейс, сборка, проверка на телефоне

**Files:**
- Create: `src/ui.js`, `src/styles.css`, `src/index.html`, `build.js`

**Interfaces:**
- Consumes: всё ядро, `AG.render.field`.
- Produces: `dist/agronom-po-zashchite.html`.

- [ ] **Step 1:** экраны: старт (сид + подготовка недели 0 с ценами), игра (шапка, поле, вкладки Осмотр/В мат/По листу/Энтомофаги/Ловушки/Климат/Химия/Склад, кнопка «Завершить неделю»), карточка клетки, подтверждение с ценой и часами, разбор недели, справочник, финал. Подсказки недель 1–3 с выключателем. Кнопка «Завершить неделю» блокируется на время расчёта.
- [ ] **Step 2:** `build.js` инлайнит `styles.css` и все `src`-скрипты по порядку в `index.html`; запуск `node build.js` создаёт `dist/agronom-po-zashchite.html`; проверка: в файле нет `<script src` и `<link`.
- [ ] **Step 3:** прогнать собранный файл в headless Chromium (Playwright, если доступен; иначе jsdom): 16 недель без ошибок в консоли; ширины 320 и 390 px; светлая и тёмная схема; скриншоты для самопроверки.
- [ ] **Step 4:** `node --test tests/` → PASS; скопировать HTML в `/mnt/user-data/outputs/`.
- [ ] **Step 5:** commit `feat: ui and single-file build`.
