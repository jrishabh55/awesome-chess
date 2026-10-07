import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const revision = 'a6e52f5c811ee18863cb2f0e81f2433a5b9905de';
const source = `https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/${revision}/`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function download(path, destination) {
  const response = await fetch(source + path);
  if (!response.ok) throw Error(`Maia asset download failed: ${response.status} (${path})`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

export async function prepareMaia() {
  await mkdir('public/maia', { recursive: true });
  await mkdir('public/licenses', { recursive: true });
  await mkdir('src/play/maia', { recursive: true });
  const runtime = JSON.parse(await readFile('node_modules/onnxruntime-web/package.json', 'utf8'));
  if (runtime.version !== '1.23.0') throw Error('ONNX Runtime Web 1.23.0 required');
  const files = ['model.onnx', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
  // Reuse the pinned model when present; browser downloads verify the generated manifest.
  const marker = 'public/maia/source.json';
  let prepared;
  try {
    prepared = JSON.parse(await readFile(marker, 'utf8'));
  } catch {
    /* First preparation. */
  }
  let bytes;
  try {
    bytes = await readFile('public/maia/model.onnx');
  } catch {
    /* Download below. */
  }
  if (
    prepared?.revision !== revision ||
    !bytes ||
    bytes.length !== 45683686 ||
    hash(bytes) !== prepared.sha256
  )
    await download('public/maia3/maia3_simplified.onnx', 'public/maia/model.onnx');
  bytes = await readFile('public/maia/model.onnx');
  if (bytes.length !== 45683686) throw Error('Unexpected Maia model size');
  await writeFile(marker, JSON.stringify({ revision, sha256: hash(bytes) }));
  const movesResponse = await fetch(source + 'src/lib/engine/data/all_moves_maia3_reversed.json');
  if (!movesResponse.ok) throw Error('Maia move vocabulary unavailable');
  const moveMap = await movesResponse.json();
  const moves = Array.from({ length: 4352 }, (_, index) => moveMap[index]);
  if (moves.some((move) => typeof move !== 'string')) throw Error('Invalid Maia move vocabulary');
  await writeFile('src/play/maia/moves.json', JSON.stringify(moves));
  for (const name of files.slice(1))
    await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `public/maia/${name}`);
  const assets = [];
  for (const name of files) {
    const content = await readFile(`public/maia/${name}`);
    assets.push({ url: `maia/${name}`, size: content.length, sha256: hash(content) });
  }
  const buildId = hash(Buffer.from(assets.map((asset) => asset.sha256).join(''))).slice(0, 16);
  const manifest = JSON.stringify({ buildId, revision, runtime: runtime.version, assets }, null, 2);
  await writeFile(`public/maia/manifest-${buildId}.json`, manifest);
  await writeFile('public/maia/manifest.json', manifest);
  await writeFile(
    'src/play/maia/build.ts',
    `// Generated from pinned Maia and ONNX runtime checksums.\nexport const MAIA_BUILD_ID = '${buildId}';\n`,
  );
  await download('LICENSE', 'public/licenses/maia-platform-GPL-3.0.txt');
  const license = await fetch(
    'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.23.0/LICENSE',
  );
  if (!license.ok) throw Error('ONNX Runtime license unavailable');
  await writeFile('public/licenses/onnxruntime-MIT.txt', await license.text());
  console.log(
    `Maia assets prepared: ${(assets.reduce((sum, asset) => sum + asset.size, 0) / 1048576).toFixed(1)} MiB`,
  );
}

if (process.argv[1]?.endsWith('prepare-maia.mjs')) await prepareMaia();
