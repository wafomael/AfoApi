import './config/env.js';
import express from 'express';
import http from 'http';
import cors from 'cors';
import authRoutes from './routes/auth.routes.refresh.js';
import adminUserRoutes from './routes/admin/users.routes.js';
import userRoutes from './routes/users.routes.js';
import coiffeurRoutes from './routes/coiffeurs.routes.js';
import publicationRoutes from './routes/publications.routes.js';
import rendezVousRoutes from './routes/rendezVous.routes.js';
import conversationRoutes from './routes/conversations.routes.js';
import { initSocket } from './socket/index.js';
import { setAllUsersOffline } from './dataBase/utils/user.js';
import { httpLogger } from './middleware/logger.js';
import { ensureUploadDirs } from './config/upload.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS - credentials: true pour Flutter/web
app.use(cors({
    origin: ['*'],  // Autorise Flutter (pas de origin fixe)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(httpLogger);

// Routes
// (Les photos de profil sont servies par GET /users/:username/photo)
app.use('/auth', authRoutes);
app.use('/admin/users', adminUserRoutes);
app.use('/users', userRoutes);
app.use('/coiffeurs', coiffeurRoutes);
app.use('/publications', publicationRoutes);
app.use('/rendez-vous', rendezVousRoutes);
app.use('/conversations', conversationRoutes);

// Route de test
app.get('/', (req, res) => {
    res.json({
        message: 'API Afro - OK',
        version: '1.0.0',
        endpoints: {
            auth: '/auth',
            admin: '/admin/users',
            users: '/users',
            coiffeurs: '/coiffeurs',
            publications: '/publications',
            rendezVous: '/rendez-vous',
            conversations: '/conversations'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route non trouvée',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Erreur:', err);
    res.status(500).json({
        success: false,
        message: 'Erreur interne du serveur',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Serveur HTTP explicite : Express (REST) + Socket.IO partagent le même port
const server = http.createServer(app);

// Brancher Socket.IO sur le même serveur HTTP
const io = initSocket(server);
// Rendre l'instance io accessible aux routes REST (ex: broadcast d'un média)
app.set('io', io);

server.listen(PORT, async () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`Socket.IO actif sur le même port (${PORT})`);

    // Créer les dossiers d'upload s'ils n'existent pas
    ensureUploadDirs();

    // Repartir d'un état propre : aucun user online au démarrage
    try {
        await setAllUsersOffline();
        console.log('[presence] statuts réinitialisés (tous offline)');
    } catch (error) {
        console.error('[presence] échec du reset au démarrage:', error.message);
    }
});
