-- ==============================
-- USER applicatif
-- ==============================
CREATE USER haire_dev WITH PASSWORD 'haire_dev';

-- ==============================
-- SCHEMA
-- ==============================
CREATE SCHEMA s_afro_dev AUTHORIZATION haire_dev;

-- Donner tous les droits sur le schéma
GRANT ALL PRIVILEGES ON SCHEMA s_afro_dev TO haire_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA s_afro_dev
    GRANT ALL PRIVILEGES ON TABLES TO haire_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA s_afro_dev
    GRANT ALL PRIVILEGES ON SEQUENCES TO haire_dev;

-- ==============================
-- ENUM TYPES
-- ==============================
CREATE TYPE s_afro_dev.role_utilisateur AS ENUM (
    'client',
    'coiffeur',
    'admin'
);

CREATE TYPE s_afro_dev.statut_utilisateur AS ENUM (
    'actif',
    'desabonne'
);

CREATE TYPE s_afro_dev.sexe_utilisateur AS ENUM (
    'homme',
    'femme',
    'non_precise'
);

-- ==============================
-- TABLE UTILISATEUR
-- ==============================
CREATE TABLE s_afro_dev.utilisateur (
                                        id              SERIAL          PRIMARY KEY,
                                        nom_utilisateur VARCHAR(50)     NOT NULL UNIQUE,
                                        email           VARCHAR(255)    NOT NULL UNIQUE,
                                        mot_de_passe    VARCHAR(255)    NOT NULL,
                                        prenom          VARCHAR(100)    NOT NULL,
                                        nom             VARCHAR(100)    NOT NULL,
                                        date_naissance  DATE,
                                        sexe            s_afro_dev.sexe_utilisateur,
                                        ville           VARCHAR(100),
                                        latitude        DECIMAL(10, 8),
                                        longitude       DECIMAL(11, 8),
                                        telephone       VARCHAR(20),
                                        role            s_afro_dev.role_utilisateur NOT NULL DEFAULT 'client',
                                        is_pro          BOOLEAN         NOT NULL DEFAULT FALSE,
                                        statut          s_afro_dev.statut_utilisateur NOT NULL DEFAULT 'actif',
                                        created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
                                        updated_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
                                        is_online       BOOLEAN         NOT NULL DEFAULT FALSE,
                                        last_activity   TIMESTAMP

);

-- Auto-update de updated_at
CREATE OR REPLACE FUNCTION s_afro_dev.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    IF (
        NEW.nom_utilisateur IS DISTINCT FROM OLD.nom_utilisateur OR
        NEW.email           IS DISTINCT FROM OLD.email           OR
        NEW.mot_de_passe    IS DISTINCT FROM OLD.mot_de_passe    OR
        NEW.prenom          IS DISTINCT FROM OLD.prenom          OR
        NEW.nom             IS DISTINCT FROM OLD.nom             OR
        NEW.date_naissance  IS DISTINCT FROM OLD.date_naissance  OR
        NEW.sexe            IS DISTINCT FROM OLD.sexe            OR
        NEW.ville           IS DISTINCT FROM OLD.ville           OR
        NEW.latitude        IS DISTINCT FROM OLD.latitude        OR
        NEW.longitude       IS DISTINCT FROM OLD.longitude       OR
        NEW.telephone       IS DISTINCT FROM OLD.telephone       OR
        NEW.role            IS DISTINCT FROM OLD.role            OR
        NEW.is_pro          IS DISTINCT FROM OLD.is_pro          OR
        NEW.statut          IS DISTINCT FROM OLD.statut
    ) THEN
        NEW.updated_at = NOW();
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_utilisateur_updated_at
    BEFORE UPDATE ON s_afro_dev.utilisateur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.set_updated_at();