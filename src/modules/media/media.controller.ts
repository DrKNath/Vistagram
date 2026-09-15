import type { Request, Response } from 'express';
import { MediaService } from './media.service.js';
import path from 'path';
import fs from 'fs/promises';

// Sharp ne sait traiter que des images : pour la vidéo on se contente
// de vérifier le format et d'enregistrer le fichier tel quel.
const ALLOWED_VIDEO_EXTENSIONS: Record<string, string> = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
};

export async function uploadMedia(req: Request, res: Response) {
    try {
        if (!req.file) {
            return res.status(400).json({ status: 'ERROR', errors: ['Aucun fichier fourni.'] });
        }

        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });

        // --- Cas vidéo : pas de retouche possible, on enregistre le fichier brut ---
        if (req.file.mimetype.startsWith('video/')) {
            const extension = ALLOWED_VIDEO_EXTENSIONS[req.file.mimetype];

            if (!extension) {
                return res.status(400).json({
                    status: 'ERROR',
                    errors: ['Format vidéo non supporté (mp4, webm, mov ou mkv uniquement).'],
                });
            }

            const fileName = `media-${Date.now()}.${extension}`;
            await fs.writeFile(path.join(uploadDir, fileName), req.file.buffer);

            return res.status(201).json({
                success: true,
                mediaUrl: `uploads/${fileName}`,
                format: extension,
                mediaType: 'video',
            });
        }

        // --- Cas image : traitement via Sharp (redimensionnement, filtres, flou) ---
        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({
                status: 'ERROR',
                errors: ['Type de fichier non supporté (image ou vidéo uniquement).'],
            });
        }

        // Extraction des options depuis le form-data
        const options = {
            width: req.body.width ? parseInt(req.body.width) : undefined,
            height: req.body.height ? parseInt(req.body.height) : undefined,
            filter: req.body.filter,
            blur: req.body.blur ? parseFloat(req.body.blur) : undefined,
        };

        // Traitement de l'image
        const { buffer, format } = await MediaService.processImage(req.file.buffer, options);

        // Sauvegarde sur le disque
        const fileName = `media-${Date.now()}.${format}`;
        await fs.writeFile(path.join(uploadDir, fileName), buffer);

        return res.status(201).json({
            success: true,
            mediaUrl: `uploads/${fileName}`,
            format,
            mediaType: 'image',
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: 'ERROR', errors: ['Erreur lors du traitement du fichier.'] });
    }
}
