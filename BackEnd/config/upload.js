import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dossier racine des uploads (hors du code source).
 * BackEnd/uploads/profils/  → contient {id}.webp
 */
export const UPLOAD_ROOT = join(__dirname, '..', 'uploads');
export const PROFIL_DIR  = join(UPLOAD_ROOT, 'profils');

/** Extension/format unique de stockage. */
export const PHOTO_EXT = 'webp';

/** Taille max de l'upload (octets). */
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 Mo

/**
 * Crée les dossiers d'upload s'ils n'existent pas.
 * À appeler une fois au démarrage du serveur.
 */
export const ensureUploadDirs = () => {
    fs.mkdirSync(PROFIL_DIR, { recursive: true });
};
