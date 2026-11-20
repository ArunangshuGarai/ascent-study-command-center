const fs = require('fs');
const path = require('path');
const roots = ['src', 'src/components'];
let all = [];
for (const dir of roots) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue;
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /className=(?:\{`([^`]*)`\}|'([^']*)'|"([^"]*)")/g;
    let m;
    while ((m = re.exec(s))) {
      const val = m[1] || m[2] || m[3];
      val.split(/\s+/).forEach((c) => {
        c = c.replace(/\$\{.*?\}/g, '').trim();
        if (c && !c.includes('{') && !c.includes('}')) all.push(c);
      });
    }
  }
}
console.log([...new Set(all)].sort().join('\n'));
