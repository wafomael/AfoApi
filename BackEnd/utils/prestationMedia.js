import fs from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { PRESTATION_DIR, PHOTO_EXT } from '../config/upload.js';

/**
 * Médias des prestations — pas d'URL stockée. Les fichiers sont nommés
 * presta_{prestation_id}_{index}.webp (index de 0 à media_count-1). On stocke
 * seulement media_count en base ; les URLs sont reconstruites à la volée.
 */

/** Chemin absolu du média d'index `i` d'une prestation. */
export const getPrestationMediaPath = (prestationId, index) =>
    join(PRESTATION_DIR, `presta_${prestationId}_${index}.${PHOTO_EXT}`);

export const prestationMediaExists = (prestationId, index) =>
    fs.existsSync(getPrestationMediaPath(prestationId, index));

/**
 * Écrit une liste de buffers (multer) en .webp pour une prestation.
 * @param {Buffer[]} buffers - dans l'ordre d'affichage
 * @param {number} prestationId
 * @returns {Promise<number>} nombre de médias écrits
 */
export const savePrestationMedias = async (buffers, prestationId) => {
    let i = 0;
    for (const buffer of buffers) {
        await sharp(buffer)
            .resize(1440, 1440, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(getPrestationMediaPath(prestationId, i));
        i++;
    }
    return i;
};

/** Supprime tous les fichiers médias d'une prestation. */
export const deletePrestationMedias = (prestationId, mediaCount) => {
    for (let i = 0; i < mediaCount; i++) {
        const path = getPrestationMediaPath(prestationId, i);
        if (fs.existsSync(path)) fs.unlinkSync(path);
    }
};

/**
 * Construit la liste des URLs absolues des médias d'une prestation.
 * @returns {string[]}
 */
export const buildPrestationMediaUrls = (req, prestationId, mediaCount) => {
    if (!mediaCount) return [];
    const base = `${req.protocol}://${req.get('host')}`;
    const urls = [];
    for (let i = 0; i < mediaCount; i++) {
        let version = '';
        try {
            const mtime = fs.statSync(getPrestationMediaPath(prestationId, i)).mtimeMs;
            version = `?v=${Math.floor(mtime)}`;
        } catch { /* fichier absent : pas de version */ }
        urls.push(`${base}/coiffeurs/prestations/${prestationId}/media/${i}${version}`);
    }
    return urls;
};
