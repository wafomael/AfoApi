-- ============================================================
-- MIGRATION — Sprint 1 : Follow/Unfollow + Visibilité
-- À exécuter UNE SEULE FOIS sur la base existante.
-- Ordre obligatoire : abonnement → visibilite_utilisateur →
--                     trigger → seed users existants.
-- ============================================================


-- ==============================
-- 1. TABLE ABONNEMENT
-- ==============================
-- (Si déjà créée, ce bloc est idempotent grâce à IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS s_afro_dev.abonnement (
    suiveur_id  INTEGER   NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    suivi_id    INTEGER   NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (suiveur_id, suivi_id),
    CONSTRAINT no_self_follow CHECK (suiveur_id <> suivi_id)
);

CREATE INDEX IF NOT EXISTS idx_abonnement_suiveur ON s_afro_dev.abonnement(suiveur_id);
CREATE INDEX IF NOT EXISTS idx_abonnement_suivi   ON s_afro_dev.abonnement(suivi_id);


-- ==============================
-- 2. TABLE VISIBILITE_UTILISATEUR
-- ==============================
-- Niveaux de visibilité pour chaque champ sensible :
--   0 = Personne
--   1 = Tribu (abonnements mutuels uniquement)  ← défaut
--   2 = Abonnés (tous ceux qui me suivent)
--   3 = Tout le monde (public)
--
-- Champs couverts :
--   online_status   : statut en ligne
--   telephone       : numéro de téléphone
--   email           : adresse email
--   localisation    : ville, latitude, longitude
--   date_naissance  : date de naissance

CREATE TABLE IF NOT EXISTS s_afro_dev.visibilite_utilisateur (
    utilisateur_id  INTEGER  NOT NULL PRIMARY KEY
                             REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    online_status   SMALLINT NOT NULL DEFAULT 1 CHECK (online_status   BETWEEN 0 AND 3),
    telephone       SMALLINT NOT NULL DEFAULT 1 CHECK (telephone       BETWEEN 0 AND 3),
    email           SMALLINT NOT NULL DEFAULT 1 CHECK (email           BETWEEN 0 AND 3),
    localisation    SMALLINT NOT NULL DEFAULT 3 CHECK (localisation    BETWEEN 0 AND 3),
    date_naissance  SMALLINT NOT NULL DEFAULT 0 CHECK (date_naissance  BETWEEN 0 AND 3),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);


-- ==============================
-- 3. TRIGGER : insertion auto à l'inscription
-- ==============================
-- Crée automatiquement la ligne de visibilité dès qu'un user est inséré.

CREATE OR REPLACE FUNCTION s_afro_dev.create_visibilite_utilisateur()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO s_afro_dev.visibilite_utilisateur (utilisateur_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_visibilite ON s_afro_dev.utilisateur;

CREATE TRIGGER trg_create_visibilite
    AFTER INSERT ON s_afro_dev.utilisateur
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.create_visibilite_utilisateur();


-- ==============================
-- 4. SEED : utilisateurs existants (one-shot)
-- ==============================
-- Le trigger ne s'applique qu'aux nouveaux inserts.
-- Cette requête crée les lignes manquantes pour les users déjà en base.

INSERT INTO s_afro_dev.visibilite_utilisateur (utilisateur_id)
SELECT id FROM s_afro_dev.utilisateur
ON CONFLICT DO NOTHING;
