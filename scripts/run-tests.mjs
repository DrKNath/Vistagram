import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
// Every run gets an isolated SQLite database. Never touch prisma/dev.db.
const directory = mkdtempSync(join(tmpdir(), 'vistagram-tests-'));
writeFileSync(join(directory, 'tests.db'), '');
const env = { ...process.env, DATABASE_URL: `file:${join(directory, 'tests.db').replaceAll('\\', '/')}`, NODE_ENV: 'test', JWT_SECRET: 'isolated-test-secret' };
function run(file, args) {
    const result = spawnSync(process.execPath, [resolve(file), ...args], { env, stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status ?? 1;
}
try {
    const setup = run('node_modules/prisma/build/index.js', ['db', 'push', '--skip-generate']);
    process.exitCode = setup || run('node_modules/vitest/vitest.mjs', ['run', ...process.argv.slice(2)]);
} finally { rmSync(directory, { recursive: true, force: true }); }
