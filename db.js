// db.js - Conexión flexible para Render y servidor local
const { Pool } = require('pg');
require('dotenv').config();

// Determinar si el entorno requiere SSL (Render lo requiere en producción)
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
    console.log('Base de datos PostgreSQL conectada correctamente.');
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};