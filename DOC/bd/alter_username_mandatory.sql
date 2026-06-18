-- ============================================================
-- MIGRATION : Rendre nom_utilisateur OBLIGATOIRE
-- + Génération automatique pour les existants
-- ============================================================

-- Étape 1 : Mettre à jour les utilisateurs existants sans nom_utilisateur
-- On génère prenom_nom, et si conflit on ajoute l'ID
UPDATE s_afro_dev.utilisateur 
SET nom_utilisateur = LOWER(
    REGEXP_REPLACE(
        REGEXP_REPLACE(
            CONCAT(prenom, '_', nom, '_', id),
            '[^a-zA-Z0-9_]', '', 'g'
        ),
        '_+', '_', 'g'
    )
)
WHERE nom_utilisateur IS NULL OR nom_utilisateur = '';

-- Étape 2 : Vérifier qu'il n'y a plus de NULL
-- SELECT COUNT(*) FROM s_afro_dev.utilisateur WHERE nom_utilisateur IS NULL;

-- Étape 3 : Modifier la colonne pour la rendre NOT NULL
ALTER TABLE s_afro_dev.utilisateur 
ALTER COLUMN nom_utilisateur SET NOT NULL;

-- Étape 4 : S'assurer que la contrainte UNIQUE existe (normalement déjà présente)
-- Si la contrainte n'existe pas, la créer:
-- ALTER TABLE s_afro_dev.utilisateur 
-- ADD CONSTRAINT unique_nom_utilisateur UNIQUE (nom_utilisateur);

-- Note : La colonne a déjà UNIQUE dans le schéma original (ligne 43)
-- donc cette étape est optionnelle si vous partez du schéma initial

-- ============================================================
-- FONCTION SQL AUXILIAIRE (Optionnel)
-- Pour générer un username unique côté DB si besoin
-- ============================================================

CREATE OR REPLACE FUNCTION s_afro_dev.generate_unique_username(
    p_prenom VARCHAR(100),
    p_nom VARCHAR(100)
)
RETURNS VARCHAR(50) AS $$
DECLARE
    base_username VARCHAR(50);
    new_username VARCHAR(50);
    counter INTEGER := 1;
    exists_check BOOLEAN;
BEGIN
    -- Créer la base : prenom_nom en minuscule, sans caractères spéciaux
    base_username := LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                CONCAT(p_prenom, '_', p_nom),
                '[^a-zA-Z0-9_]', '', 'g'
            ),
            '_+', '_', 'g'
        )
    );
    
    -- Limiter à 45 chars pour laisser de la place au _123
    base_username := LEFT(base_username, 45);
    
    -- Vérifier si la base existe
    SELECT EXISTS(
        SELECT 1 FROM s_afro_dev.utilisateur 
        WHERE nom_utilisateur = base_username
    ) INTO exists_check;
    
    -- Si libre, on prend la base
    IF NOT exists_check THEN
        RETURN base_username;
    END IF;
    
    -- Sinon, chercher le prochain numéro disponible efficacement
    -- Méthode : trouver le max numéro suffixe existant
    SELECT COALESCE(
        MAX(
            CAST(NULLIF(REGEXP_REPLACE(nom_utilisateur, '^' || base_username || '_', ''), '') AS INTEGER)
        ),
        0
    ) INTO counter
    FROM s_afro_dev.utilisateur
    WHERE nom_utilisateur ~ ('^' || base_username || '_[0-9]+$');
    
    -- Retourner base_username + _ + (max + 1)
    new_username := base_username || '_' || (counter + 1)::TEXT;
    
    -- Vérifier que ça ne dépasse pas 50 caractères
    IF LENGTH(new_username) > 50 THEN
        -- Si trop long, tronquer la base
        base_username := LEFT(base_username, 50 - LENGTH('_' || (counter + 1)::TEXT));
        new_username := base_username || '_' || (counter + 1)::TEXT;
    END IF;
    
    RETURN new_username;
END;
$$ LANGUAGE plpgsql;

-- Exemple d'utilisation de la fonction :
-- SELECT s_afro_dev.generate_unique_username('Jean', 'Dupont');
-- SELECT s_afro_dev.generate_unique_username('Max', 'Payne');  -- max_payne ou max_payne_1
