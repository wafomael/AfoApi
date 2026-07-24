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
        'id, nom_utilisateur, email, prenom, nom, date_naissance, sexe, ville, latitude, longitude, telephone, role, is_pro, statut, created_at, updated_at';
    
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
    const sql = `SELECT id, nom_utilisateur, email, prenom, nom, role, is_pro, statut,
                        ville, latitude, longitude, telephone, date_naissance
                 FROM ${TABLE_NAME} 
                 WHERE nom_utilisateur = $1 AND statut = 'actif'`;
    const result = await query(sql, [nomUtilisateur]);
    return result.rows[0] || null;
};

/**
 * Lister les utilisateurs avec des filtres utiles.
 * Une seule fonction générique : on filtre selon le besoin (clients,
 * coiffeurs, par ville, recherche texte...).
 *
 * @param {object} filters - { role, statut, is_pro, ville, search }
 * @param {object} pagination - { limit, offset }
 * @returns {Promise<{users: array, total: number}>}
 */
export const listUsers = async (filters = {}, pagination = { limit: 20, offset: 0 }) => {
    const conditions = [];
    const params = [];
    let i = 1;

    // Statut : 'actif' par défaut, mais surchargeable
    conditions.push(`statut = $${i++}`);
    params.push(filters.statut || 'actif');

    if (filters.role) {
        conditions.push(`role = $${i++}`);
        params.push(filters.role);
    }

    if (filters.is_pro !== undefined) {
        conditions.push(`is_pro = $${i++}`);
        params.push(filters.is_pro);
    }

    if (filters.ville) {
        conditions.push(`ville ILIKE $${i++}`);
        params.push(filters.ville);
    }

    if (filters.search) {
        conditions.push(`(prenom ILIKE $${i} OR nom ILIKE $${i} OR nom_utilisateur ILIKE $${i} OR email ILIKE $${i})`);
        params.push(`%${filters.search}%`);
        i++;
    }

    if (filters.categorie_id || filters.sous_type_id || filters.tag_ids?.length > 0) {
        const prestationConditions = ['p.coiffeur_id = utilisateur.id', 'p.actif = TRUE'];
        if (filters.categorie_id) {
            prestationConditions.push(`p.categorie_id = $${i++}`);
            params.push(filters.categorie_id);
        }
        if (filters.sous_type_id) {
            prestationConditions.push(`p.sous_type_id = $${i++}`);
            params.push(filters.sous_type_id);
        }
        if (filters.tag_ids?.length > 0) {
            prestationConditions.push(`p.id IN (
                SELECT pt.prestation_id FROM s_afro_dev.prestation_tag pt
                WHERE pt.tag_id = ANY($${i++}::int[])
                GROUP BY pt.prestation_id HAVING COUNT(DISTINCT pt.tag_id) = $${i++}
            )`);
            params.push(filters.tag_ids, filters.tag_ids.length);
        }
        conditions.push(`EXISTS (SELECT 1 FROM s_afro_dev.prestation p WHERE ${prestationConditions.join(' AND ')})`);
    }

    const whereClause = conditions.join(' AND ');

    // Requête count
    const countSql = `SELECT COUNT(*) FROM ${TABLE_NAME} utilisateur WHERE ${whereClause}`;
    const countResult = await query(countSql, params);
    const total = parseInt(countResult.rows[0].count);

    // Requête données
    const selectFields = 'id, nom_utilisateur, email, prenom, nom, date_naissance, sexe, ville, latitude, longitude, telephone, role, is_pro, statut, created_at';
    const sql = `SELECT ${selectFields} FROM ${TABLE_NAME} utilisateur
                 WHERE ${whereClause} 
                 ORDER BY is_pro DESC, created_at DESC 
                 LIMIT $${i++} OFFSET $${i++}`;

    params.push(pagination.limit, pagination.offset);

    const result = await query(sql, params);

    return { users: result.rows, total };
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
