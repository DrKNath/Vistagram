export type CreatePostInput = {
    content: string;
    mediaUrl?: string; // Optionnel, généré par le module media
    visibility: 'public' | 'friends'; // Visibilité du post
};

export type PostResponse = {
    id: number;
    content: string;
    mediaUrl: string | null;
    visibility: string;
    createdAt: Date;
    author: {
        // Données fusionnées avec le module users
        id: number;
        username: string;
        avatar: string | null;
    };
};
