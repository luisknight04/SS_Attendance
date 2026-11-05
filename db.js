// ===================================================================
// CONEXIÓN A POSTGRESQL (db.js)
// Soporta conexiones locales y remotas (Render) con SSL obligatorio
// ===================================================================

const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

// Detectar si estamos conectándonos a una base de datos remota (como Render)
const esConexionRemota = connectionString && connectionString.includes('render.com');

const pool = new Pool({
    connectionString: connectionString,
    // Render requiere obligatoriamente SSL para conexiones remotas
    ssl: esConexionRemota ? { rejectUnauthorized: false } : false,
    // Aumentar tiempos de espera para evitar cortes repentinos (ECONNRESET)
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
});

pool.on('connect', () => {
    console.log('Conexión establecida con la base de datos PostgreSQL.');
});

pool.on('error', (err) => {
    console.error('Error inesperado en el cliente de PostgreSQL:', err.message);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
