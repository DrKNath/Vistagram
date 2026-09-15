// src/modules/media/media.service.ts
import sharp from 'sharp';
import type { MediaProcessingOptions } from './media.types.js';

export class MediaService {
    static async processImage(buffer: Buffer, options: MediaProcessingOptions) {
        let image = sharp(buffer);

        // 1. Redimensionnement
        if (options.width || options.height) {
            image = image.resize(
                options.width ? Number(options.width) : null,
                options.height ? Number(options.height) : null
            );
        }

        // 2. Application des filtres
        if (options.filter === 'grayscale') {
            image = image.grayscale();
        } else if (options.filter === 'sepia') {
            image = image.recomb([
                [0.393, 0.769, 0.189],
                [0.349, 0.686, 0.168],
                [0.272, 0.534, 0.131]
            ]);
        }

        if (options.blur) {
            image = image.blur(Number(options.blur));
        }

        // On exporte en JPEG (qualité 80)
        const processedBuffer = await image.jpeg({ quality: 80 }).toBuffer();

        return {
            buffer: processedBuffer,
            format: 'jpeg',
        };
    }
}