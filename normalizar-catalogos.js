// ===================================================================
// SCRIPT DE MIGRACIÓN Y SEMBRADO DE CATÁLOGOS (normalizar-catalogos.js)
// ===================================================================

const db = require('./db');
require('dotenv').config();

async function normalizarBaseDeDatos() {
    console.log("Iniciando creación y sembrado de catálogos en PostgreSQL...");

    try {
        // 1. Crear tablas catálogo si no existen
        await db.query(`
            CREATE TABLE IF NOT EXISTS catalogo_carreras (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS catalogo_periodos (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) UNIQUE NOT NULL
            );
            CREATE TABLE IF NOT EXISTS catalogo_semestre (
                id SERIAL PRIMARY KEY,
                numero INT UNIQUE NOT NULL
            );
        `);
        console.log("✓ Tablas catálogo verificadas.");

        // 2. Insertar valores base
        await db.query(`
            INSERT INTO catalogo_carreras (nombre) VALUES 
            ('Ingeniería en Tecnologías de la Información y Comunicaciones'),
            ('Ingeniería Industrial'),
            ('Licenciatura en Administración'),
            ('Ingeniería Eléctrica'),
            ('Ingeniería en Gestión Empresarial'),
            ('Ingeniería Mecánica'),
            ('Ingeniería Electrónica'),
            ('Ingeniería en Logística')
            ON CONFLICT DO NOTHING;
            
            INSERT INTO catalogo_periodos (nombre) VALUES 
            ('Agosto - Diciembre 2026'),
            ('Enero - Junio 2027'),
            ('Agosto - Diciembre 2027'),
            ('Enero - Junio 2028'),
            ('Agosto - Diciembre 2028')
            ON CONFLICT DO NOTHING;

            INSERT INTO catalogo_semestre (numero) VALUES 
            (1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11), (12)
            ON CONFLICT DO NOTHING;
        `);
        console.log("✓ Catálogos sembrados exitosamente.");

        // 3. Actualizar la tabla usuarios con las llaves foráneas
        await db.query(`
            ALTER TABLE usuarios DROP COLUMN IF EXISTS carrera;
            ALTER TABLE usuarios DROP COLUMN IF EXISTS periodo_servicio;
            ALTER TABLE usuarios DROP COLUMN IF EXISTS semestre_numero;
            
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS carrera_id INT REFERENCES catalogo_carreras(id) ON DELETE SET NULL;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS periodo_id INT REFERENCES catalogo_periodos(id) ON DELETE SET NULL;
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS semestre_id INT REFERENCES catalogo_semestre(id) ON DELETE SET NULL;
        `);
        console.log("✓ Tabla 'usuarios' vinculada con los catálogos mediante llaves foráneas.");

        console.log("==================================================");
        console.log("¡MIGRACIÓN COMPLETADA CON ÉXITO!");
        console.log("==================================================");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error durante la migración:", error.message);
        process.exit(1);
    }
}

normalizarBaseDeDatos();