BEGIN;

CREATE TABLE IF NOT EXISTS s_afro_dev.profil_capillaire (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    longueur_texte VARCHAR(20) NOT NULL CHECK (longueur_texte IN ('courte', 'mi_longue', 'longue')),
    longueur_cm NUMERIC(5, 1) CHECK (longueur_cm IS NULL OR longueur_cm BETWEEN 0 AND 300),
    densite VARCHAR(20) CHECK (densite IS NULL OR densite IN ('fine', 'moyenne', 'epaisse')),
    texture_texte VARCHAR(20) NOT NULL CHECK (texture_texte IN ('lisse', 'ondule', 'boucle', 'crepu')),
    texture_code VARCHAR(2) CHECK (texture_code IS NULL OR texture_code IN ('1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C', '4A', '4B', '4C')),
    etat_actuel TEXT[] NOT NULL DEFAULT '{}',
    naturel_defrise VARCHAR(20) CHECK (naturel_defrise IS NULL OR naturel_defrise IN ('naturel', 'defrise')),
    traitements_chimiques TEXT[] NOT NULL DEFAULT '{}',
    date_dernier_traitement DATE,
    sensibilite_cuir_chevelu VARCHAR(20) CHECK (sensibilite_cuir_chevelu IS NULL OR sensibilite_cuir_chevelu IN ('aucune', 'legere', 'sensible', 'tres_sensible')),
    extensions BOOLEAN,
    extensions_type VARCHAR(100),
    preferences_allergies TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_profil_capillaire_etat CHECK (etat_actuel <@ ARRAY['sain', 'sec', 'cassant', 'abime', 'gras']::TEXT[]),
    CONSTRAINT chk_profil_capillaire_traitements CHECK (traitements_chimiques <@ ARRAY['coloration', 'defrisage', 'permanente']::TEXT[]),
    CONSTRAINT chk_profil_capillaire_extensions CHECK (extensions IS DISTINCT FROM TRUE OR NULLIF(TRIM(extensions_type), '') IS NOT NULL),
    CONSTRAINT chk_profil_capillaire_date_traitement CHECK (date_dernier_traitement IS NULL OR date_dernier_traitement <= CURRENT_DATE)
);

CREATE TABLE IF NOT EXISTS s_afro_dev.photo_profil_capillaire (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    numero SMALLINT NOT NULL CHECK (numero BETWEEN 0 AND 9),
    date_prise TIMESTAMP NOT NULL,
    date_upload TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, numero)
);

CREATE TABLE IF NOT EXISTS s_afro_dev.prestation_champ_profil (
    prestation_id INTEGER NOT NULL REFERENCES s_afro_dev.prestation(id) ON DELETE CASCADE,
    champ_profil VARCHAR(40) NOT NULL CHECK (champ_profil IN (
        'longueur', 'densite', 'texture', 'etat_actuel', 'naturel_defrise',
        'traitements_chimiques', 'sensibilite_cuir_chevelu', 'extensions',
        'preferences_allergies', 'photos'
    )),
    PRIMARY KEY (prestation_id, champ_profil)
);

ALTER TABLE s_afro_dev.rendez_vous
    ADD COLUMN IF NOT EXISTS champs_profil_partages TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE s_afro_dev.rendez_vous
    DROP CONSTRAINT IF EXISTS chk_rdv_champs_profil_partages;
ALTER TABLE s_afro_dev.rendez_vous
    ADD CONSTRAINT chk_rdv_champs_profil_partages CHECK (champs_profil_partages <@ ARRAY[
        'longueur', 'densite', 'texture', 'etat_actuel', 'naturel_defrise',
        'traitements_chimiques', 'sensibilite_cuir_chevelu', 'extensions',
        'preferences_allergies', 'photos'
    ]::TEXT[]);

CREATE INDEX IF NOT EXISTS idx_photo_profil_capillaire_user
    ON s_afro_dev.photo_profil_capillaire(user_id, numero);
CREATE INDEX IF NOT EXISTS idx_prestation_champ_profil_champ
    ON s_afro_dev.prestation_champ_profil(champ_profil, prestation_id);

DROP TRIGGER IF EXISTS trg_profil_capillaire_updated_at ON s_afro_dev.profil_capillaire;
CREATE TRIGGER trg_profil_capillaire_updated_at
BEFORE UPDATE ON s_afro_dev.profil_capillaire
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();

COMMIT;
