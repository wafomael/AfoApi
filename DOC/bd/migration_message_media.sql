-- ==============================
-- MIGRATION : message.media_url (VARCHAR) → message.media (BOOLEAN)
-- ==============================
-- On ne stocke plus l'URL du média. Le fichier est nommé
-- {conversation_id}_{message_id}.webp et l'URL est reconstruite à la volée
-- (même logique que les photos de profil).
--
-- À exécuter une seule fois sur une base où la table message existe déjà.
-- ==============================

ALTER TABLE s_afro_dev.message DROP CONSTRAINT IF EXISTS chk_message_non_vide;
ALTER TABLE s_afro_dev.message DROP COLUMN IF EXISTS media_url;
ALTER TABLE s_afro_dev.message ADD COLUMN IF NOT EXISTS media BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE s_afro_dev.message
    ADD CONSTRAINT chk_message_non_vide CHECK (contenu IS NOT NULL OR media = TRUE);
