// Склейка в один HTML: node build.js
// dist/agronom-po-zashchite.html — самостоятельный файл (открыть в браузере)
// dist/artifact.html — то же содержимое без <!doctype>/<html>/<head>/<body> для публикации
const fs = require('fs');
const path = require('path');
const ORDER = ['core.js', 'data.js', 'sim/state.js', 'sim/climate.js', 'sim/actions.js', 'sim/disease.js', 'sim/pests.js', 'sim/week.js', 'render.js', 'ui.js'];
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const css = src('styles.css');
const js = ORDER.map(f => `// ---- ${f} ----\n${src(f)}`).join('\n').replace(/<\/script/gi, '<\\/script');
const content = `<title>Агроном по защите</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Пошаговая игра: защита огурца на светокультуре биопрепаратами АгроБиоТехнологии и энтомофагами.">
<style>
${css}
</style>
<div id="app"></div>
<script>
${js}
</script>
`;
const full = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${content.split('<div id="app">')[0]}</head>
<body>
<div id="app">${content.split('<div id="app">')[1]}</body>
</html>
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'agronom-po-zashchite.html'), full);
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), content);
for (const f of ['agronom-po-zashchite.html', 'artifact.html']) {
  const t = fs.readFileSync(path.join(__dirname, 'dist', f), 'utf8');
  if (/<script\s+src|<link\s/i.test(t)) throw new Error(f + ': есть внешние ресурсы');
  console.log(f, (t.length / 1024).toFixed(1) + ' КБ');
}
