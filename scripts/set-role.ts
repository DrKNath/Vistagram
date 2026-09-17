import 'dotenv/config';
import { prisma } from '../src/config/db.js';
const [email, role] = process.argv.slice(2);
if (!email || !['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(role ?? '')) {
    console.error('Usage : npm run user:role -- email@exemple.fr ADMIN');
    process.exitCode = 1;
} else {
    try {
        const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role, authVersion: { increment: 1 } }, select: { id: true, username: true, role: true } });
        console.log(user);
        console.log('Rôle attribué. Reconnecte ce compte dans le navigateur.');
    } catch { console.error('Compte introuvable ou base inaccessible. Crée ce compte depuis la page Inscription avant de relancer.'); process.exitCode = 1; }
    finally { await prisma.$disconnect(); }
}
