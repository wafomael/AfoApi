import fs from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { PROFIL_DIR, PHOTO_EXT } from '../config/upload.js';

/** Chemin absolu du fichier photo d'un user (nommé par id, stable). */
export const getPhotoPath = (userId) => join(PROFIL_DIR, `${userId}.${PHOTO_EXT}`);

/** Alias interne. */
const photoPath = getPhotoPath;

/**
 * Convertit + redimensionne le buffer image en .webp 512x512 et l'écrit
 * sur disque sous le nom {id}.webp. Écrase l'ancienne photo s'il y en a une.
 * @param {Buffer} buffer - Buffer de l'image uploadée (multer memory)
 * @param {number} userId
 * @returns {Promise<void>}
 */
export const savePhoto = async (buffer, userId) => {
    await sharp(buffer)
        .resize(512, 512, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(photoPath(userId));
};

/**
 * Supprime la photo d'un user si elle existe.
 * @param {number} userId
 * @returns {boolean} true si un fichier a été supprimé
 */
export const deletePhoto = (userId) => {
    const path = photoPath(userId);
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
        return true;
    }
    return false;
};

/** Vérifie si un user a une photo de profil. */
export const photoExists = (userId) => fs.existsSync(photoPath(userId));

/**
 * Construit l'URL publique absolue de la photo d'un user.
 * L'URL passe par le username (jamais l'id) : GET /users/:username/photo
 * Retourne null si l'utilisateur n'a pas de photo.
 * L'URL est dérivée de la requête → fonctionne sur n'importe quel host/IP/port.
 * @param {import('express').Request} req
 * @param {number} userId   - id interne (pour localiser le fichier)
 * @param {string} username - nom d'utilisateur (exposé dans l'URL)
 * @returns {string|null}
 */
export const buildPhotoUrl = (req, userId, username) => {
    if (!username || !photoExists(userId)) return null;
    const base = `${req.protocol}://${req.get('host')}`;
    // ?v=mtime → casse le cache du client quand la photo change
    const version = fs.statSync(photoPath(userId)).mtimeMs;
    return `${base}/users/${encodeURIComponent(username)}/photo?v=${Math.floor(version)}`;
};
