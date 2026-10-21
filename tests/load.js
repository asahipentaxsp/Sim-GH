// Загружает все модули src в общий namespace globalThis.AG (порядок важен).
const path = require('path');
const fs = require('fs');
const ORDER = ['core.js', 'data.js', 'sim/state.js', 'sim/climate.js', 'sim/actions.js',
  'sim/disease.js', 'sim/pests.js', 'sim/week.js', 'render.js'];
module.exports = function load() {
  for (const f of ORDER) {
    const p = path.join(__dirname, '..', 'src', f);
    if (fs.existsSync(p)) require(p);
  }
  return globalThis.AG;
};
module.exports.ORDER = ORDER;
