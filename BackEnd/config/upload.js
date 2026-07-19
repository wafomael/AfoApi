import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Dossier racine des uploads (hors du code source).
 * BackEnd/uploads/profils/  → contient {id}.webp
 */
export const UPLOAD_ROOT = join(__dirname, '..', 'uploads');
/** Photos de profil {id}.webp + photo pro {id}_pro.webp + bannière {id}_banner.webp */
export const PROFIL_DIR  = join(UPLOAD_ROOT, 'profils');
/** Médias des publications : pub_{publication_id}_{index}.webp */
export const PUBLICATION_DIR = join(UPLOAD_ROOT, 'publications');
/** Médias des prestations : presta_{prestation_id}_{index}.webp */
export const PRESTATION_DIR  = join(UPLOAD_ROOT, 'prestations');

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
    fs.mkdirSync(PUBLICATION_DIR, { recursive: true });
    fs.mkdirSync(PRESTATION_DIR, { recursive: true });
};
