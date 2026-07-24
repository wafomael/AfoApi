BEGIN;

ALTER TABLE s_afro_dev.profil_coiffeur
    ADD COLUMN IF NOT EXISTS temps_repos_minutes SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS temps_trajet_minutes SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mode_prestation_defaut VARCHAR(20) NOT NULL DEFAULT 'salon';

ALTER TABLE s_afro_dev.profil_coiffeur
    DROP CONSTRAINT IF EXISTS chk_profil_coiffeur_temps_repos,
    DROP CONSTRAINT IF EXISTS chk_profil_coiffeur_temps_trajet,
    DROP CONSTRAINT IF EXISTS chk_profil_coiffeur_mode_prestation;
ALTER TABLE s_afro_dev.profil_coiffeur
    ADD CONSTRAINT chk_profil_coiffeur_temps_repos CHECK (temps_repos_minutes BETWEEN 0 AND 240),
    ADD CONSTRAINT chk_profil_coiffeur_temps_trajet CHECK (temps_trajet_minutes BETWEEN 0 AND 240),
    ADD CONSTRAINT chk_profil_coiffeur_mode_prestation CHECK (mode_prestation_defaut IN ('salon', 'domicile', 'les_deux'));

CREATE TABLE IF NOT EXISTS s_afro_dev.politique_reservation (
    coiffeur_id INTEGER PRIMARY KEY REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    delai_min_heures SMALLINT NOT NULL DEFAULT 3 CHECK (delai_min_heures BETWEEN 0 AND 720),
    delai_max_jours SMALLINT NOT NULL DEFAULT 90 CHECK (delai_max_jours BETWEEN 1 AND 365),
    annulation_gratuite_heures SMALLINT NOT NULL DEFAULT 24 CHECK (annulation_gratuite_heures BETWEEN 0 AND 720),
    report_max_heures SMALLINT NOT NULL DEFAULT 24 CHECK (report_max_heures BETWEEN 0 AND 720),
    nb_reports_max SMALLINT NOT NULL DEFAULT 1 CHECK (nb_reports_max BETWEEN 0 AND 10),
    tolerance_retard_min SMALLINT NOT NULL DEFAULT 15 CHECK (tolerance_retard_min BETWEEN 0 AND 180),
    annulation_auto_retard BOOLEAN NOT NULL DEFAULT FALSE,
    acompte_remboursable BOOLEAN NOT NULL DEFAULT TRUE,
    acompte_pourcentage NUMERIC(5, 2) NOT NULL DEFAULT 20 CHECK (acompte_pourcentage BETWEEN 0 AND 100),
    politique_obligatoire BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE s_afro_dev.rendez_vous
    DROP CONSTRAINT IF EXISTS rendez_vous_statut_check;
ALTER TABLE s_afro_dev.rendez_vous
    ADD CONSTRAINT rendez_vous_statut_check CHECK (statut IN (
        'demande', 'confirme', 'en_cours', 'termine', 'annule', 'refuse', 'non_present'
    ));
ALTER TABLE s_afro_dev.rendez_vous
    ADD COLUMN IF NOT EXISTS mode_prestation VARCHAR(20) NOT NULL DEFAULT 'salon',
    ADD COLUMN IF NOT EXISTS temps_repos_minutes SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS temps_trajet_minutes SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS date_fin_blocage TIMESTAMP,
    ADD COLUMN IF NOT EXISTS retard_minutes SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS decalage_minutes SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS nb_reports SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS acompte_paye BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS montant_acompte NUMERIC(8, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS statut_acompte VARCHAR(30) NOT NULL DEFAULT 'non_requis',
    ADD COLUMN IF NOT EXISTS politique_acceptee_at TIMESTAMP;

UPDATE s_afro_dev.rendez_vous SET date_fin_blocage = date_fin WHERE date_fin_blocage IS NULL;
ALTER TABLE s_afro_dev.rendez_vous ALTER COLUMN date_fin_blocage SET NOT NULL;
ALTER TABLE s_afro_dev.rendez_vous
    DROP CONSTRAINT IF EXISTS chk_rdv_mode_prestation,
    DROP CONSTRAINT IF EXISTS chk_rdv_buffers,
    DROP CONSTRAINT IF EXISTS chk_rdv_retard,
    DROP CONSTRAINT IF EXISTS chk_rdv_reports,
    DROP CONSTRAINT IF EXISTS chk_rdv_acompte;
ALTER TABLE s_afro_dev.rendez_vous
    ADD CONSTRAINT chk_rdv_mode_prestation CHECK (mode_prestation IN ('salon', 'domicile')),
    ADD CONSTRAINT chk_rdv_buffers CHECK (temps_repos_minutes BETWEEN 0 AND 240 AND temps_trajet_minutes BETWEEN 0 AND 240 AND date_fin_blocage >= date_fin),
    ADD CONSTRAINT chk_rdv_retard CHECK (retard_minutes BETWEEN 0 AND 180 AND decalage_minutes >= 0),
    ADD CONSTRAINT chk_rdv_reports CHECK (nb_reports BETWEEN 0 AND 10),
    ADD CONSTRAINT chk_rdv_acompte CHECK (montant_acompte >= 0 AND statut_acompte IN ('non_requis', 'paye', 'remboursement_prevu', 'rembourse', 'non_remboursable'));

ALTER TABLE s_afro_dev.rendez_vous DROP CONSTRAINT IF EXISTS excl_rendez_vous_coiffeur_creneau;
ALTER TABLE s_afro_dev.rendez_vous ADD CONSTRAINT excl_rendez_vous_coiffeur_creneau EXCLUDE USING gist (
    coiffeur_id WITH =,
    tsrange(date_debut, date_fin_blocage, '[)') WITH &&
) WHERE (statut IN ('demande', 'confirme', 'en_cours')) DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE IF NOT EXISTS s_afro_dev.historique_rendez_vous (
    id BIGSERIAL PRIMARY KEY,
    rendez_vous_id INTEGER NOT NULL REFERENCES s_afro_dev.rendez_vous(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    auteur_id INTEGER REFERENCES s_afro_dev.utilisateur(id) ON DELETE SET NULL,
    auteur_role VARCHAR(20),
    date_action TIMESTAMP NOT NULL DEFAULT NOW(),
    motif TEXT,
    ancienne_date TIMESTAMP,
    nouvelle_date TIMESTAMP,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS s_afro_dev.consentement_profil (
    rendez_vous_id INTEGER NOT NULL REFERENCES s_afro_dev.rendez_vous(id) ON DELETE CASCADE,
    champ_profil VARCHAR(40) NOT NULL CHECK (champ_profil IN (
        'longueur', 'densite', 'texture', 'etat_actuel', 'naturel_defrise',
        'traitements_chimiques', 'sensibilite_cuir_chevelu', 'extensions',
        'preferences_allergies', 'photos'
    )),
    consented_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (rendez_vous_id, champ_profil)
);

INSERT INTO s_afro_dev.consentement_profil (rendez_vous_id, champ_profil, consented_at)
SELECT r.id, champ, r.created_at
FROM s_afro_dev.rendez_vous r
CROSS JOIN LATERAL unnest(r.champs_profil_partages) AS champ
ON CONFLICT DO NOTHING;

INSERT INTO s_afro_dev.historique_rendez_vous
    (rendez_vous_id, action, auteur_id, auteur_role, date_action, nouvelle_date, details)
SELECT r.id, 'migration_import', r.client_id, 'client', r.created_at, r.date_debut,
       jsonb_build_object('statut_importe', r.statut)
FROM s_afro_dev.rendez_vous r
WHERE NOT EXISTS (
    SELECT 1 FROM s_afro_dev.historique_rendez_vous h WHERE h.rendez_vous_id = r.id
);

DELETE FROM s_afro_dev.disponibilite cible
USING s_afro_dev.disponibilite doublon
WHERE cible.id > doublon.id
  AND cible.coiffeur_id = doublon.coiffeur_id
  AND cible.jour_semaine = doublon.jour_semaine
  AND cible.heure_debut = doublon.heure_debut
  AND cible.heure_fin = doublon.heure_fin;

DELETE FROM s_afro_dev.exception_disponibilite cible
USING s_afro_dev.exception_disponibilite doublon
WHERE cible.id > doublon.id
  AND cible.coiffeur_id = doublon.coiffeur_id
  AND cible.date = doublon.date
  AND cible.heure_debut IS NOT DISTINCT FROM doublon.heure_debut
  AND cible.heure_fin IS NOT DISTINCT FROM doublon.heure_fin;

CREATE UNIQUE INDEX IF NOT EXISTS uq_disponibilite_exacte
    ON s_afro_dev.disponibilite(coiffeur_id, jour_semaine, heure_debut, heure_fin);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exception_disponibilite_exacte
    ON s_afro_dev.exception_disponibilite(
        coiffeur_id, date, COALESCE(heure_debut, TIME '00:00'), COALESCE(heure_fin, TIME '00:00')
    );

CREATE INDEX IF NOT EXISTS idx_historique_rdv ON s_afro_dev.historique_rendez_vous(rendez_vous_id, date_action DESC);
CREATE INDEX IF NOT EXISTS idx_rdv_decalages ON s_afro_dev.rendez_vous(client_id, date_debut) WHERE decalage_minutes > 0 AND statut IN ('demande', 'confirme');

CREATE OR REPLACE FUNCTION s_afro_dev.valider_creneau_rendez_vous()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date_debut::date <> NEW.date_fin_blocage::date THEN
        RAISE EXCEPTION 'Un rendez-vous et ses temps de gestion doivent rester le même jour' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM s_afro_dev.disponibilite d
        WHERE d.coiffeur_id = NEW.coiffeur_id
          AND d.actif = TRUE
          AND d.jour_semaine = EXTRACT(DOW FROM NEW.date_debut)::smallint
          AND d.heure_debut <= NEW.date_debut::time
          AND d.heure_fin >= NEW.date_fin_blocage::time
    ) THEN
        RAISE EXCEPTION 'Le créneau est hors disponibilité' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM s_afro_dev.exception_disponibilite e
        WHERE e.coiffeur_id = NEW.coiffeur_id
          AND e.date = NEW.date_debut::date
          AND e.actif = TRUE
          AND (e.heure_debut IS NULL OR (e.heure_debut < NEW.date_fin_blocage::time AND e.heure_fin > NEW.date_debut::time))
    ) THEN
        RAISE EXCEPTION 'Le créneau est bloqué par une exception' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valider_creneau_rendez_vous ON s_afro_dev.rendez_vous;
CREATE TRIGGER trg_valider_creneau_rendez_vous
BEFORE INSERT OR UPDATE OF coiffeur_id, date_debut, date_fin, date_fin_blocage
ON s_afro_dev.rendez_vous FOR EACH ROW EXECUTE FUNCTION s_afro_dev.valider_creneau_rendez_vous();

DROP TRIGGER IF EXISTS trg_politique_reservation_updated_at ON s_afro_dev.politique_reservation;
CREATE TRIGGER trg_politique_reservation_updated_at
BEFORE UPDATE ON s_afro_dev.politique_reservation
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();

COMMIT;
