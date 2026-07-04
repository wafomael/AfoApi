import fs from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { MESSAGE_DIR, PHOTO_EXT } from '../config/upload.js';

/**
 * Médias des messages — même philosophie que les photos de profil :
 * on ne stocke PAS l'URL en base. Le fichier est nommé
 * {conversation_id}_{message_id}.webp et l'URL est reconstruite à la volée.
 */

/** Chemin absolu du fichier média d'un message. */
export const getMessageMediaPath = (conversationId, messageId) =>
    join(MESSAGE_DIR, `${conversationId}_${messageId}.${PHOTO_EXT}`);

/** Vérifie l'existence du fichier média d'un message. */
export const messageMediaExists = (conversationId, messageId) =>
    fs.existsSync(getMessageMediaPath(conversationId, messageId));

/**
 * Convertit + redimensionne le buffer en .webp et l'écrit sous
 * {conversation_id}_{message_id}.webp.
 * @param {Buffer} buffer
 * @param {number} conversationId
 * @param {number} messageId
 * @returns {Promise<void>}
 */
export const saveMessageMedia = async (buffer, conversationId, messageId) => {
    await sharp(buffer)
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(getMessageMediaPath(conversationId, messageId));
};

/** Supprime le fichier média d'un message s'il existe. */
export const deleteMessageMedia = (conversationId, messageId) => {
    const path = getMessageMediaPath(conversationId, messageId);
    if (fs.existsSync(path)) {
        fs.unlinkSync(path);
        return true;
    }
    return false;
};

/**
 * Construit l'URL publique absolue du média d'un message.
 * Retourne null si le message n'a pas de média.
 * @param {import('express').Request} req
 * @param {number} conversationId
 * @param {number} messageId
 * @param {boolean} hasMedia - valeur de message.media
 * @returns {string|null}
 */
export const buildMessageMediaUrl = (req, conversationId, messageId, hasMedia) => {
    if (!hasMedia) return null;
    const base = `${req.protocol}://${req.get('host')}`;
    let version = '';
    try {
        const mtime = fs.statSync(getMessageMediaPath(conversationId, messageId)).mtimeMs;
        version = `?v=${Math.floor(mtime)}`;
    } catch { /* fichier absent : pas de version */ }
    return `${base}/conversations/${conversationId}/messages/${messageId}/media${version}`;
};
