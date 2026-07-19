import './config/env.js';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.refresh.js';
import adminUserRoutes from './routes/admin/users.routes.js';
import userRoutes from './routes/users.routes.js';
import coiffeurRoutes from './routes/coiffeurs.routes.js';
import publicationRoutes from './routes/publications.routes.js';
import rendezVousRoutes from './routes/rendezVous.routes.js';
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
            rendezVous: '/rendez-vous'
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

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    ensureUploadDirs();
});