import fs from 'fs';
import path from 'path';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

const files = walk('src/app/api');
for (const file of files) {
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes("from '@/lib/errors'")) {
    const lines = s.split('\n');
    let lastImport = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) lastImport = i;
    }
    lines.splice(lastImport + 1, 0, "import { errorMessage } from '@/lib/errors';");
    s = lines.join('\n');
  }
  s = s.replace(/catch \(err\) \{/g, 'catch (err: unknown) {');
  s = s.replace(/err\.message/g, 'errorMessage(err)');
  fs.writeFileSync(file, s);
  console.log('patched', file);
}
