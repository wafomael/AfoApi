import fs from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { HAIR_PROFILE_DIR, PHOTO_EXT } from '../config/upload.js';

export const getHairProfilePhotoPath = (userId, numero) =>
    join(HAIR_PROFILE_DIR, `capillaire_${userId}_${numero}.${PHOTO_EXT}`);

export const hairProfilePhotoExists = (userId, numero) =>
    fs.existsSync(getHairProfilePhotoPath(userId, numero));

const readExifDate = (exif) => {
    if (!exif || exif.length < 14) return null;
    const tiff = exif.subarray(0, 6).toString('ascii') === 'Exif\0\0' ? 6 : 0;
    const littleEndian = exif.subarray(tiff, tiff + 2).toString('ascii') === 'II';
    const read16 = (offset) => littleEndian ? exif.readUInt16LE(offset) : exif.readUInt16BE(offset);
    const read32 = (offset) => littleEndian ? exif.readUInt32LE(offset) : exif.readUInt32BE(offset);
    const readAscii = (entry, count) => {
        const start = count <= 4 ? entry + 8 : tiff + read32(entry + 8);
        if (start < 0 || start + count > exif.length) return null;
        return exif.subarray(start, start + count).toString('ascii').replace(/\0/g, '').trim();
    };
    const inspectIfd = (relativeOffset, wantedTags) => {
        const start = tiff + relativeOffset;
        if (start < 0 || start + 2 > exif.length) return {};
        const count = read16(start);
        const found = {};
        for (let index = 0; index < count; index++) {
            const entry = start + 2 + index * 12;
            if (entry + 12 > exif.length) break;
            const tag = read16(entry);
            const type = read16(entry + 2);
            const valueCount = read32(entry + 4);
            if (tag === 0x8769) found.exifOffset = read32(entry + 8);
            if (type === 2 && wantedTags.includes(tag)) found[tag] = readAscii(entry, valueCount);
        }
        return found;
    };
    try {
        const ifd0 = inspectIfd(read32(tiff + 4), [0x0132]);
        const exifIfd = ifd0.exifOffset ? inspectIfd(ifd0.exifOffset, [0x9003, 0x9004]) : {};
        const raw = exifIfd[0x9003] || exifIfd[0x9004] || ifd0[0x0132];
        if (!raw) return null;
        const match = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
        return Number.isNaN(date.getTime()) || date > new Date() ? null : date;
    } catch {
        return null;
    }
};

export const saveHairProfilePhotos = async (buffers, userId) => {
    const dates = [];
    for (let numero = 0; numero < buffers.length; numero++) {
        const buffer = buffers[numero];
        const metadata = await sharp(buffer).metadata();
        dates.push(readExifDate(metadata.exif) ?? new Date());
        await sharp(buffer)
            .resize(1440, 1440, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(getHairProfilePhotoPath(userId, numero));
    }
    for (let numero = buffers.length; numero < 10; numero++) {
        const path = getHairProfilePhotoPath(userId, numero);
        if (fs.existsSync(path)) fs.unlinkSync(path);
    }
    return dates;
};

export const buildHairProfilePhotoUrl = (req, path, date) => {
    const base = `${req.protocol}://${req.get('host')}`;
    return `${base}${path}?v=${new Date(date).getTime()}`;
};
