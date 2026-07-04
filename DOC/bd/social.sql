-- ==============================
-- SOCIAL — publication + cauris + accomplissement
-- ==============================
-- publication : posts d'un profil. media_count = nombre de fichiers
-- {pub_<id>_<i>.webp} (carousel si > 1). Pas d'URL stockée.
-- cauris      : "likes" d'une publication (PK composite user+publication).
-- accomplissement / utilisateur_accomplissement : gamification.
--
-- IDs en INTEGER (cohérent avec utilisateur.id SERIAL).
-- ==============================

-- ------------------------------
-- TABLE PUBLICATION
-- ------------------------------
CREATE TABLE s_afro_dev.publication (
    id          SERIAL      PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    legende     VARCHAR(500),
    media_count SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Feed d'un profil (tri chronologique inverse)
CREATE INDEX idx_publication_user ON s_afro_dev.publication(user_id, created_at DESC);

-- ------------------------------
-- TABLE CAURIS (likes)
-- ------------------------------
CREATE TABLE s_afro_dev.cauris (
    user_id        INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    publication_id INTEGER     NOT NULL REFERENCES s_afro_dev.publication(id) ON DELETE CASCADE,
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, publication_id)
);

-- Comptage rapide des cauris d'une publication
CREATE INDEX idx_cauris_publication ON s_afro_dev.cauris(publication_id);

-- ------------------------------
-- TABLE ACCOMPLISSEMENT (catalogue de badges)
-- ------------------------------
CREATE TABLE s_afro_dev.accomplissement (
    id        SERIAL        PRIMARY KEY,
    code      VARCHAR(60)   NOT NULL UNIQUE,
    nom       VARCHAR(120)  NOT NULL,
    icone     VARCHAR(255),
    condition JSONB
);

-- ------------------------------
-- TABLE UTILISATEUR_ACCOMPLISSEMENT (M-N : badges débloqués)
-- ------------------------------
CREATE TABLE s_afro_dev.utilisateur_accomplissement (
    user_id            INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    accomplissement_id INTEGER     NOT NULL REFERENCES s_afro_dev.accomplissement(id) ON DELETE CASCADE,
    obtenu_le          TIMESTAMP   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, accomplissement_id)
);
