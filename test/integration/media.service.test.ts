import { describe, it, expect } from 'vitest';
import { MediaService } from '../../src/modules/media/media.service';
import sharp from 'sharp';

describe('MediaService - processImage', () => {
    it("devrait traiter et redimensionner une image avec un filtre", async () => {
        // Génération d'une image tampon de test (carré rouge 50x50)
        const dummyBuffer = await sharp({
            create: {
                width: 50,
                height: 50,
                channels: 3,
                background: { r: 255, g: 0, b: 0 }
            }
        }).jpeg().toBuffer();

        const result = await MediaService.processImage(dummyBuffer, {
            width: 25,
            filter: 'grayscale'
        });

        expect(result).toBeDefined();
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.format).toBe('jpeg');
    });
});