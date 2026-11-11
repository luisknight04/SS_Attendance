// ===================================================================
// SCRIPT DE MIGRACIÓN: AGREGAR COLUMNA TIPO_REGISTRO A POSTGRESQL
// ===================================================================

const db = require('./db');
require('dotenv').config();

async function migrarTablaAsistencias() {
    console.log("Conectando a la base de datos en Render para actualizar la tabla 'asistencias'...");

    try {
        // 1. Agregar la columna tipo_registro si no existe
        const alterQuery = `
            ALTER TABLE asistencias 
            ADD COLUMN IF NOT EXISTS tipo_registro VARCHAR(10) NOT NULL DEFAULT 'ENTRADA';
        `;
        await db.query(alterQuery);
        console.log("✓ Columna 'tipo_registro' añadida o verificada exitosamente.");

        // 2. Asegurar la restricción para aceptar solo ENTRADA o SALIDA
        const constraintQuery = `
            DO $$ 
            BEGIN 
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tipo_registro'
                ) THEN 
                    ALTER TABLE asistencias 
                    ADD CONSTRAINT chk_tipo_registro CHECK (tipo_registro IN ('ENTRADA', 'SALIDA'));
                END IF;
            END $$;
        `;
        await db.query(constraintQuery);
        console.log("✓ Restricción CHECK (ENTRADA, SALIDA) aplicada correctamente.");

        // 3. Crear la tabla de tokens QR gastados si no existe
        const qrTableQuery = `
            CREATE TABLE IF NOT EXISTS qr_tokens_usados (
                id SERIAL PRIMARY KEY,
                token VARCHAR(255) UNIQUE NOT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(qrTableQuery);
        console.log("✓ Tabla 'qr_tokens_usados' verificada correctamente.");

        console.log("\n==================================================");
        console.log("¡MIGRACIÓN COMPLETADA CON ÉXITO!");
        console.log("==================================================");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error al migrar la base de datos:", error.message);
        process.exit(1);
    }
}

migrarTablaAsistencias();