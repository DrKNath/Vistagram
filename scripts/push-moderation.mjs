import { spawnSync } from 'node:child_process';
const current = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });
if (current.status !== 0 || current.stdout.trim() !== 'moderation') {
    console.error('Envoi refusé : ouvre la branche moderation avant de pousser.');
    process.exitCode = 1;
} else {
    // Explicit destination. Never main, never force-push.
    const result = spawnSync('git', ['push', 'origin', 'HEAD:refs/heads/moderation'], { stdio: 'inherit' });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
}
