import { describe, it, expect } from 'vitest';
import { validateCreatePostInput } from '../../src/modules/posts/posts.validation';

describe('validateCreatePostInput', () => {
    it('refuse un post sans contenu', () => {
        const errors = validateCreatePostInput({ visibility: 'public' });
        expect(errors).toContain('Le contenu du post est requis.');
    });

    it('refuse un contenu vide ou composé uniquement d\'espaces', () => {
        const errors = validateCreatePostInput({ content: '   ', visibility: 'public' });
        expect(errors).toContain('Le contenu du post est requis.');
    });

    it('refuse une visibilité manquante', () => {
        const errors = validateCreatePostInput({ content: 'Salut tout le monde' });
        expect(errors).toContain("La visibilité doit être 'public' ou 'friends'.");
    });

    it("refuse une visibilité qui n'est ni 'public' ni 'friends'", () => {
        const errors = validateCreatePostInput({ content: 'Salut', visibility: 'private' });
        expect(errors).toContain("La visibilité doit être 'public' ou 'friends'.");
    });

    it('refuse un mediaUrl qui ne serait pas une chaîne', () => {
        const errors = validateCreatePostInput({ content: 'Salut', visibility: 'public', mediaUrl: 123 });
        expect(errors).toContain('mediaUrl doit être une chaîne de caractères.');
    });

    it('accepte un post valide en visibilité public', () => {
        const errors = validateCreatePostInput({ content: 'Salut tout le monde', visibility: 'public' });
        expect(errors).toEqual([]);
    });

    it('accepte un post valide en visibilité friends avec mediaUrl', () => {
        const errors = validateCreatePostInput({
            content: 'Photo entre amis',
            visibility: 'friends',
            mediaUrl: '/uploads/photo.jpg',
        });
        expect(errors).toEqual([]);
    });
});
