import { mkdir, writeFile, copyFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const json = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${url}: ${r.status}`);
  return r.json();
};
const download = async (url, path) => {
  const r = await fetch(url);
  if (!r.ok) throw Error(`${url}: ${r.status}`);
  await writeFile(path, Buffer.from(await r.arrayBuffer()));
};
await Promise.all(
  ['public/engine', 'public/data', 'public/assets/pieces', 'public/licenses'].map((p) =>
    mkdir(p, { recursive: true }),
  ),
);
if (!process.argv.includes('--data-only')) {
  const pkg = JSON.parse(await readFile('node_modules/stockfish/package.json', 'utf8'));
  if (!pkg.version.startsWith('19.')) throw Error('Stockfish 19 required');
  const assets = [];
  for (const flavor of ['single', 'lite-single'])
    for (const ext of ['js', 'wasm']) {
      const name = `stockfish-19-${flavor}.${ext}`;
      await copyFile(`node_modules/stockfish/bin/${name}`, `public/engine/${name}`);
      const bytes = await readFile(`public/engine/${name}`);
      assets.push({
        url: `/engine/${name}`,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        flavor: flavor === 'single' ? 'full' : 'lite',
      });
    }
  await copyFile('node_modules/stockfish/Copying.txt', 'public/licenses/stockfish-GPL-3.0.txt');
  const buildId = createHash('sha256')
    .update(assets.map((a) => a.sha256).join(''))
    .digest('hex')
    .slice(0, 16);
  const content = JSON.stringify(
    {
      version: pkg.version,
      buildId,
      source: `https://github.com/nmrugg/stockfish.js/tree/v${pkg.version}`,
      assets,
    },
    null,
    2,
  );
  await writeFile('public/engine/manifest.json', content);
  await writeFile(`public/engine/manifest-${buildId}.json`, content);
  await writeFile(
    'src/engine/build.ts',
    `// Generated from the pinned engine asset checksums.\nexport const ENGINE_BUILD_ID = '${buildId}';\n`,
  );
  console.log('Stockfish assets prepared');
}
if (process.argv.includes('--engine-only')) process.exit(0);
const revision = JSON.parse(await readFile('scripts/asset-sources.json', 'utf8')).openingsRevision;
const { Chess } = await import('chess.js');
const names = {},
  book = new Set();
await Promise.all(
  ['a', 'b', 'c', 'd', 'e'].map(async (v) => {
    const r = await fetch(
      `https://raw.githubusercontent.com/lichess-org/chess-openings/${revision}/${v}.tsv`,
    );
    if (!r.ok) throw Error('Opening download failed');
    const text = await r.text();
    await writeFile(`public/data/${v}.tsv`, text);
    for (const line of text.trim().split('\n').slice(1)) {
      const [eco, name, pgn] = line.split('\t');
      const c = new Chess();
      c.loadPgn(pgn);
      const h = c.history();
      c.reset();
      for (const san of h) {
        c.move(san);
        book.add(c.fen().split(' ').slice(0, 4).join(' '));
      }
      const key = c.fen().split(' ').slice(0, 4).join(' ');
      if (!names[key] || name.length > names[key].name.length) names[key] = { eco, name };
    }
  }),
);
await writeFile('public/data/openings.json', JSON.stringify({ revision, names, book: [...book] }));
console.log(`Prepared ${Object.keys(names).length} named opening positions`);
await Promise.all(
  ['w', 'b'].flatMap((c) =>
    ['K', 'Q', 'R', 'B', 'N', 'P'].map((p) =>
      download(
        `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${c}${p}.svg`,
        `public/assets/pieces/${c}${p}.svg`,
      ),
    ),
  ),
);
await writeFile(
  'public/licenses/pieces.txt',
  'Chess pieces by Cburnett, CC BY-SA 3.0. Source: https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces\nDistributed via https://github.com/lichess-org/lila/tree/master/public/piece/cburnett\nLicense: https://creativecommons.org/licenses/by-sa/3.0/\n',
);
await writeFile(
  'public/licenses/openings.txt',
  `Opening names: lichess-org/chess-openings, CC0 1.0, revision ${revision}.\nhttps://github.com/lichess-org/chess-openings/tree/${revision}\n`,
);
