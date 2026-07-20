BEGIN;

DROP SCHEMA IF EXISTS s_afro_dev CASCADE;
CREATE SCHEMA s_afro_dev;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE s_afro_dev.role_utilisateur AS ENUM ('client', 'coiffeur', 'admin');
CREATE TYPE s_afro_dev.statut_utilisateur AS ENUM ('actif', 'desabonne');
CREATE TYPE s_afro_dev.sexe_utilisateur AS ENUM ('homme', 'femme', 'non_precise');

CREATE TABLE s_afro_dev.utilisateur (
    id SERIAL PRIMARY KEY,
    nom_utilisateur VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    mot_de_passe VARCHAR(255) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    date_naissance DATE,
    sexe s_afro_dev.sexe_utilisateur,
    ville VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    telephone VARCHAR(20),
    role s_afro_dev.role_utilisateur NOT NULL DEFAULT 'client',
    is_pro BOOLEAN NOT NULL DEFAULT FALSE,
    statut s_afro_dev.statut_utilisateur NOT NULL DEFAULT 'actif',
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_activity TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.visibilite_utilisateur (
    utilisateur_id INTEGER PRIMARY KEY REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    online_status SMALLINT NOT NULL DEFAULT 1 CHECK (online_status BETWEEN 0 AND 3),
    telephone SMALLINT NOT NULL DEFAULT 1 CHECK (telephone BETWEEN 0 AND 3),
    email SMALLINT NOT NULL DEFAULT 1 CHECK (email BETWEEN 0 AND 3),
    localisation SMALLINT NOT NULL DEFAULT 3 CHECK (localisation BETWEEN 0 AND 3),
    date_naissance SMALLINT NOT NULL DEFAULT 0 CHECK (date_naissance BETWEEN 0 AND 3),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.profil_utilisateur (
    user_id INTEGER PRIMARY KEY REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    bio VARCHAR(200),
    lien_externe VARCHAR(255),
    type_cheveux TEXT[] NOT NULL DEFAULT '{}',
    coiffure_preferee TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.profil_coiffeur (
    user_id INTEGER PRIMARY KEY REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    nom_salon VARCHAR(150),
    description TEXT,
    adresse TEXT,
    rayon_km SMALLINT CHECK (rayon_km IS NULL OR rayon_km >= 0),
    note_moyenne DECIMAL(3, 2) NOT NULL DEFAULT 0,
    nb_avis INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.prestation (
    id SERIAL PRIMARY KEY,
    coiffeur_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    nom VARCHAR(150) NOT NULL,
    categorie VARCHAR(80),
    prix DECIMAL(8, 2) CHECK (prix IS NULL OR prix >= 0),
    unite_prix VARCHAR(20) NOT NULL DEFAULT 'forfait',
    duree_min SMALLINT CHECK (duree_min IS NULL OR duree_min > 0),
    materiel_client BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    media_count SMALLINT NOT NULL DEFAULT 0 CHECK (media_count >= 0),
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.disponibilite (
    id SERIAL PRIMARY KEY,
    coiffeur_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    jour_semaine SMALLINT NOT NULL CHECK (jour_semaine BETWEEN 0 AND 6),
    heure_debut TIME NOT NULL,
    heure_fin TIME NOT NULL,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_disponibilite_heures CHECK (heure_fin > heure_debut)
);

CREATE TABLE s_afro_dev.exception_disponibilite (
    id SERIAL PRIMARY KEY,
    coiffeur_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    heure_debut TIME,
    heure_fin TIME,
    raison VARCHAR(255),
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_exception_heures CHECK (
        (heure_debut IS NULL AND heure_fin IS NULL)
        OR (heure_debut IS NOT NULL AND heure_fin IS NOT NULL AND heure_fin > heure_debut)
    )
);

CREATE TABLE s_afro_dev.rendez_vous (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    coiffeur_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    prestation_id INTEGER REFERENCES s_afro_dev.prestation(id) ON DELETE SET NULL,
    date_debut TIMESTAMP NOT NULL,
    date_fin TIMESTAMP NOT NULL,
    statut VARCHAR(20) NOT NULL DEFAULT 'demande'
        CHECK (statut IN ('demande', 'confirme', 'annule', 'termine', 'non_present')),
    prix DECIMAL(8, 2) CHECK (prix IS NULL OR prix >= 0),
    unite_prix VARCHAR(20) NOT NULL DEFAULT 'forfait',
    note_client TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rdv_dates CHECK (date_fin > date_debut),
    CONSTRAINT chk_rdv_pas_soi CHECK (client_id <> coiffeur_id),
    CONSTRAINT excl_rendez_vous_coiffeur_creneau EXCLUDE USING gist (
        coiffeur_id WITH =,
        tsrange(date_debut, date_fin, '[)') WITH &&
    ) WHERE (statut IN ('demande', 'confirme'))
);

CREATE TABLE s_afro_dev.avis (
    id SERIAL PRIMARY KEY,
    rendez_vous_id INTEGER NOT NULL UNIQUE REFERENCES s_afro_dev.rendez_vous(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    coiffeur_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    note SMALLINT NOT NULL CHECK (note BETWEEN 1 AND 5),
    commentaire TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_avis_pas_soi CHECK (client_id <> coiffeur_id)
);

CREATE TABLE s_afro_dev.publication (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    legende VARCHAR(500),
    media_count SMALLINT NOT NULL DEFAULT 0 CHECK (media_count >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.cauris (
    user_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    publication_id INTEGER NOT NULL REFERENCES s_afro_dev.publication(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, publication_id)
);

CREATE TABLE s_afro_dev.refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    device_info VARCHAR(255),
    ip_address INET
);

CREATE INDEX idx_utilisateur_role ON s_afro_dev.utilisateur(role, statut);
CREATE INDEX idx_prestation_coiffeur ON s_afro_dev.prestation(coiffeur_id) WHERE actif = TRUE;
CREATE INDEX idx_disponibilite_coiffeur ON s_afro_dev.disponibilite(coiffeur_id, jour_semaine) WHERE actif = TRUE;
CREATE INDEX idx_exception_coiffeur ON s_afro_dev.exception_disponibilite(coiffeur_id, date) WHERE actif = TRUE;
CREATE INDEX idx_rdv_client ON s_afro_dev.rendez_vous(client_id, date_debut DESC);
CREATE INDEX idx_rdv_coiffeur ON s_afro_dev.rendez_vous(coiffeur_id, date_debut DESC);
CREATE INDEX idx_avis_coiffeur ON s_afro_dev.avis(coiffeur_id, created_at DESC);
CREATE INDEX idx_publication_user ON s_afro_dev.publication(user_id, created_at DESC);
CREATE INDEX idx_cauris_publication ON s_afro_dev.cauris(publication_id);
CREATE INDEX idx_refresh_tokens_token ON s_afro_dev.refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user_id ON s_afro_dev.refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON s_afro_dev.refresh_tokens(expires_at);

CREATE OR REPLACE FUNCTION s_afro_dev.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION s_afro_dev.create_default_profiles()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO s_afro_dev.visibilite_utilisateur (utilisateur_id) VALUES (NEW.id);
    INSERT INTO s_afro_dev.profil_utilisateur (user_id) VALUES (NEW.id);
    IF NEW.role = 'coiffeur' THEN
        INSERT INTO s_afro_dev.profil_coiffeur (user_id) VALUES (NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION s_afro_dev.maj_note_coiffeur()
RETURNS TRIGGER AS $$
DECLARE
    cible INTEGER;
BEGIN
    cible := COALESCE(NEW.coiffeur_id, OLD.coiffeur_id);
    UPDATE s_afro_dev.profil_coiffeur
    SET note_moyenne = COALESCE((SELECT ROUND(AVG(note)::numeric, 2) FROM s_afro_dev.avis WHERE coiffeur_id = cible), 0),
        nb_avis = (SELECT COUNT(*) FROM s_afro_dev.avis WHERE coiffeur_id = cible)
    WHERE user_id = cible;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION s_afro_dev.valider_creneau_rendez_vous()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.date_debut::date <> NEW.date_fin::date THEN
        RAISE EXCEPTION 'Un rendez-vous doit commencer et finir le même jour' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM s_afro_dev.disponibilite d
        WHERE d.coiffeur_id = NEW.coiffeur_id
          AND d.actif = TRUE
          AND d.jour_semaine = EXTRACT(DOW FROM NEW.date_debut)::smallint
          AND d.heure_debut <= NEW.date_debut::time
          AND d.heure_fin >= NEW.date_fin::time
    ) THEN
        RAISE EXCEPTION 'Le créneau est hors disponibilité' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM s_afro_dev.exception_disponibilite e
        WHERE e.coiffeur_id = NEW.coiffeur_id
          AND e.date = NEW.date_debut::date
          AND e.actif = TRUE
          AND (e.heure_debut IS NULL OR (e.heure_debut < NEW.date_fin::time AND e.heure_fin > NEW.date_debut::time))
    ) THEN
        RAISE EXCEPTION 'Le créneau est bloqué par une exception' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_utilisateur_updated_at BEFORE UPDATE ON s_afro_dev.utilisateur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_profil_utilisateur_updated_at BEFORE UPDATE ON s_afro_dev.profil_utilisateur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_profil_coiffeur_updated_at BEFORE UPDATE ON s_afro_dev.profil_coiffeur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_rendez_vous_updated_at BEFORE UPDATE ON s_afro_dev.rendez_vous
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_create_default_profiles AFTER INSERT ON s_afro_dev.utilisateur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.create_default_profiles();
CREATE TRIGGER trg_maj_note_coiffeur AFTER INSERT OR UPDATE OR DELETE ON s_afro_dev.avis
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.maj_note_coiffeur();
CREATE TRIGGER trg_valider_creneau_rendez_vous BEFORE INSERT OR UPDATE OF coiffeur_id, date_debut, date_fin
ON s_afro_dev.rendez_vous FOR EACH ROW EXECUTE FUNCTION s_afro_dev.valider_creneau_rendez_vous();

COMMIT;
