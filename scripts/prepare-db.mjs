import 'dotenv/config';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:')) throw new Error('Définis DATABASE_URL="file:./dev.db" dans .env.');
const path = resolve('prisma', url.slice(5).split('?')[0]);
mkdirSync(dirname(path), { recursive: true });
closeSync(openSync(path, 'a')); // Create only if missing; never truncate existing data.
