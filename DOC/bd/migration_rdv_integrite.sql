BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION s_afro_dev.valider_creneau_rendez_vous()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date_debut::date <> NEW.date_fin::date THEN
        RAISE EXCEPTION 'Un rendez-vous doit commencer et finir le même jour'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM s_afro_dev.disponibilite d
        WHERE d.coiffeur_id = NEW.coiffeur_id
          AND d.actif = TRUE
          AND d.jour_semaine = EXTRACT(DOW FROM NEW.date_debut)::smallint
          AND d.heure_debut <= NEW.date_debut::time
          AND d.heure_fin >= NEW.date_fin::time
    ) THEN
        RAISE EXCEPTION 'Le créneau est hors disponibilité'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM s_afro_dev.exception_disponibilite e
        WHERE e.coiffeur_id = NEW.coiffeur_id
          AND e.date = NEW.date_debut::date
          AND e.actif = TRUE
          AND (
              e.heure_debut IS NULL
              OR (e.heure_debut < NEW.date_fin::time AND e.heure_fin > NEW.date_debut::time)
          )
    ) THEN
        RAISE EXCEPTION 'Le créneau est bloqué par une exception'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valider_creneau_rendez_vous ON s_afro_dev.rendez_vous;
CREATE TRIGGER trg_valider_creneau_rendez_vous
    BEFORE INSERT OR UPDATE OF coiffeur_id, date_debut, date_fin
    ON s_afro_dev.rendez_vous
    FOR EACH ROW
    EXECUTE FUNCTION s_afro_dev.valider_creneau_rendez_vous();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'excl_rendez_vous_coiffeur_creneau'
          AND conrelid = 's_afro_dev.rendez_vous'::regclass
    ) THEN
        ALTER TABLE s_afro_dev.rendez_vous
            ADD CONSTRAINT excl_rendez_vous_coiffeur_creneau
            EXCLUDE USING gist (
                coiffeur_id WITH =,
                tsrange(date_debut, date_fin, '[)') WITH &&
            )
            WHERE (statut IN ('demande', 'confirme'));
    END IF;
END;
$$;

ALTER TABLE s_afro_dev.avis
    ADD COLUMN IF NOT EXISTS rendez_vous_id INTEGER
    REFERENCES s_afro_dev.rendez_vous(id) ON DELETE CASCADE;

ALTER TABLE s_afro_dev.avis
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE s_afro_dev.avis
    DROP CONSTRAINT IF EXISTS uq_avis_client_coiffeur;

ALTER TABLE s_afro_dev.avis
    ALTER COLUMN rendez_vous_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_avis_rendez_vous'
          AND conrelid = 's_afro_dev.avis'::regclass
    ) THEN
        ALTER TABLE s_afro_dev.avis
            ADD CONSTRAINT uq_avis_rendez_vous UNIQUE (rendez_vous_id);
    END IF;
END;
$$;

COMMIT;
