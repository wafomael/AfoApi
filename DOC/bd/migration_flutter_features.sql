-- ============================================================
-- MIGRATION — Sprint 2 : Profil étendu + Coiffeur + Social
-- À exécuter UNE SEULE FOIS sur la base existante.
-- Tout est idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ============================================================

-- 1. Fonction utilitaire (nécessaire pour les triggers updated_at)
CREATE OR REPLACE FUNCTION s_afro_dev.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. PROFIL ÉTENDU
CREATE TABLE IF NOT EXISTS s_afro_dev.profil_utilisateur (
    user_id           INTEGER     NOT NULL PRIMARY KEY
                                  REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    bio               VARCHAR(200),
    lien_externe      VARCHAR(255),
    type_cheveux      TEXT[]      NOT NULL DEFAULT '{}',
    coiffure_preferee TEXT[]      NOT NULL DEFAULT '{}',
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_profil_utilisateur_updated_at ON s_afro_dev.profil_utilisateur;
CREATE TRIGGER trg_profil_utilisateur_updated_at
    BEFORE UPDATE ON s_afro_dev.profil_utilisateur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();

CREATE OR REPLACE FUNCTION s_afro_dev.create_profil_utilisateur()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO s_afro_dev.profil_utilisateur (user_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_profil_utilisateur ON s_afro_dev.utilisateur;
CREATE TRIGGER trg_create_profil_utilisateur
    AFTER INSERT ON s_afro_dev.utilisateur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.create_profil_utilisateur();

-- Backfill users existants
INSERT INTO s_afro_dev.profil_utilisateur (user_id)
SELECT id FROM s_afro_dev.utilisateur
ON CONFLICT DO NOTHING;

-- 3. COIFFEUR
CREATE TABLE IF NOT EXISTS s_afro_dev.profil_coiffeur (
    user_id      INTEGER       NOT NULL PRIMARY KEY
                               REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    nom_salon    VARCHAR(150),
    description  TEXT,
    adresse      TEXT,
    rayon_km     SMALLINT      CHECK (rayon_km IS NULL OR rayon_km >= 0),
    note_moyenne DECIMAL(3,2)  NOT NULL DEFAULT 0,
    nb_avis      INTEGER       NOT NULL DEFAULT 0,
    updated_at   TIMESTAMP     NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_profil_coiffeur_updated_at ON s_afro_dev.profil_coiffeur;
CREATE TRIGGER trg_profil_coiffeur_updated_at
    BEFORE UPDATE ON s_afro_dev.profil_coiffeur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();

CREATE TABLE IF NOT EXISTS s_afro_dev.prestation (
    id              SERIAL        PRIMARY KEY,
    coiffeur_id     INTEGER       NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    nom             VARCHAR(150)  NOT NULL,
    categorie       VARCHAR(80),
    prix            DECIMAL(8,2)  CHECK (prix IS NULL OR prix >= 0),
    unite_prix      VARCHAR(20)   NOT NULL DEFAULT 'forfait',
    duree_min       SMALLINT      CHECK (duree_min IS NULL OR duree_min >= 0),
    materiel_client BOOLEAN       NOT NULL DEFAULT FALSE,
    description     TEXT,
    media_count     SMALLINT      NOT NULL DEFAULT 0,
    actif           BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prestation_coiffeur ON s_afro_dev.prestation(coiffeur_id) WHERE actif = TRUE;

CREATE TABLE IF NOT EXISTS s_afro_dev.avis (
    id          SERIAL      PRIMARY KEY,
    client_id   INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    coiffeur_id INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    note        SMALLINT    NOT NULL CHECK (note BETWEEN 1 AND 5),
    commentaire TEXT,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_avis_client_coiffeur UNIQUE (client_id, coiffeur_id),
    CONSTRAINT chk_avis_pas_soi CHECK (client_id <> coiffeur_id)
);

CREATE INDEX IF NOT EXISTS idx_avis_coiffeur ON s_afro_dev.avis(coiffeur_id);

CREATE OR REPLACE FUNCTION s_afro_dev.maj_note_coiffeur()
RETURNS TRIGGER AS $$
DECLARE
    cible INTEGER;
BEGIN
    cible := COALESCE(NEW.coiffeur_id, OLD.coiffeur_id);
    UPDATE s_afro_dev.profil_coiffeur pc
       SET note_moyenne = COALESCE((
               SELECT ROUND(AVG(a.note)::numeric, 2)
               FROM s_afro_dev.avis a
               WHERE a.coiffeur_id = cible
           ), 0),
           nb_avis = (
               SELECT COUNT(*) FROM s_afro_dev.avis a WHERE a.coiffeur_id = cible
           )
     WHERE pc.user_id = cible;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maj_note_coiffeur ON s_afro_dev.avis;
CREATE TRIGGER trg_maj_note_coiffeur
    AFTER INSERT OR UPDATE OR DELETE ON s_afro_dev.avis
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.maj_note_coiffeur();

-- 4. SOCIAL (publications, likes, accomplissements)
CREATE TABLE IF NOT EXISTS s_afro_dev.publication (
    id          SERIAL      PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    legende     VARCHAR(500),
    media_count SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publication_user ON s_afro_dev.publication(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS s_afro_dev.cauris (
    user_id        INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    publication_id INTEGER     NOT NULL REFERENCES s_afro_dev.publication(id) ON DELETE CASCADE,
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, publication_id)
);

CREATE INDEX IF NOT EXISTS idx_cauris_publication ON s_afro_dev.cauris(publication_id);

CREATE TABLE IF NOT EXISTS s_afro_dev.accomplissement (
    id        SERIAL        PRIMARY KEY,
    code      VARCHAR(60)   NOT NULL UNIQUE,
    nom       VARCHAR(120)  NOT NULL,
    icone     VARCHAR(255),
    condition JSONB
);

CREATE TABLE IF NOT EXISTS s_afro_dev.utilisateur_accomplissement (
    user_id            INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    accomplissement_id INTEGER     NOT NULL REFERENCES s_afro_dev.accomplissement(id) ON DELETE CASCADE,
    obtenu_le          TIMESTAMP   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, accomplissement_id)
);
