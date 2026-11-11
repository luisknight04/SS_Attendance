// ===================================================================
// SCRIPT DE DIAGNÓSTICO DE BASE DE DATOS POSTGRESQL (comprobar-db.js)
// Propósito: Verificar la conexión y la existencia de tablas en Render
// ===================================================================

const db = require('./db');
require('dotenv').config();

async function verificarBaseDeDatos() {
    console.log("Iniciando prueba de conexión con la base de datos en Render...\n");

    try {
        // 1. Probar la conexión básica enviando una consulta simple
        const resTiempo = await db.query('SELECT NOW() as fecha_servidor;');
        console.log("✓ Conexión exitosa a PostgreSQL en Render.");
        console.log(`  Hora actual en el servidor DB: ${resTiempo.rows[0].fecha_servidor}\n`);

        // 2. Consultar las tablas existentes en el esquema público
        const queryTablas = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `;
        const resTablas = await db.query(queryTablas);

        if (resTablas.rows.length === 0) {
            console.log("⚠️ La base de datos está activa, pero NO TIENE TABLAS creadas aún.");
            console.log("👉 Siguiente paso necesario: Ejecutar 'node init-db.js' para crear el esquema.");
        } else {
            console.log("✓ Tablas encontradas en la base de datos:");
            resTablas.rows.forEach(t => console.log(`   - ${t.table_name}`));

            // 3. Si existe la tabla usuarios, verificar los registros cargados
            const tieneUsuarios = resTablas.rows.some(t => t.table_name === 'usuarios');
            if (tieneUsuarios) {
                const resUsuarios = await db.query('SELECT numero_control, rol, nombre FROM usuarios;');
                console.log(`\n✓ Usuarios registrados en la tabla 'usuarios' (${resUsuarios.rows.length}):`);
                resUsuarios.rows.forEach(u => console.log(`   - ${u.numero_control} (${u.rol}): ${u.nombre}`));
            }
        }

        console.log("\n==================================================");
        console.log("DIAGNÓSTICO FINALIZADO CON ÉXITO");
        console.log("==================================================");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error al conectar con la base de datos:", error.message);
        console.log("\nPosibles causas:");
        console.log("1. La URL en DATABASE_URL dentro de tu archivo .env es incorrecta.");
        console.log("2. La base de datos aún no se ha creado en Render.");
        process.exit(1);
    }
}

verificarBaseDeDatos();