-- ============================================================
-- TABLE POUR LES REFRESH TOKENS
-- Stocke les tokens de rafraîchissement pour la connexion auto
-- ============================================================

CREATE TABLE IF NOT EXISTS s_afro_dev.refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES s_afro_dev.utilisateur(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,  -- Si on veut pouvoir révoquer un token
    device_info VARCHAR(255),  -- Optionnel: info sur l'appareil (user-agent, etc.)
    ip_address INET  -- Optionnel: adresse IP
);

-- Index pour accélérer la recherche par token
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON s_afro_dev.refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON s_afro_dev.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON s_afro_dev.refresh_tokens(expires_at);

-- Nettoyage automatique des tokens expirés (optionnel, peut aussi être fait par cron)
-- DELETE FROM refresh_tokens WHERE expires_at < NOW();
