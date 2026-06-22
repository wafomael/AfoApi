import multer from 'multer';
import { MAX_UPLOAD_SIZE } from '../config/upload.js';

/**
 * Formats d'image acceptés en entrée (avant conversion webp par sharp).
 */
const MIME_AUTORISES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Multer en mémoire : le fichier arrive dans req.file.buffer.
 * sharp prend ensuite le relais pour convertir + redimensionner en .webp.
 * On ne sauvegarde JAMAIS le fichier brut sur le disque.
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (MIME_AUTORISES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('FORMAT_INVALIDE'), false);
    }
};

/**
 * Middleware d'upload d'une photo de profil.
 * Champ attendu dans le form-data : "photo".
 */
export const uploadPhoto = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_UPLOAD_SIZE }
}).single('photo');
