import { readdir, readFile, writeFile } from 'node:fs/promises';
const files = [];
async function walk(path) {
  for (const e of await readdir('dist' + path, { withFileTypes: true })) {
    const file = path + '/' + e.name;
    if (e.isDirectory()) {
      if (!['engine', 'licenses'].includes(e.name)) await walk(file);
    } else if (!file.endsWith('.tsv') && !['/sw.js', '/shell-assets.json'].includes(file))
      files.push(file);
  }
}
await walk('');
files.push('/');
for (const file of await readdir('dist/engine'))
  if (file.startsWith('manifest-') && file.endsWith('.json')) files.push('/engine/' + file);
await writeFile('dist/shell-assets.json', JSON.stringify(files));
const sw = await readFile('dist/sw.js', 'utf8');
await writeFile('dist/sw.js', sw.replace('__BUILD_ID__', Date.now().toString()));
