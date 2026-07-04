-- ==============================
-- MESSAGERIE — conversation + message
-- ==============================
-- Modèle : 1 conversation = 1 paire d'utilisateurs (participant_a < participant_b
-- pour garantir l'unicité). Le destinataire d'un message se déduit : si
-- emetteur_id = participant_a alors destinataire = participant_b, et inversement.
--
-- IDs en INTEGER (cohérent avec utilisateur.id SERIAL).
-- ==============================

-- ------------------------------
-- TABLE CONVERSATION
-- ------------------------------
-- dernier_message_id : preview dans la liste (évite un MAX(created_at) à chaque
-- affichage). La FK est ajoutée APRÈS la table message (dépendance circulaire).
CREATE TABLE s_afro_dev.conversation (
    id                  SERIAL      PRIMARY KEY,
    participant_a       INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    participant_b       INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    dernier_message_id  INTEGER,    -- FK ajoutée plus bas
    created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_conversation UNIQUE (participant_a, participant_b),
    CONSTRAINT chk_ordre_participants CHECK (participant_a < participant_b)
);

-- Lecture "mes conversations" (participant d'un côté ou de l'autre)
CREATE INDEX idx_conversation_participant_a ON s_afro_dev.conversation(participant_a);
CREATE INDEX idx_conversation_participant_b ON s_afro_dev.conversation(participant_b);

-- ------------------------------
-- TABLE MESSAGE
-- ------------------------------
CREATE TABLE s_afro_dev.message (
    id              SERIAL      PRIMARY KEY,
    conversation_id INTEGER     NOT NULL REFERENCES s_afro_dev.conversation(id) ON DELETE CASCADE,
    emetteur_id     INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    contenu         TEXT,
    -- media : true = un fichier image existe, nommé {conversation_id}_{id}.webp
    -- (même logique que les photos de profil : on ne stocke PAS l'URL, on la
    -- reconstruit depuis les ids → pas d'URL obsolète, fichier renommable).
    media           BOOLEAN     NOT NULL DEFAULT FALSE,
    lu              BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    -- Un message a au moins du texte OU un média
    CONSTRAINT chk_message_non_vide CHECK (contenu IS NOT NULL OR media = TRUE)
);

-- Historique paginé d'une conversation (tri chronologique inverse)
CREATE INDEX idx_message_conversation ON s_afro_dev.message(conversation_id, created_at DESC);
-- Comptage rapide des non-lus
CREATE INDEX idx_message_non_lus ON s_afro_dev.message(conversation_id) WHERE lu = FALSE;

-- ------------------------------
-- FK circulaire : conversation.dernier_message_id → message.id
-- ------------------------------
ALTER TABLE s_afro_dev.conversation
    ADD CONSTRAINT fk_dernier_message
    FOREIGN KEY (dernier_message_id)
    REFERENCES s_afro_dev.message(id)
    ON DELETE SET NULL;

-- ------------------------------
-- TRIGGER : à chaque nouveau message, mettre à jour la conversation
-- (updated_at = tri de la liste, dernier_message_id = preview)
-- ------------------------------
CREATE OR REPLACE FUNCTION s_afro_dev.maj_conversation_apres_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE s_afro_dev.conversation
       SET dernier_message_id = NEW.id,
           updated_at         = NEW.created_at
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maj_conversation
    AFTER INSERT ON s_afro_dev.message
    FOR EACH ROW EXECUTE FUNCTION s_afro_dev.maj_conversation_apres_message();
