import { query } from '../dbConnect.js';

const TABLE_NAME = 's_afro_dev.utilisateur';

/**
 * ============================================
 * FONCTIONS DE LECTURE (READ)
 * ============================================
 */

/**
 * Récupérer un utilisateur par son ID
 * @param {number} id
 * @param {string[]} fields - Champs à récupérer (défaut: tout sauf mot_de_passe)
 * @returns {Promise<object|null>}
 */

export const getUserById = async (id, fields = null) => {
    const selectFields = fields ? fields.join(', ') : 
        'id, nom_utilisateur, email, prenom, nom, date_naissance, sexe, ville, latitude, longitude, telephone, role, is_pro, statut, is_online, created_at, updated_at';
    
    const sql = `SELECT ${selectFields} FROM ${TABLE_NAME} WHERE id = $1 AND statut = 'actif'`;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
};

/**
 * Récupérer un utilisateur par son email (pour login)
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export const getUserByEmail = async (email) => {
    const sql = `SELECT * FROM ${TABLE_NAME} WHERE email = $1 AND statut = 'actif'`;
    const result = await query(sql, [email]);
    return result.rows[0] || null;
};

/**
 * Récupérer un utilisateur par son nom_utilisateur
 * @param {string} nomUtilisateur
 * @returns {Promise<object|null>}
 */
export const getUserByUsername = async (nomUtilisateur) => {
    const sql = `SELECT id, nom_utilisateur, email, prenom, nom, role, statut FROM ${TABLE_NAME} 
                 WHERE nom_utilisateur = $1 AND statut = 'actif'`;
    const result = await query(sql, [nomUtilisateur]);
    return result.rows[0] || null;
};

/**
 * Lister tous les utilisateurs (Admin uniquement)
 * @param {object} filters - Filtres optionnels { role, statut, search }
 * @param {object} pagination - { limit, offset }
 * @returns {Promise<{users: array, total: number}>}
 */
