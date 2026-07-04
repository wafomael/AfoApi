-- ==============================
-- PROFIL ÉTENDU — profil_utilisateur
-- ==============================
-- Relation 1-1 avec utilisateur (créée automatiquement à l'inscription via
-- trigger, comme visibilite_utilisateur). On NE duplique PAS le username :
-- il vit déjà dans utilisateur.nom_utilisateur.
--
-- IDs en INTEGER (cohérent avec utilisateur.id SERIAL).
-- ==============================

-- ------------------------------
-- Fonction générique : touch updated_at (réutilisable par plusieurs tables)
-- ------------------------------
CREATE OR REPLACE FUNCTION s_afro_dev.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------
-- TABLE PROFIL_UTILISATEUR
-- ------------------------------
CREATE TABLE s_afro_dev.profil_utilisateur (
    user_id           INTEGER     NOT NULL PRIMARY KEY
                                  REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    bio               VARCHAR(200),
    lien_externe      VARCHAR(255),
    type_cheveux      TEXT[]      NOT NULL DEFAULT '{}',
    coiffure_preferee TEXT[]      NOT NULL DEFAULT '{}',
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profil_utilisateur_updated_at
    BEFORE UPDATE ON s_afro_dev.profil_utilisateur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();

-- ------------------------------
-- TRIGGER : créer la ligne profil_utilisateur à chaque nouvelle inscription
-- ------------------------------
CREATE OR REPLACE FUNCTION s_afro_dev.create_profil_utilisateur()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO s_afro_dev.profil_utilisateur (user_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_profil_utilisateur
    AFTER INSERT ON s_afro_dev.utilisateur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.create_profil_utilisateur();

-- ------------------------------
-- BACKFILL : créer le profil pour les utilisateurs déjà existants
-- ------------------------------
INSERT INTO s_afro_dev.profil_utilisateur (user_id)
SELECT id FROM s_afro_dev.utilisateur
ON CONFLICT DO NOTHING;
