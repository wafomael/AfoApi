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

/**
 * Middleware d'upload d'un média de message.
 * Champ attendu dans le form-data : "media".
 */
export const uploadMessageMedia = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_UPLOAD_SIZE }
}).single('media');

/**
 * Middleware d'upload d'une image unique (photo pro / bannière coiffeur).
 * Champ attendu dans le form-data : "image".
 */
export const uploadSingleImage = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_UPLOAD_SIZE }
}).single('image');

/**
 * Nombre max de médias par publication / prestation.
 */
export const MAX_MEDIAS = 10;

/**
 * Middleware d'upload de plusieurs médias (publication / prestation).
 * Champ attendu dans le form-data : "medias" (répété).
 */
export const uploadMedias = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_UPLOAD_SIZE }
}).array('medias', MAX_MEDIAS);
