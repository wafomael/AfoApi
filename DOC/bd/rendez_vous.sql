-- ==============================
-- RENDEZ-VOUS — planning, disponibilités et réservations
-- ==============================
-- Statuts :
--   demande     : le client a demandé un créneau, en attente coiffeur
--   confirme    : le coiffeur a confirmé
--   annule      : annulé par le client ou le coiffeur
--   termine     : prestation réalisée
--   non_present : client absent
--
-- IDs en INTEGER (cohérent avec utilisateur.id SERIAL).
-- ==============================

-- ------------------------------
-- TABLE DISPO COIFFEUR (récurrence hebdomadaire)
-- ------------------------------
-- jour_semaine : 0 = dimanche, 1 = lundi, ..., 6 = samedi
CREATE TABLE IF NOT EXISTS s_afro_dev.disponibilite (
    id          SERIAL        PRIMARY KEY,
    coiffeur_id INTEGER       NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    jour_semaine SMALLINT     NOT NULL CHECK (jour_semaine BETWEEN 0 AND 6),
    heure_debut TIME          NOT NULL,
    heure_fin   TIME          NOT NULL,
    actif       BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_heures CHECK (heure_fin > heure_debut)
);

CREATE INDEX IF NOT EXISTS idx_disponibilite_coiffeur
    ON s_afro_dev.disponibilite(coiffeur_id, jour_semaine) WHERE actif = TRUE;

-- ------------------------------
-- TABLE EXCEPTION DISPO (jours bloqués ponctuellement)
-- ------------------------------
CREATE TABLE IF NOT EXISTS s_afro_dev.exception_disponibilite (
    id          SERIAL        PRIMARY KEY,
    coiffeur_id INTEGER       NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    date        DATE          NOT NULL,
    heure_debut TIME,
    heure_fin   TIME,
    raison      VARCHAR(255),
    actif       BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_exception_heures CHECK (
        (heure_debut IS NULL AND heure_fin IS NULL) OR
        (heure_debut IS NOT NULL AND heure_fin IS NOT NULL AND heure_fin > heure_debut)
    )
);

CREATE INDEX IF NOT EXISTS idx_exception_coiffeur
    ON s_afro_dev.exception_disponibilite(coiffeur_id, date) WHERE actif = TRUE;

-- ------------------------------
-- TABLE RENDEZ-VOUS
-- ------------------------------
CREATE TABLE IF NOT EXISTS s_afro_dev.rendez_vous (
    id            SERIAL        PRIMARY KEY,
    client_id     INTEGER       NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    coiffeur_id   INTEGER       NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    prestation_id INTEGER       REFERENCES s_afro_dev.prestation(id) ON DELETE SET NULL,
    date_debut    TIMESTAMP     NOT NULL,
    date_fin      TIMESTAMP     NOT NULL,
    statut        VARCHAR(20)   NOT NULL DEFAULT 'demande'
                                 CHECK (statut IN ('demande', 'confirme', 'annule', 'termine', 'non_present')),
    prix          DECIMAL(8,2)  CHECK (prix IS NULL OR prix >= 0),
    unite_prix    VARCHAR(20)   NOT NULL DEFAULT 'forfait',
    note_client   TEXT,
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rdv_dates CHECK (date_fin > date_debut),
    CONSTRAINT chk_pas_soi CHECK (client_id <> coiffeur_id)
);

CREATE INDEX IF NOT EXISTS idx_rdv_client ON s_afro_dev.rendez_vous(client_id, date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_rdv_coiffeur ON s_afro_dev.rendez_vous(coiffeur_id, date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_rdv_statut ON s_afro_dev.rendez_vous(statut);

DROP TRIGGER IF EXISTS trg_rendez_vous_updated_at ON s_afro_dev.rendez_vous;
CREATE TRIGGER trg_rendez_vous_updated_at
    BEFORE UPDATE ON s_afro_dev.rendez_vous
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
