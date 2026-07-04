-- ==============================
-- COIFFEUR — profil_coiffeur + prestation + avis
-- ==============================
-- profil_coiffeur : 1-1 OPTIONNEL avec utilisateur (uniquement les pros).
-- Pas de colonne pour les images : la photo pro et la bannière se
-- reconstruisent depuis l'id ({user_id}_pro.webp, {user_id}_banner.webp),
-- même logique que la photo de profil.
--
-- note_moyenne / nb_avis : stockés et recalculés via trigger sur la table avis
-- (évite un AVG sur toute la table à chaque affichage).
--
-- IDs en INTEGER (cohérent avec utilisateur.id SERIAL).
-- Nécessite s_afro_dev.touch_updated_at() (voir profil_etendu.sql).
-- ==============================

-- ------------------------------
-- TABLE PROFIL_COIFFEUR
-- ------------------------------
CREATE TABLE s_afro_dev.profil_coiffeur (
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

CREATE TRIGGER trg_profil_coiffeur_updated_at
    BEFORE UPDATE ON s_afro_dev.profil_coiffeur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();

-- ------------------------------
-- TABLE PRESTATION (catalogue du coiffeur)
-- ------------------------------
-- media_count : nombre de fichiers {presta_<id>_<i>.webp} (i de 0 à n-1).
-- actif : soft delete (masque sans casser l'historique des futurs RDV).
CREATE TABLE s_afro_dev.prestation (
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

-- Catalogue d'un coiffeur (les prestations actives d'abord)
CREATE INDEX idx_prestation_coiffeur ON s_afro_dev.prestation(coiffeur_id) WHERE actif = TRUE;

-- ------------------------------
-- TABLE AVIS (reviews client → coiffeur)
-- ------------------------------
-- Un client ne peut laisser qu'UN avis par coiffeur (UNIQUE).
CREATE TABLE s_afro_dev.avis (
    id          SERIAL      PRIMARY KEY,
    client_id   INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    coiffeur_id INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    note        SMALLINT    NOT NULL CHECK (note BETWEEN 1 AND 5),
    commentaire TEXT,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_avis_client_coiffeur UNIQUE (client_id, coiffeur_id),
    CONSTRAINT chk_avis_pas_soi CHECK (client_id <> coiffeur_id)
);

CREATE INDEX idx_avis_coiffeur ON s_afro_dev.avis(coiffeur_id);

-- ------------------------------
-- TRIGGER : recalcul de note_moyenne + nb_avis après INSERT/UPDATE/DELETE d'avis
-- ------------------------------
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

CREATE TRIGGER trg_maj_note_coiffeur
    AFTER INSERT OR UPDATE OR DELETE ON s_afro_dev.avis
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.maj_note_coiffeur();
