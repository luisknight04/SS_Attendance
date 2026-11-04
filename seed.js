// seed.js - Script para poblar la base de datos con usuarios iniciales
const bcrypt = require('bcryptjs');
const db = require('./db');
require('dotenv').config();

async function crearUsuariosIniciales() {
    try {
        console.log("Iniciando la creación de usuarios base...");

        // Generar hashes seguros para las contraseñas
        const passAdmin = await bcrypt.hash('Admin123!', 10);
        const passMonitor = await bcrypt.hash('Monitor123!', 10);
        const passAlumno = await bcrypt.hash('Alumno123!', 10);

        // Lista de usuarios iniciales
        const usuarios = [
            {
                numeroControl: 'ADMIN01',
                nombre: 'Luis Figueroa (Administrador)',
                email: 'admin@itpuebla.edu.mx',
                passwordHash: passAdmin,
                rol: 'ADMIN'
            },
            {
                numeroControl: 'MONITOR01',
                nombre: 'Estación Monitor QR (Oficina Personal)',
                email: 'monitor@itpuebla.edu.mx',
                passwordHash: passMonitor,
                rol: 'DISPLAY'
            },
            {
                numeroControl: '22110102',
                nombre: 'Alumno de Prueba',
                email: 'alumno@itpuebla.edu.mx',
                passwordHash: passAlumno,
                rol: 'PERSONAL'
            }
        ];

        // Insertar cada usuario en PostgreSQL (si no existen previamente)
        for (const u of usuarios) {
            const queryText = `
                INSERT INTO usuarios (numero_control, nombre, email, password_hash, rol, activo)
                VALUES ($1, $2, $3, $4, $5, TRUE)
                ON CONFLICT (numero_control) DO NOTHING;
            `;
            await db.query(queryText, [u.numeroControl, u.nombre, u.email, u.passwordHash, u.rol]);
            console.log(`✓ Usuario configurado: ${u.numeroControl} (${u.rol})`);
        }

        console.log("\n¡Credenciales creadas exitosamente!");
        process.exit(0);

    } catch (error) {
        console.error("Error al poblar la base de datos:", error);
        process.exit(1);
    }
}

crearUsuariosIniciales();