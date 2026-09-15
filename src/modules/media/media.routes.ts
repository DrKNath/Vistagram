import { Router } from 'express';
import multer from 'multer';
import { uploadMedia } from './media.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

// Stockage temporaire en mémoire : traitement direct via Sharp pour les images,
// enregistrement direct pour les vidéos (non transformées par Sharp).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo (marge pour de courtes vidéos)
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Type de fichier non supporté (image ou vidéo uniquement).'));
        }
    },
});

export const mediaRouter = Router();

// On attend un champ "file" dans le form-data.
// Le multer est enveloppé manuellement pour renvoyer une erreur JSON cohérente
// avec le reste de l'API plutôt que la page d'erreur HTML par défaut d'Express.
mediaRouter.post('/uploads', requireAuth, (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
        if (err) {
            const message = err instanceof Error ? err.message : 'Fichier invalide.';
            return res.status(400).json({ status: 'ERROR', errors: [message] });
        }
        next();
    });
}, uploadMedia);
