export type MediaResponse = {
    success: boolean;
    mediaUrl: string; // L'URL finale du fichier (ex: "/uploads/media-123.jpg" ou "/uploads/media-123.mp4")
    format: string;   // ex: "jpeg" (image retouchée) ou l'extension d'origine pour une vidéo
    mediaType: 'image' | 'video';
};

export type MediaProcessingOptions = {
    width?: number;
    height?: number;
    filter?: 'grayscale' | 'sepia' | string;
    blur?: number;
};