import { defineConfig } from 'vitest/config';

// Tests perform database writes. Require the isolated runner, including in CI.
if (!process.env.DATABASE_URL?.includes('vistagram-tests-')) {
    throw new Error('Lance les tests avec npm test (base SQLite temporaire isolée).');
}
export default defineConfig({
    test: { globals: true, environment: 'node', fileParallelism: false },
});
