/* Bundles each test/*.test.ts with esbuild and runs it under Node 22 (node:sqlite is used as the DB in tests).
   Usage: node scripts/run-tests.cjs [filter]   (npm test) */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
let esbuild;
try { esbuild = require('esbuild'); } catch (e) { esbuild = require(require.resolve('esbuild', { paths: [process.cwd(), '/opt/npm-tools/node_modules'] })); }
const dir = path.join(__dirname, '..', 'test'), out = path.join(__dirname, '..', '.testbuild');
fs.mkdirSync(out, { recursive: true });
const filter = process.argv[2] || '';
let failed = 0, ran = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.test.ts') && x.includes(filter)).sort()) {
  const outfile = path.join(out, f.replace('.ts', '.cjs'));
  esbuild.buildSync({ entryPoints: [path.join(dir, f)], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'error', external: ['node:sqlite'] });
  console.log('\n=== ' + f);
  const r = spawnSync(process.execPath, ['--no-warnings', outfile], { stdio: 'inherit' });
  ran++; if (r.status !== 0) failed++;
}
console.log('\n' + (ran - failed) + '/' + ran + ' test files passed');
process.exit(failed ? 1 : 0);
