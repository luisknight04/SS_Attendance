// ===================================================================
// SCRIPT DE EJECUCIÓN DE SCHEMA SQL VÍA NODE.JS
// Propósito: Crear las tablas en PostgreSQL sin depender del comando psql
// ===================================================================

const fs = require('fs');
const path = require('path');
const db = require('./db');
require('dotenv').config();

async function ejecutarSchema() {
    try {
        console.log("Leyendo el archivo schema.sql...");
        
        // 1. Ubicar el archivo schema.sql en la raíz del proyecto
        const rutaSchema = path.join(__dirname, 'schema.sql');
        const sqlQuery = fs.readFileSync(rutaSchema, 'utf8');

        console.log("Conectando a la base de datos en Render y creando la estructura de tablas...");

        // 2. Ejecutar la consulta SQL completa en PostgreSQL
        await db.query(sqlQuery);

        console.log("¡Estructura de tablas (schema.sql) creada exitosamente!");
        process.exit(0);

    } catch (error) {
        console.error("Error al ejecutar schema.sql en la base de datos:", error.message);
        process.exit(1);
    }
}

ejecutarSchema();