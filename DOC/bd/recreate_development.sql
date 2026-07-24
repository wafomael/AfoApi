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

CREATE TABLE s_afro_dev.profil_capillaire (
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

CREATE TABLE s_afro_dev.photo_profil_capillaire (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    numero SMALLINT NOT NULL CHECK (numero BETWEEN 0 AND 9),
    date_prise TIMESTAMP NOT NULL,
    date_upload TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, numero)
);

CREATE TABLE s_afro_dev.profil_coiffeur (
    user_id INTEGER PRIMARY KEY REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    nom_salon VARCHAR(150),
    description TEXT,
    adresse TEXT,
    rayon_km SMALLINT CHECK (rayon_km IS NULL OR rayon_km >= 0),
    temps_repos_minutes SMALLINT NOT NULL DEFAULT 0 CHECK (temps_repos_minutes BETWEEN 0 AND 240),
    temps_trajet_minutes SMALLINT NOT NULL DEFAULT 0 CHECK (temps_trajet_minutes BETWEEN 0 AND 240),
    mode_prestation_defaut VARCHAR(20) NOT NULL DEFAULT 'salon' CHECK (mode_prestation_defaut IN ('salon', 'domicile', 'les_deux')),
    note_moyenne DECIMAL(3, 2) NOT NULL DEFAULT 0,
    nb_avis INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.politique_reservation (
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

CREATE TABLE s_afro_dev.categorie (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(80) NOT NULL UNIQUE,
    icone VARCHAR(80),
    ordre SMALLINT NOT NULL DEFAULT 0,
    actif BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE s_afro_dev.sous_type (
    id SERIAL PRIMARY KEY,
    categorie_id INTEGER NOT NULL REFERENCES s_afro_dev.categorie(id) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    ordre SMALLINT NOT NULL DEFAULT 0,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (categorie_id, nom),
    UNIQUE (categorie_id, slug)
);

CREATE TABLE s_afro_dev.tag (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(80) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('public', 'usage', 'mode', 'longueur')),
    actif BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE s_afro_dev.prestation (
    id SERIAL PRIMARY KEY,
    coiffeur_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    nom VARCHAR(150) NOT NULL,
    categorie VARCHAR(80),
    categorie_id INTEGER REFERENCES s_afro_dev.categorie(id) ON DELETE SET NULL,
    sous_type_id INTEGER REFERENCES s_afro_dev.sous_type(id) ON DELETE SET NULL,
    prix DECIMAL(8, 2) CHECK (prix IS NULL OR prix >= 0),
    unite_prix VARCHAR(20) NOT NULL DEFAULT 'forfait',
    duree_min SMALLINT CHECK (duree_min IS NULL OR duree_min > 0),
    materiel_client BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    media_count SMALLINT NOT NULL DEFAULT 0 CHECK (media_count >= 0),
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.prestation_tag (
    prestation_id INTEGER NOT NULL REFERENCES s_afro_dev.prestation(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES s_afro_dev.tag(id) ON DELETE CASCADE,
    PRIMARY KEY (prestation_id, tag_id)
);

CREATE TABLE s_afro_dev.prestation_champ_profil (
    prestation_id INTEGER NOT NULL REFERENCES s_afro_dev.prestation(id) ON DELETE CASCADE,
    champ_profil VARCHAR(40) NOT NULL CHECK (champ_profil IN (
        'longueur', 'densite', 'texture', 'etat_actuel', 'naturel_defrise',
        'traitements_chimiques', 'sensibilite_cuir_chevelu', 'extensions',
        'preferences_allergies', 'photos'
    )),
    PRIMARY KEY (prestation_id, champ_profil)
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
    date_fin_blocage TIMESTAMP NOT NULL,
    statut VARCHAR(20) NOT NULL DEFAULT 'demande'
        CHECK (statut IN ('demande', 'confirme', 'en_cours', 'termine', 'annule', 'refuse', 'non_present')),
    mode_prestation VARCHAR(20) NOT NULL DEFAULT 'salon' CHECK (mode_prestation IN ('salon', 'domicile')),
    temps_repos_minutes SMALLINT NOT NULL DEFAULT 0,
    temps_trajet_minutes SMALLINT NOT NULL DEFAULT 0,
    retard_minutes SMALLINT NOT NULL DEFAULT 0,
    decalage_minutes SMALLINT NOT NULL DEFAULT 0,
    nb_reports SMALLINT NOT NULL DEFAULT 0,
    prix DECIMAL(8, 2) CHECK (prix IS NULL OR prix >= 0),
    unite_prix VARCHAR(20) NOT NULL DEFAULT 'forfait',
    note_client TEXT,
    champs_profil_partages TEXT[] NOT NULL DEFAULT '{}',
    acompte_paye BOOLEAN NOT NULL DEFAULT FALSE,
    montant_acompte NUMERIC(8, 2) NOT NULL DEFAULT 0,
    statut_acompte VARCHAR(30) NOT NULL DEFAULT 'non_requis'
        CHECK (statut_acompte IN ('non_requis', 'paye', 'remboursement_prevu', 'rembourse', 'non_remboursable')),
    politique_acceptee_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rdv_dates CHECK (date_fin > date_debut AND date_fin_blocage >= date_fin),
    CONSTRAINT chk_rdv_buffers CHECK (temps_repos_minutes BETWEEN 0 AND 240 AND temps_trajet_minutes BETWEEN 0 AND 240),
    CONSTRAINT chk_rdv_retard CHECK (retard_minutes BETWEEN 0 AND 180 AND decalage_minutes >= 0),
    CONSTRAINT chk_rdv_reports CHECK (nb_reports BETWEEN 0 AND 10),
    CONSTRAINT chk_rdv_pas_soi CHECK (client_id <> coiffeur_id),
    CONSTRAINT chk_rdv_champs_profil_partages CHECK (champs_profil_partages <@ ARRAY[
        'longueur', 'densite', 'texture', 'etat_actuel', 'naturel_defrise',
        'traitements_chimiques', 'sensibilite_cuir_chevelu', 'extensions',
        'preferences_allergies', 'photos'
    ]::TEXT[]),
    CONSTRAINT excl_rendez_vous_coiffeur_creneau EXCLUDE USING gist (
        coiffeur_id WITH =,
        tsrange(date_debut, date_fin_blocage, '[)') WITH &&
    ) WHERE (statut IN ('demande', 'confirme', 'en_cours')) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE TABLE s_afro_dev.historique_rendez_vous (
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

CREATE TABLE s_afro_dev.consentement_profil (
    rendez_vous_id INTEGER NOT NULL REFERENCES s_afro_dev.rendez_vous(id) ON DELETE CASCADE,
    champ_profil VARCHAR(40) NOT NULL CHECK (champ_profil IN (
        'longueur', 'densite', 'texture', 'etat_actuel', 'naturel_defrise',
        'traitements_chimiques', 'sensibilite_cuir_chevelu', 'extensions',
        'preferences_allergies', 'photos'
    )),
    consented_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (rendez_vous_id, champ_profil)
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
    categorie_id INTEGER REFERENCES s_afro_dev.categorie(id) ON DELETE SET NULL,
    sous_type_id INTEGER REFERENCES s_afro_dev.sous_type(id) ON DELETE SET NULL,
    media_count SMALLINT NOT NULL DEFAULT 0 CHECK (media_count >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE s_afro_dev.publication_tag (
    publication_id INTEGER NOT NULL REFERENCES s_afro_dev.publication(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES s_afro_dev.tag(id) ON DELETE CASCADE,
    PRIMARY KEY (publication_id, tag_id)
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

INSERT INTO s_afro_dev.categorie (nom, slug, icone, ordre) VALUES
('Tresses', 'tresses', 'braids', 1), ('Locks', 'locks', 'locks', 2),
('Nattes', 'nattes', 'cornrows', 3), ('Perruques', 'perruques', 'wig', 4),
('Tissages', 'tissages', 'weave', 5), ('Coupes', 'coupes', 'cut', 6),
('Colorations', 'colorations', 'color', 7), ('Soins', 'soins', 'care', 8),
('Coiffures naturelles', 'coiffures-naturelles', 'natural', 9),
('Barbe & Grooming', 'barbe-grooming', 'beard', 10);

INSERT INTO s_afro_dev.sous_type (categorie_id, nom, slug, ordre)
SELECT c.id, v.nom, v.slug, v.ordre FROM s_afro_dev.categorie c JOIN (VALUES
('tresses','Box braids','box-braids',1), ('tresses','Cornrows','cornrows',2), ('tresses','Tresses collées','tresses-collees',3), ('tresses','Fulani','fulani',4), ('tresses','Tresses avec extensions','tresses-extensions',5),
('locks','Starter locks','starter-locks',1), ('locks','Entretien locks','entretien-locks',2), ('locks','Sisterlocks','sisterlocks',3), ('locks','Faux locks','faux-locks',4),
('nattes','Nattes collées','nattes-collees',1), ('nattes','Nattes libres','nattes-libres',2), ('nattes','Nattes avec mèches','nattes-meches',3),
('perruques','Lace front','lace-front',1), ('perruques','Full lace','full-lace',2), ('perruques','Synthétique','synthetique',3), ('perruques','Cheveux naturels','cheveux-naturels',4),
('tissages','Cousu','cousu',1), ('tissages','Colle','colle',2), ('tissages','Clip-in','clip-in',3),
('coupes','Coupe courte','coupe-courte',1), ('coupes','Dégradé','degrade',2), ('coupes','Coupe enfant','coupe-enfant',3), ('coupes','Coupe homme','coupe-homme',4),
('colorations','Balayage','balayage',1), ('colorations','Coloration complète','coloration-complete',2), ('colorations','Mèches','meches',3), ('colorations','Décoloration','decoloration',4),
('soins','Hydratation','hydratation',1), ('soins','Protéiné','proteine',2), ('soins','Défrisage','defrisage',3), ('soins','Soin cuir chevelu','soin-cuir-chevelu',4),
('coiffures-naturelles','Twist-out','twist-out',1), ('coiffures-naturelles','Wash and go','wash-and-go',2), ('coiffures-naturelles','Bantu knots','bantu-knots',3), ('coiffures-naturelles','Afro styling','afro-styling',4),
('barbe-grooming','Taille de barbe','taille-barbe',1), ('barbe-grooming','Dégradé barbe','degrade-barbe',2), ('barbe-grooming','Rasage','rasage',3)
) AS v(categorie_slug, nom, slug, ordre) ON c.slug = v.categorie_slug;

INSERT INTO s_afro_dev.tag (nom, slug, type) VALUES
('Homme','homme','public'), ('Femme','femme','public'), ('Enfant','enfant','public'), ('Autre','autre','public'),
('Protectrice','protectrice','usage'), ('Entretien','entretien','usage'), ('Événement','evenement','usage'), ('Quotidien','quotidien','usage'),
('À domicile','a-domicile','mode'), ('En salon','en-salon','mode'),
('Cheveux courts','cheveux-courts','longueur'), ('Cheveux mi-longs','cheveux-mi-longs','longueur'), ('Cheveux longs','cheveux-longs','longueur');

CREATE INDEX idx_utilisateur_role ON s_afro_dev.utilisateur(role, statut);
CREATE INDEX idx_prestation_coiffeur ON s_afro_dev.prestation(coiffeur_id) WHERE actif = TRUE;
CREATE INDEX idx_prestation_taxonomie ON s_afro_dev.prestation(categorie_id, sous_type_id) WHERE actif = TRUE;
CREATE INDEX idx_prestation_tag_tag ON s_afro_dev.prestation_tag(tag_id, prestation_id);
CREATE INDEX idx_prestation_champ_profil_champ ON s_afro_dev.prestation_champ_profil(champ_profil, prestation_id);
CREATE INDEX idx_photo_profil_capillaire_user ON s_afro_dev.photo_profil_capillaire(user_id, numero);
CREATE INDEX idx_publication_taxonomie ON s_afro_dev.publication(categorie_id, sous_type_id);
CREATE INDEX idx_publication_tag_tag ON s_afro_dev.publication_tag(tag_id, publication_id);
CREATE INDEX idx_disponibilite_coiffeur ON s_afro_dev.disponibilite(coiffeur_id, jour_semaine) WHERE actif = TRUE;
CREATE UNIQUE INDEX uq_disponibilite_exacte ON s_afro_dev.disponibilite(coiffeur_id, jour_semaine, heure_debut, heure_fin);
CREATE UNIQUE INDEX uq_exception_disponibilite_exacte ON s_afro_dev.exception_disponibilite(
    coiffeur_id, date, COALESCE(heure_debut, TIME '00:00'), COALESCE(heure_fin, TIME '00:00')
);
CREATE INDEX idx_exception_coiffeur ON s_afro_dev.exception_disponibilite(coiffeur_id, date) WHERE actif = TRUE;
CREATE INDEX idx_rdv_client ON s_afro_dev.rendez_vous(client_id, date_debut DESC);
CREATE INDEX idx_rdv_coiffeur ON s_afro_dev.rendez_vous(coiffeur_id, date_debut DESC);
CREATE INDEX idx_rdv_decalages ON s_afro_dev.rendez_vous(client_id, date_debut) WHERE decalage_minutes > 0 AND statut IN ('demande', 'confirme');
CREATE INDEX idx_historique_rdv ON s_afro_dev.historique_rendez_vous(rendez_vous_id, date_action DESC);
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

CREATE TRIGGER trg_utilisateur_updated_at BEFORE UPDATE ON s_afro_dev.utilisateur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_profil_utilisateur_updated_at BEFORE UPDATE ON s_afro_dev.profil_utilisateur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_profil_coiffeur_updated_at BEFORE UPDATE ON s_afro_dev.profil_coiffeur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_profil_capillaire_updated_at BEFORE UPDATE ON s_afro_dev.profil_capillaire
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_politique_reservation_updated_at BEFORE UPDATE ON s_afro_dev.politique_reservation
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_rendez_vous_updated_at BEFORE UPDATE ON s_afro_dev.rendez_vous
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.touch_updated_at();
CREATE TRIGGER trg_create_default_profiles AFTER INSERT ON s_afro_dev.utilisateur
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.create_default_profiles();
CREATE TRIGGER trg_maj_note_coiffeur AFTER INSERT OR UPDATE OR DELETE ON s_afro_dev.avis
FOR EACH ROW EXECUTE FUNCTION s_afro_dev.maj_note_coiffeur();
CREATE TRIGGER trg_valider_creneau_rendez_vous BEFORE INSERT OR UPDATE OF coiffeur_id, date_debut, date_fin, date_fin_blocage
ON s_afro_dev.rendez_vous FOR EACH ROW EXECUTE FUNCTION s_afro_dev.valider_creneau_rendez_vous();

COMMIT;
