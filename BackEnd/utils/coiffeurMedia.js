import fs from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { PROFIL_DIR, PHOTO_EXT } from '../config/upload.js';

/**
 * Images du profil coiffeur — même philosophie que la photo de profil :
 * on ne stocke PAS l'URL en base. Les fichiers sont nommés depuis l'id et
 * l'URL est reconstruite à la volée.
 *   photo pro : {user_id}_pro.webp     (carré, comme l'avatar)
 *   bannière  : {user_id}_banner.webp  (ratio 3:1)
 */

/** Chemin absolu de la photo pro d'un coiffeur. */
export const getProPhotoPath = (userId) =>
    join(PROFIL_DIR, `${userId}_pro.${PHOTO_EXT}`);

/** Chemin absolu de la bannière d'un coiffeur. */
export const getBannerPath = (userId) =>
    join(PROFIL_DIR, `${userId}_banner.${PHOTO_EXT}`);

export const proPhotoExists = (userId) => fs.existsSync(getProPhotoPath(userId));
export const bannerExists   = (userId) => fs.existsSync(getBannerPath(userId));

/** Convertit + écrit la photo pro en .webp 512x512. */
export const saveProPhoto = async (buffer, userId) => {
    await sharp(buffer)
        .resize(512, 512, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(getProPhotoPath(userId));
};

/** Convertit + écrit la bannière en .webp 1500x500 (ratio 3:1). */
export const saveBanner = async (buffer, userId) => {
    await sharp(buffer)
        .resize(1500, 500, { fit: 'cover' })
        .webp({ quality: 80 })
        .toFile(getBannerPath(userId));
};

export const deleteProPhoto = (userId) => {
    const path = getProPhotoPath(userId);
    if (fs.existsSync(path)) { fs.unlinkSync(path); return true; }
    return false;
};

export const deleteBanner = (userId) => {
    const path = getBannerPath(userId);
    if (fs.existsSync(path)) { fs.unlinkSync(path); return true; }
    return false;
};

/** URL absolue de la photo pro (null si absente). */
export const buildProPhotoUrl = (req, userId, username) => {
    if (!username || !proPhotoExists(userId)) return null;
    const base = `${req.protocol}://${req.get('host')}`;
    const version = fs.statSync(getProPhotoPath(userId)).mtimeMs;
    return `${base}/coiffeurs/${encodeURIComponent(username)}/photo-pro?v=${Math.floor(version)}`;
};

/** URL absolue de la bannière (null si absente). */
export const buildBannerUrl = (req, userId, username) => {
    if (!username || !bannerExists(userId)) return null;
    const base = `${req.protocol}://${req.get('host')}`;
    const version = fs.statSync(getBannerPath(userId)).mtimeMs;
    return `${base}/coiffeurs/${encodeURIComponent(username)}/banner?v=${Math.floor(version)}`;
};