export const listAllUsers = async (filters = {}, pagination = { limit: 20, offset: 0 }) => {
    const conditions = ["statut = 'actif'"];
    const params = [];
    let paramIndex = 1;

    if (filters.role) {
        conditions.push(`role = $${paramIndex++}`);
        params.push(filters.role);
    }

    if (filters.statut) {
        conditions.push(`statut = $${paramIndex++}`);
        params.push(filters.statut);
    }

    if (filters.search) {
        conditions.push(`(prenom ILIKE $${paramIndex} OR nom ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    
    // Requête count
    const countSql = `SELECT COUNT(*) FROM ${TABLE_NAME} WHERE ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    // Requête données
    const selectFields = 'id, nom_utilisateur, email, prenom, nom, date_naissance, sexe, ville, latitude, longitude, telephone, role, is_pro, statut, is_online, created_at';
    const sql = `SELECT ${selectFields} FROM ${TABLE_NAME} 
                 WHERE ${whereClause} 
                 ORDER BY created_at DESC 
                 LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    
    params.push(pagination.limit, pagination.offset);
    
    const result = await query(sql, params);
    
    return { users: result.rows, total };
};

/**
 * Lister uniquement les coiffeurs (pour les clients)
 * @param {object} pagination - { limit, offset }
 * @returns {Promise<{coiffeurs: array, total: number}>}
 */
export const listCoiffeurs = async (pagination = { limit: 20, offset: 0 }) => {
    const selectFields = 'id, nom_utilisateur, prenom, nom, ville, latitude, longitude, telephone, is_pro, is_online, created_at';
    
    const countSql = `SELECT COUNT(*) FROM ${TABLE_NAME} WHERE role = 'coiffeur' AND statut = 'actif'`;
    const countResult = await query(countSql);
    const total = parseInt(countResult.rows[0].count);

    const sql = `SELECT ${selectFields} FROM ${TABLE_NAME} 
                 WHERE role = 'coiffeur' AND statut = 'actif' 
                 ORDER BY is_pro DESC, created_at DESC 
                 LIMIT $1 OFFSET $2`;
    
    const result = await query(sql, [pagination.limit, pagination.offset]);
    
    return { coiffeurs: result.rows, total };
};

/**
 * Rechercher les coiffeurs par proximité géographique
 * @param {number} userLat - Latitude de l'utilisateur
 * @param {number} userLng - Longitude de l'utilisateur
 * @param {number} radiusKm - Rayon de recherche en km (défaut: 10)
 * @param {object} pagination - { limit, offset }
 * @returns {Promise<{coiffeurs: array, total: number}>}
 */
export const findCoiffeursNearby = async (userLat, userLng, radiusKm = 10, pagination = { limit: 20, offset: 0 }) => {
    // Formule de Haversine pour calculer la distance
    const selectFields = `
        id, nom_utilisateur, prenom, nom, ville, latitude, longitude, telephone, is_pro, is_online, created_at,
        (
            6371 * acos(
                cos(radians($1)) * cos(radians(latitude)) * 
                cos(radians(longitude) - radians($2)) + 
                sin(radians($1)) * sin(radians(latitude))
            )
        ) AS distance_km
    `;
    
    const countSql = `
        SELECT COUNT(*) FROM ${TABLE_NAME} 
        WHERE role = 'coiffeur' 
        AND statut = 'actif'
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND (
            6371 * acos(
                cos(radians($1)) * cos(radians(latitude)) * 
                cos(radians(longitude) - radians($2)) + 
                sin(radians($1)) * sin(radians(latitude))
            )
        ) <= $3
    `;
    
    const countResult = await query(countSql, [userLat, userLng, radiusKm]);
    const total = parseInt(countResult.rows[0].count);

    const sql = `
        SELECT ${selectFields} 
        FROM ${TABLE_NAME} 
        WHERE role = 'coiffeur' 
        AND statut = 'actif'
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND (
            6371 * acos(
                cos(radians($1)) * cos(radians(latitude)) * 
                cos(radians(longitude) - radians($2)) + 
                sin(radians($1)) * sin(radians(latitude))
            )
        ) <= $3
        ORDER BY distance_km ASC, is_pro DESC
        LIMIT $4 OFFSET $5
    `;
    
    const result = await query(sql, [userLat, userLng, radiusKm, pagination.limit, pagination.offset]);
    
    return { coiffeurs: result.rows, total, radiusKm };
};

/**
 * ============================================
 * FONCTIONS UTILITAIRES
 * ============================================
 */

/**
 * Générer un nom d'utilisateur unique
 * Format : prenom_nom, si existe prenom_nom_1, prenom_nom_2, etc.
 * Méthode économique : trouve le max suffixe existant et incrémente
 * @param {string} prenom
 * @param {string} nom
 * @returns {Promise<string>} Username unique
 */
export const generateUniqueUsername = async (prenom, nom) => {
    // Créer la base : prenom_nom (minuscule, sans caractères spéciaux)
    const clean = (str) => str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Enlever accents
        .replace(/[^a-z0-9]/g, '_')        // Remplacer spéciaux par _
        .replace(/_+/g, '_')                // Éviter doubles _
        .replace(/^_|_$/g, '');             // Enlever _ au début/fin
    
    const baseUsername = clean(prenom) + '_' + clean(nom);
    
    // Limiter à 45 chars pour laisser place au suffixe _123
    const truncatedBase = baseUsername.substring(0, 45);
    
    // Vérifier si la base existe
    const baseExists = await usernameExists(truncatedBase);
    if (!baseExists) {
        return truncatedBase;
    }
    
    // Chercher le max suffixe existant de façon économique
    // Pattern : truncatedBase suivi de _ et de chiffres
    const pattern = truncatedBase + '_%';
    
    const sql = `
        SELECT nom_utilisateur 
        FROM ${TABLE_NAME} 
        WHERE nom_utilisateur LIKE $1 
        AND nom_utilisateur ~ ('^' || $2 || '_[0-9]+$')
        ORDER BY 
            CAST(SUBSTRING(nom_utilisateur FROM LENGTH($2) + 2) AS INTEGER) DESC
        LIMIT 1
    `;
    
    const result = await query(sql, [pattern, truncatedBase]);
    
    let nextNumber = 1;
    if (result.rows.length > 0) {
        const lastUsername = result.rows[0].nom_utilisateur;
        // Extraire le numéro après le dernier _
        const match = lastUsername.match(/_([0-9]+)$/);
        if (match) {
            nextNumber = parseInt(match[1]) + 1;
        }
    }
    
    // Construire le nouveau username
    let newUsername = truncatedBase + '_' + nextNumber;
    
    // Vérifier qu'on ne dépasse pas 50 caractères
    if (newUsername.length > 50) {
        const maxBaseLength = 50 - ('_' + nextNumber).length;
        newUsername = truncatedBase.substring(0, maxBaseLength) + '_' + nextNumber;
    }
    
    // Double vérification d'unicité (au cas où)
    const finalExists = await usernameExists(newUsername);
    if (finalExists) {
        // Si toujours conflit (race condition), ajouter timestamp
        const timestamp = Date.now().toString().slice(-4);
        newUsername = truncatedBase.substring(0, 50 - timestamp.length - 1) + '_' + timestamp;
    }
    
    return newUsername;
};

/**
 * ============================================
 * FONCTIONS DE CRÉATION (CREATE)
 * ============================================
 */

/**
 * Créer un nouvel utilisateur
 * Si nom_utilisateur non fourni, génère automatiquement prenom_nom
 * @param {object} userData
 * @returns {Promise<object>}
 */
export const createUser = async (userData) => {
    let {
        nom_utilisateur,
        email,
        mot_de_passe,
        prenom,
        nom,
        date_naissance = null,
        sexe = null,
        ville = null,
        telephone = null,
        latitude = null,
        longitude = null,
        role = 'client',
        is_pro = false
    } = userData;

    // Générer nom_utilisateur automatiquement si non fourni
    if (!nom_utilisateur) {
        nom_utilisateur = await generateUniqueUsername(prenom, nom);
    }

    const sql = `
        INSERT INTO ${TABLE_NAME} 
        (nom_utilisateur, email, mot_de_passe, prenom, nom, date_naissance, sexe, ville, latitude, longitude, telephone, role, is_pro)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, nom_utilisateur, email, prenom, nom, role, created_at
    `;
    
    const values = [
        nom_utilisateur, email, mot_de_passe, prenom, nom,
        date_naissance, sexe, ville, latitude, longitude, telephone, role, is_pro
    ];
    
    const result = await query(sql, values);
    return result.rows[0];
};

/**
 * ============================================
 * FONCTIONS DE MISE À JOUR (UPDATE)
 * ============================================
 */

/**
 * Mettre à jour un utilisateur
 * @param {number} id
 * @param {object} updates - Champs à mettre à jour
 * @returns {Promise<object|null>}
 */
export const updateUser = async (id, updates) => {
    const allowedFields = [
        'nom_utilisateur', 'email', 'mot_de_passe', 'prenom', 'nom',
        'date_naissance', 'sexe', 'ville', 'latitude', 'longitude', 'telephone', 'role', 'is_pro', 'statut'
    ];
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
            setClauses.push(`${key} = $${paramIndex++}`);
            values.push(value);
        }
    }
    
    if (setClauses.length === 0) {
        return null;
    }
    
    values.push(id);
    
    const sql = `
        UPDATE ${TABLE_NAME} 
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex} AND statut = 'actif'
        RETURNING id, nom_utilisateur, email, prenom, nom, role, updated_at
    `;
    
    const result = await query(sql, values);
    return result.rows[0] || null;
};

/**
 * Mettre à jour le statut online/offline
 * @param {number} id
 * @param {boolean} isOnline
 * @returns {Promise<void>}
 */
export const updateOnlineStatus = async (id, isOnline) => {
    const sql = `UPDATE ${TABLE_NAME} SET is_online = $1, last_activity = NOW() WHERE id = $2`;
    await query(sql, [isOnline, id]);
};

/**
 * ============================================
 * FONCTIONS DE SUPPRESSION (DELETE SOFT)
 * ============================================
 */

/**
 * Désabonner un utilisateur (soft delete)
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export const softDeleteUser = async (id) => {
    const sql = `UPDATE ${TABLE_NAME} SET statut = 'desabonne', updated_at = NOW() WHERE id = $1`;
    const result = await query(sql, [id]);
    return result.rowCount > 0;
};

/**
 * ============================================
 * FONCTIONS DE VÉRIFICATION
 * ============================================
 */

/**
 * Vérifier si un email existe déjà
 * @param {string} email
 * @param {number} excludeId - ID à exclure (pour update)
 * @returns {Promise<boolean>}
 */
export const emailExists = async (email, excludeId = null) => {
    let sql = `SELECT 1 FROM ${TABLE_NAME} WHERE email = $1`;
    const params = [email];
    
    if (excludeId) {
        sql += ` AND id != $2`;
        params.push(excludeId);
    }
    
    const result = await query(sql, params);
    return result.rows.length > 0;
};

/**
 * Vérifier si un nom d'utilisateur existe déjà
 * @param {string} nomUtilisateur
 * @param {number} excludeId
 * @returns {Promise<boolean>}
 */
export const usernameExists = async (nomUtilisateur, excludeId = null) => {
    let sql = `SELECT 1 FROM ${TABLE_NAME} WHERE nom_utilisateur = $1`;
    const params = [nomUtilisateur];
    
    if (excludeId) {
        sql += ` AND id != $2`;
        params.push(excludeId);
    }
    
    const result = await query(sql, params);
    return result.rows.length > 0;
};

/**
 * Récupérer le mot de passe hashé (pour login)
 * @param {string} email
 * @returns {Promise<{id: number, mot_de_passe: string, role: string}|null>}
 */
export const getUserCredentials = async (email) => {
    const sql = `SELECT id, mot_de_passe, role FROM ${TABLE_NAME} WHERE email = $1 AND statut = 'actif'`;
    const result = await query(sql, [email]);
    return result.rows[0] || null;
};
