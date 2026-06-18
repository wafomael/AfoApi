import '../config/env.js';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    schema: process.env.DB_SCHEMA,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    console.log('Connecté à PostgreSQL');
});

pool.on('error', (err) => {
    console.error('Erreur inattendue du pool PostgreSQL:', err);
});

const query = (text, params) => {
    return pool.query(text, params);
};

export { pool, query };
