-- ==============================
-- TABLE ABONNEMENT
-- ==============================
-- suiveur_id : l'utilisateur qui suit
-- suivi_id   : l'utilisateur qui est suivi
-- La clé primaire composite empêche les doublons.

CREATE TABLE s_afro_dev.abonnement (
    suiveur_id  INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    suivi_id    INTEGER     NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (suiveur_id, suivi_id),
    CONSTRAINT no_self_follow CHECK (suiveur_id <> suivi_id)
);

-- Index pour la lecture côté "qui est-ce que je suis ?" (connexion Socket)
CREATE INDEX idx_abonnement_suiveur ON s_afro_dev.abonnement(suiveur_id);

-- Index pour la lecture côté "qui me suit ?" (stats, route profil)
CREATE INDEX idx_abonnement_suivi ON s_afro_dev.abonnement(suivi_id);


-- ==============================
-- REQUÊTES DE RÉFÉRENCE
-- ==============================

-- getRelation(userA_id, userB_id) → type de relation
-- Utilisée par peutVoir() pour déterminer le niveau d'accès.
-- Retourne :
--   'aucune'  : aucun lien
--   'je_suis' : userA suit userB mais pas l'inverse
--   'me_suit' : userB suit userA mais pas l'inverse
--   'mutuel'  : les deux se suivent (Tribu)

SELECT
    CASE
        WHEN a_vers_b.suiveur_id IS NOT NULL AND b_vers_a.suiveur_id IS NOT NULL THEN 'mutuel'
        WHEN a_vers_b.suiveur_id IS NOT NULL                                     THEN 'je_suis'
        WHEN b_vers_a.suiveur_id IS NOT NULL                                     THEN 'me_suit'
        ELSE                                                                          'aucune'
    END AS relation
FROM (SELECT NULL) AS base
LEFT JOIN s_afro_dev.abonnement a_vers_b
       ON a_vers_b.suiveur_id = $1 AND a_vers_b.suivi_id = $2
LEFT JOIN s_afro_dev.abonnement b_vers_a
       ON b_vers_a.suiveur_id = $2 AND b_vers_a.suivi_id = $1;


-- Compter abonnements / abonnés d'un user (pour le profil public)
SELECT
    (SELECT COUNT(*) FROM s_afro_dev.abonnement WHERE suiveur_id = $1) AS abonnements,
    (SELECT COUNT(*) FROM s_afro_dev.abonnement WHERE suivi_id   = $1) AS abonnes;
