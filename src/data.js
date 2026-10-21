// Все таблицы игры. Только данные, без логики.
// Деньги — тыс. ₽. Вероятности — за неделю. Источник чисел — спецификация v1.
(function (g) {
  const AG = g.AG;

  // Условия климата для таблиц болезней (вычисляются в climate.js → flags()).
  // dry: влажность 0; humHigh: 2; humVHigh: 3; humGE2: ≥2; cold; hot; cond; matHot; matFlood.

  const diseases = {
    rootRot: {
      kind: 'root', latency: 2, maxStage: 4,
      base: { max: [['matHot', 0.08], ['matFlood', 0.06], ['cold', 0.02]], else: 0 },
      spread: { mode: 'rowAdj', p: 0.25 },
    },
    crazyRoot: {
      kind: 'root', latency: 2, maxStage: 3, fixedLoss: 0.25,
      base: { max: [['matFlood', 0.03]], else: 0 },
      spread: { mode: 'rowAny', p: 0.15 },
    },
    powdery: {
      kind: 'leaf', latency: 1, maxStage: 4,
      base: { max: [['dry', 0.06], ['hot', 0.04], ['cold', 0.04]], else: 0.01 },
      spread: { mode: 'n8', p: 0.2, jump: 0.1 },
    },
    downy: {
      kind: 'leaf', latency: 1, maxStage: 4, condBoost: 2,
      base: { max: [['cond', 0.10], ['humVHigh', 0.05]], else: 0 },
      spread: { mode: 'n4', p: 0.1, pHum: 0.35 },
    },
    botrytis: {
      kind: 'leaf', latency: 1, maxStage: 4, formation: 2,
      base: { max: [['humHigh', 0.03], ['humVHigh', 0.07]], add: [['cold', 0.02]], else: 0 },
      spread: { mode: 'n4', p: 0.15 },
    },
    ascochyta: {
      kind: 'leaf', latency: 1, maxStage: 4, formation: 2,
      base: { max: [['humHigh', 0.02], ['humVHigh', 0.05]], else: 0 },
      spread: { mode: 'n8', p: 0.1 },
    },
    bacterial: {
      kind: 'leaf', latency: 1, maxStage: 4, wetWork: 0.3,
      base: { max: [['cond', 0.05]], else: 0 },
      spread: { mode: 'n4', p: 0.15 },
    },
  };

  const stageLoss = [0, 0, 0.05, 0.25, 0.6];

  const pests = {
    whitefly: { appear: 0.008, rate: { hot: 1, else: 0.5 }, spread: 0.2, sooty: 0.1, trap: 'yellow' },
    thrips: { appear: 0.008, rate: { hotOrDry: 1, else: 0.5 }, spread: 0.25, trap: 'blue' },
    mite: { appear: 0.006, rate: { both: 2, hotOrDry: 1, else: 0.5 }, spread: 0.3 },
    psychoda: { appear: 0.2, onlyFlood: true, rate: { flood: 1, else: 0 }, spread: 0.2, lossPerLvl: 0.03, rootRotAdd: 0.03, trap: 'yellow' },
  };
  const pestLoss = [0, 0, 0.03, 0.12, 0.3];

  const enemies = {
    encarsia: { targets: ['whitefly'], price: 1.0, blockedBy: 'cold' },
    swirskii: { targets: ['thrips', 'whitefly'], price: 2.0, sachet: 4 },
    cucumeris: { targets: ['thrips'], price: 1.5, sachet: 4 },
    phytoseiulus: { targets: ['mite'], price: 2.0, blockedBy: 'dryHot' },
    californicus: { targets: ['mite'], price: 2.0 },
  };

  // modes: где применяется. leaf/mat — эффективность профилактики по болезням.
  // pests — разовое снижение плотности {d, p}. cure — лечение химией.
  const products = {
    gliokladin: { name: 'Глиокладин, СП', abt: true, price: 0.4, modes: ['mat', 'leaf'],
      mat: { rootRot: 0.7, crazyRoot: 0.5 }, leaf: { botrytis: 0.6, ascochyta: 0.6 } },
    trichocin: { name: 'Трихоцин, СП', abt: true, price: 0.4, modes: ['mat'], matOnlyWeek0: true,
      mat: { rootRot: 0.7 } },
    alirinGamair: { name: 'Алирин-Б + Гамаир, СП', abt: true, price: 0.8, modes: ['mat', 'leaf'],
      mat: { rootRot: 0.75, crazyRoot: 0.5 }, leaf: { powdery: 0.6, bacterial: 0.6 } },
    mikozar: { name: 'Микозар, СП', abt: true, price: 1.0, modes: ['mat', 'leaf'],
      mat: { rootRot: 0.8, crazyRoot: 0.5 }, leaf: { downy: 0.6, ascochyta: 0.6, bacterial: 0.5 } },
    vlip: { name: 'Влип', abt: true, price: 0.2, modes: ['additive'] },
    endobacterin: { name: 'Эндобактерин, Ж', abt: true, price: 0.8, modes: ['leaf'],
      pests: { mite: { d: 1, p: 0.7 }, thrips: { d: 1, p: 0.7 } } },
    lovchiy: { name: 'Ловчий, СП', abt: true, price: 1.2, modes: ['leaf'],
      pests: { thrips: { d: 1, p: 0.7 }, whitefly: { d: 1, p: 0.7 } } },
    boverin: { name: 'Боверин', abt: true, price: 0.6, modes: ['mat'],
      pests: { psychoda: { d: 2, p: 1 } } },
    chemFungLeaf: { name: 'Химический фунгицид (по листу)', chem: true, price: 0.6, modes: ['leaf'],
      cure: { kind: 'leaf', p: 0.9, d: 2 }, leaf: { powdery: 0.8, downy: 0.8, botrytis: 0.8, ascochyta: 0.8, bacterial: 0.5 }, harvestLoss: 0.4, enemyHit: 1 },
    chemFungMat: { name: 'Химический фунгицид (в мат)', chem: true, price: 0.6, modes: ['mat'],
      cure: { kind: 'root', only: ['rootRot'], p: 0.9, d: 2 }, stripsMat: true },
    chemInsect: { name: 'Химический инсектоакарицид', chem: true, price: 0.8, modes: ['leaf'],
      pests: { whitefly: { d: 2, p: 0.9 }, thrips: { d: 2, p: 0.9 }, mite: { d: 2, p: 0.9 }, psychoda: { d: 2, p: 0.9 } },
      harvestLoss: 0.7, killsEnemies: true },
    trapYellow: { name: 'Жёлтая клеевая ловушка', price: 0.1, modes: ['trap'], color: 'yellow' },
    trapBlue: { name: 'Синяя клеевая ловушка', price: 0.1, modes: ['trap'], color: 'blue' },
  };

  const climatePhases = [
    { weeks: [1, 3], name: 'Тёплый старт', hum: [0.20, 0.50, 0.25, 0.05], temp: [0.50, 0.05, 0.45], mat: [0.55, 0.35, 0.10] },
    { weeks: [4, 9], name: 'Осень', hum: [0.05, 0.35, 0.40, 0.20], temp: [0.45, 0.50, 0.05], mat: [0.83, 0.02, 0.15] },
    { weeks: [10, 16], name: 'Отопление под лампами', hum: [0.45, 0.40, 0.12, 0.03], temp: [0.55, 0.10, 0.35], mat: [0.85, 0.05, 0.10] },
  ];
  const tempValues = ['norm', 'cold', 'hot'];
  const matValues = ['norm', 'hot', 'flood'];

  const levers = {
    vent: { name: 'Проветривание', price: 8, hours: 0, hint: 'Влажность на ступень ниже' },
    heat: { name: 'Подогрев труб', price: 12, hours: 0, hint: 'Убирает холодную ночь и конденсат' },
    coolMat: { name: 'Охлаждение раствора', price: 6, hours: 0, hint: 'Убирает перегрев матов' },
    humidify: { name: 'Увлажнение', price: 5, hours: 0, hint: 'Влажность на ступень выше' },
    irrigFix: { name: 'Коррекция полива', price: 0, hours: 1, hint: 'Убирает перелив матов' },
  };

  const labor = {
    inspect: 0.5,
    leaf: { cell: 0.25, row: 1.5, all: 8 },
    mat: { row: 0.5, all: 1 },
    release: 0.25,
    trap: 0.1,
    sanitize: 1,
    trayHygiene: 1,
    disinfectSolution: 0,
  };

  const prep = {
    disinfectGreenhouse: { name: 'Дезинфекция теплицы', price: 60, hint: 'Риск листовых болезней ×0,5 в первые 4 недели' },
    disinfectDrip: { name: 'Дезинфекция капельной системы и ёмкостей', price: 40, hint: 'Нет стартового очага бешеного корня' },
    gliokladinStructures: { name: 'Глиокладин на стёкла и конструкции', price: 15, hint: 'Риск серой гнили и аскохитоза ×0,5 в первые 4 недели' },
    seedlings: { name: 'Защита рассады (Глиокладин + Алирин-Б)', price: 10, hint: 'Корневые гнили в недели 1–2 ×0,3' },
  };

  const yieldCurve = [0, 0, 0, 0, 1.0, 2.0, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.8, 2.0, 1.5];

  AG.DATA = {
    rows: 6, cols: 6, weeks: 16,
    cellArea: 10000 / 36, pricePerKg: 0.14,
    diseases, stageLoss, pests, pestLoss, enemies, products,
    climatePhases, tempValues, matValues, levers, labor, prep, yieldCurve,
    formationWeeks: [3, 6, 9, 12],
    matDecay: [1, 1, 0.75, 0.5],
    vlipBonus: 0.1, leafWeeks: 1, leafWeeksVlip: 2,
    urgentMult: 1.5, solutionDisinfectPrice: 5,
    sanitizeLoss: 0.3, sanitizeWeeks: 2,
    start: { budget: 600, hours: 20, stock: { gliokladin: 12, alirinGamair: 12 } },
    ranks: [[85, 'Главный агроном'], [70, 'Агроном'], [0, 'Агроном-стажёр']],
    text: null, // заполняет text.js-раздел ниже
  };

  // ---------- Тексты ----------
  const humNames = ['сухо', 'норма', 'влажно', 'очень влажно'];
  const tempNames = { norm: 'температура в норме', cold: 'холодная ночь', hot: 'жара' };
  const matNames = { norm: 'маты в норме', hot: 'перегрев матов >30°', flood: 'перелив матов' };

  const ref = {
    rootRot: { name: 'Корневые гнили', short: 'корневая гниль',
      agent: 'Pythium spp., Fusarium oxysporum и др.',
      symptoms: 'Дневное увядание верхушки, побурение корней и шейки, растение отстаёт и гибнет.',
      conditions: 'Перегрев раствора и матов выше 30° (летняя посадка — питиоз), перелив, холодный субстрат.',
      spread: 'Медленно, но по всему ряду — через мат и раствор капельного полива.',
      control: 'Профилактика в маты: Глиокладин или Микозар после высадки, через 2–3 дня Алирин-Б + Гамаир, дальше ежемесячно. Климат: не перегревать и не переливать маты. Химия в мат — только при сильном поражении и с обязательным биопрепаратом после.' },
    crazyRoot: { name: 'Бешеный корень (crazy root)', short: 'бешеный корень',
      agent: 'Agrobacterium (Rhizobium) rhizogenes, носители Ri-плазмиды',
      symptoms: 'Корни массово разрастаются и вылезают из мата, растение «жирует» в вегетацию, урожай падает до 25–30%.',
      conditions: 'Заносится с поливной водой и биоплёнкой капельной системы, контактно при нарушении карантина.',
      spread: 'По раствору — на любые растения ряда.',
      control: 'Дезинфекция теплицы, лотков, капельной системы и ёмкостей до посадки. Биопрепараты в маты по схеме корневых гнилей. Обеззараживание раствора.' },
    powdery: { name: 'Мучнистая роса', short: 'мучнистая роса',
      agent: 'Erysiphe cichoracearum, Podosphaera xanthii',
      symptoms: 'Белый мучнистый налёт сверху листа, лист желтеет и засыхает.',
      conditions: 'Капельная влага не нужна. Сухой воздух днём, перепады температуры. Чаще на неустойчивых гибридах и в осеннем обороте.',
      spread: 'По воздуху на соседние растения и «прыжками» через теплицу.',
      control: 'Алирин-Б модиф. или Алирин-Б + Гамаир по листу с Влипом на опережение. Химия — при сильном поражении, затем биопрепараты.' },
    downy: { name: 'Пероноспороз (ложная мучнистая роса)', short: 'пероноспороз',
      agent: 'Pseudoperonospora cubensis',
      symptoms: 'Жёлтые угловатые пятна между жилками сверху, серо-фиолетовый налёт снизу.',
      conditions: 'Капельная влага на листе: конденсат после холодной ночи, очень высокая влажность.',
      spread: 'Очень быстро на соседей при высокой влажности.',
      control: 'Не допускать конденсата: подогрев труб, проветривание. Микозар по листу с Влипом на опережение.' },
    botrytis: { name: 'Серая гниль', short: 'серая гниль',
      agent: 'Botrytis cinerea',
      symptoms: 'Мокнущие пятна с серым пушистым налётом на стебле, в местах обрезки, на завязи.',
      conditions: 'Высокая влажность, холод, плохое проветривание. Вход через раны — риск растёт после формирования растений.',
      spread: 'На соседние растения.',
      control: 'Климат + Глиокладин по стеблям и листьям, особенно сразу после пасынкования и обрезки.' },
    ascochyta: { name: 'Аскохитоз', short: 'аскохитоз',
      agent: 'Ascochyta cucumis (Didymella bryoniae)',
      symptoms: 'Светлые, затем тёмные пятна с пикнидами на стебле у узлов и у основания, загнивание кончиков плодов.',
      conditions: 'Высокая влажность, раны после формирования.',
      spread: 'На соседей, в том числе через ряд.',
      control: 'Глиокладин или Микозар опрыскиванием по стеблям и листьям после формирования.' },
    bacterial: { name: 'Бактериоз (угловатая пятнистость)', short: 'бактериоз',
      agent: 'Pseudomonas syringae pv. lachrymans',
      symptoms: 'Маслянистые угловатые пятна, позже выпадают — лист «дырявый». Капли экссудата.',
      conditions: 'Капельная влага на листе.',
      spread: 'На соседей. Рабочие разносят его руками по мокрому листу — не работайте в ряду с бактериозом при конденсате без подогрева.',
      control: 'Гамаир (Алирин-Б + Гамаир) или Микозар по листу с Влипом, сухой лист.' },
    whitefly: { name: 'Тепличная белокрылка', short: 'белокрылка',
      agent: 'Trialeurodes vaporariorum',
      symptoms: 'Белые мошки на верхних листьях, личинки снизу листа. Медвяная роса и сажистый гриб.',
      conditions: 'Тепло ускоряет развитие.',
      spread: 'Перелетает на соседние растения.',
      control: 'Жёлтые ловушки для мониторинга. Энкарзия и свирский профилактически. Ловчий — совместим с энтомофагами.' },
    thrips: { name: 'Трипсы', short: 'трипсы',
      agent: 'Frankliniella occidentalis, Thrips tabaci',
      symptoms: 'Серебристые пятна на листьях, деформация и рубцы на плодах.',
      conditions: 'Жара и сухой воздух.',
      spread: 'Быстро на соседние растения.',
      control: 'Синие ловушки. Свирский или кукумерис пакетиками профилактически. Ловчий, Эндобактерин.' },
    mite: { name: 'Паутинный клещ', short: 'паутинный клещ',
      agent: 'Tetranychus urticae',
      symptoms: 'Мелкая светлая пятнистость, паутина, лист «мраморный» и засыхает.',
      conditions: 'Сухо и жарко — взрывной рост очагами. Увлажнение тормозит.',
      spread: 'Очагами на соседей.',
      control: 'Фитосейулюс в очаги (нужна влажность), калифорникус при жаре. Эндобактерин.' },
    psychoda: { name: 'Мухи-психоды (бабочницы)', short: 'психоды',
      agent: 'семейство Psychodidae',
      symptoms: 'Мелкие мохнатые мушки на матах и лотках, личинки в мокром субстрате и водорослях.',
      conditions: 'Перелив, застой воды и водоросли в лотках.',
      spread: 'Вдоль ряда.',
      control: 'Гигиена лотков, коррекция полива. Боверин (Beauveria bassiana) с поливом. Психоды — индикатор проблем с поливом и усиливают корневые гнили.' },
    encarsia: { name: 'Энкарзия', short: 'энкарзия', agent: 'Encarsia formosa',
      symptoms: 'Паразит личинок белокрылки: заражённые личинки чернеют.',
      conditions: 'Нужна тёплая погода: в холодную ночь не работает.', spread: '', control: 'Против белокрылки.' },
    swirskii: { name: 'Амблисейус свирский', short: 'свирский', agent: 'Amblyseius swirskii',
      symptoms: 'Хищный клещ: ест личинок трипса и яйца с личинками белокрылки.',
      conditions: 'Пакетики работают 4 недели даже без добычи.', spread: '', control: 'Против трипсов и белокрылки. Основной хищник на огурце.' },
    cucumeris: { name: 'Амблисейус кукумерис', short: 'кукумерис', agent: 'Neoseiulus cucumeris',
      symptoms: 'Хищный клещ: ест личинок трипса.',
      conditions: 'Пакетики работают 4 недели.', spread: '', control: 'Против трипсов.' },
    phytoseiulus: { name: 'Фитосейулюс', short: 'фитосейулюс', agent: 'Phytoseiulus persimilis',
      symptoms: 'Хищный клещ, специалист по паутинному клещу.',
      conditions: 'В сухую жару не работает — нужна влажность.', spread: '', control: 'Выпуск в очаги клеща.' },
    californicus: { name: 'Амблисейус калифорникус', short: 'калифорникус', agent: 'Neoseiulus californicus',
      symptoms: 'Хищный клещ против паутинного клеща.',
      conditions: 'Переносит жару и сухость лучше фитосейулюса.', spread: '', control: 'Против паутинного клеща.' },
  };

  const mistakes = {
    formation_unprotected: { title: 'Формирование без защиты', fix: 'В неделю пасынкования и обрезки обработайте стебли Глиокладином (лучше с Влипом).' },
    condensate_unheated: { title: 'Конденсат без подогрева', fix: 'При прогнозе холодной ночи и высокой влажности включайте подогрев труб, а лист закрывайте Микозаром с Влипом.' },
    chem_killed_enemies: { title: 'Химия уничтожила энтомофагов', fix: 'Биопрепараты (Ловчий, Эндобактерин) совместимы с хищниками — химия обнуляет вложения в энтомофагов.' },
    enemies_wasted: { title: 'Энтомофаги пропали', fix: 'Живых энтомофагов нельзя хранить: выпускайте в ту же неделю, когда партия пришла.' },
    mat_unprotected: { title: 'Маты без биозащиты', fix: 'Вносите биопрепараты в маты при высадке и затем ежемесячно — защита в мате выдыхается за 4 недели.' },
    late_detection: { title: 'Поздно заметили очаг', fix: 'Регулярный обход и ловушки находят болезнь на ранней стадии, когда биопрепарат ещё лечит.' },
    flood_ignored: { title: 'Перелив оставили как есть', fix: 'Коррекция полива стоит 1 час и убирает перелив — а перелив кормит корневые гнили и психод.' },
    hot_mat_ignored: { title: 'Перегрев матов', fix: 'При перегреве раствора выше 30° включайте охлаждение — это главный триггер питиоза при летней посадке.' },
  };

  AG.DATA.text = { ref, mistakes, humNames, tempNames, matNames };
})(typeof globalThis !== 'undefined' ? globalThis : window);
