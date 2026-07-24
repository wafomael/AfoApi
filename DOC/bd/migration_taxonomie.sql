BEGIN;

CREATE TABLE IF NOT EXISTS s_afro_dev.categorie (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(80) NOT NULL UNIQUE,
    icone VARCHAR(80),
    ordre SMALLINT NOT NULL DEFAULT 0,
    actif BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS s_afro_dev.sous_type (
    id SERIAL PRIMARY KEY,
    categorie_id INTEGER NOT NULL REFERENCES s_afro_dev.categorie(id) ON DELETE CASCADE,
    nom VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    ordre SMALLINT NOT NULL DEFAULT 0,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (categorie_id, nom),
    UNIQUE (categorie_id, slug)
);

CREATE TABLE IF NOT EXISTS s_afro_dev.tag (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(80) NOT NULL UNIQUE,
    slug VARCHAR(80) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('public', 'usage', 'mode', 'longueur')),
    actif BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE s_afro_dev.prestation ADD COLUMN IF NOT EXISTS categorie_id INTEGER REFERENCES s_afro_dev.categorie(id) ON DELETE SET NULL;
ALTER TABLE s_afro_dev.prestation ADD COLUMN IF NOT EXISTS sous_type_id INTEGER REFERENCES s_afro_dev.sous_type(id) ON DELETE SET NULL;
ALTER TABLE s_afro_dev.publication ADD COLUMN IF NOT EXISTS categorie_id INTEGER REFERENCES s_afro_dev.categorie(id) ON DELETE SET NULL;
ALTER TABLE s_afro_dev.publication ADD COLUMN IF NOT EXISTS sous_type_id INTEGER REFERENCES s_afro_dev.sous_type(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS s_afro_dev.prestation_tag (
    prestation_id INTEGER NOT NULL REFERENCES s_afro_dev.prestation(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES s_afro_dev.tag(id) ON DELETE CASCADE,
    PRIMARY KEY (prestation_id, tag_id)
);

CREATE TABLE IF NOT EXISTS s_afro_dev.publication_tag (
    publication_id INTEGER NOT NULL REFERENCES s_afro_dev.publication(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES s_afro_dev.tag(id) ON DELETE CASCADE,
    PRIMARY KEY (publication_id, tag_id)
);

INSERT INTO s_afro_dev.categorie (nom, slug, icone, ordre) VALUES
('Tresses', 'tresses', 'braids', 1), ('Locks', 'locks', 'locks', 2), ('Nattes', 'nattes', 'cornrows', 3),
('Perruques', 'perruques', 'wig', 4), ('Tissages', 'tissages', 'weave', 5), ('Coupes', 'coupes', 'cut', 6),
('Colorations', 'colorations', 'color', 7), ('Soins', 'soins', 'care', 8),
('Coiffures naturelles', 'coiffures-naturelles', 'natural', 9), ('Barbe & Grooming', 'barbe-grooming', 'beard', 10)
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, icone = EXCLUDED.icone, ordre = EXCLUDED.ordre;

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
) AS v(categorie_slug, nom, slug, ordre) ON c.slug = v.categorie_slug
ON CONFLICT (categorie_id, slug) DO UPDATE SET nom = EXCLUDED.nom, ordre = EXCLUDED.ordre;

INSERT INTO s_afro_dev.tag (nom, slug, type) VALUES
('Homme','homme','public'), ('Femme','femme','public'), ('Enfant','enfant','public'), ('Autre','autre','public'),
('Protectrice','protectrice','usage'), ('Entretien','entretien','usage'), ('Événement','evenement','usage'), ('Quotidien','quotidien','usage'),
('À domicile','a-domicile','mode'), ('En salon','en-salon','mode'),
('Cheveux courts','cheveux-courts','longueur'), ('Cheveux mi-longs','cheveux-mi-longs','longueur'), ('Cheveux longs','cheveux-longs','longueur')
ON CONFLICT (slug) DO UPDATE SET nom = EXCLUDED.nom, type = EXCLUDED.type;

CREATE INDEX IF NOT EXISTS idx_prestation_taxonomie ON s_afro_dev.prestation(categorie_id, sous_type_id) WHERE actif = TRUE;
CREATE INDEX IF NOT EXISTS idx_prestation_tag_tag ON s_afro_dev.prestation_tag(tag_id, prestation_id);
CREATE INDEX IF NOT EXISTS idx_publication_taxonomie ON s_afro_dev.publication(categorie_id, sous_type_id);
CREATE INDEX IF NOT EXISTS idx_publication_tag_tag ON s_afro_dev.publication_tag(tag_id, publication_id);

UPDATE s_afro_dev.prestation p
SET categorie_id = c.id
FROM s_afro_dev.categorie c
WHERE p.categorie_id IS NULL AND LOWER(TRIM(p.categorie)) = LOWER(c.nom);

COMMIT;
