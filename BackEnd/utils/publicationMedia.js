import fs from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { PUBLICATION_DIR, PHOTO_EXT } from '../config/upload.js';

/**
 * Médias des publications — pas d'URL stockée. Les fichiers sont nommés
 * pub_{publication_id}_{index}.webp (index de 0 à media_count-1). On stocke
 * seulement media_count en base ; les URLs sont reconstruites à la volée.
 */

/** Chemin absolu du média d'index `i` d'une publication. */
export const getPublicationMediaPath = (publicationId, index) =>
    join(PUBLICATION_DIR, `pub_${publicationId}_${index}.${PHOTO_EXT}`);

export const publicationMediaExists = (publicationId, index) =>
    fs.existsSync(getPublicationMediaPath(publicationId, index));

/**
 * Écrit une liste de buffers (multer) en .webp pour une publication.
 * @param {Buffer[]} buffers - dans l'ordre d'affichage
 * @param {number} publicationId
 * @returns {Promise<number>} nombre de médias écrits
 */
export const savePublicationMedias = async (buffers, publicationId) => {
    let i = 0;
    for (const buffer of buffers) {
        await sharp(buffer)
            .resize(1440, 1440, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(getPublicationMediaPath(publicationId, i));
        i++;
    }
    return i;
};

/** Supprime tous les fichiers médias d'une publication. */
export const deletePublicationMedias = (publicationId, mediaCount) => {
    for (let i = 0; i < mediaCount; i++) {
        const path = getPublicationMediaPath(publicationId, i);
        if (fs.existsSync(path)) fs.unlinkSync(path);
    }
};

/**
 * Construit la liste des URLs absolues des médias d'une publication.
 * @returns {string[]}
 */
export const buildPublicationMediaUrls = (req, publicationId, mediaCount) => {
    if (!mediaCount) return [];
    const base = `${req.protocol}://${req.get('host')}`;
    const urls = [];
    for (let i = 0; i < mediaCount; i++) {
        let version = '';
        try {
            const mtime = fs.statSync(getPublicationMediaPath(publicationId, i)).mtimeMs;
            version = `?v=${Math.floor(mtime)}`;
        } catch { /* fichier absent : pas de version */ }
        urls.push(`${base}/publications/${publicationId}/media/${i}${version}`);
    }
    return urls;
};
