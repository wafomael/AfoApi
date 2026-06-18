import './config/env.js';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.refresh.js';
import adminUserRoutes from './routes/admin/users.routes.js';

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

// Routes
app.use('/auth', authRoutes);
app.use('/admin/users', adminUserRoutes);

// Route de test
app.get('/', (req, res) => {
    res.json({
        message: 'API Afro - OK',
        version: '1.0.0',
        endpoints: {
            auth: '/auth',
            admin: '/admin/users'
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
});
