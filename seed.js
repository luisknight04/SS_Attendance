// seed.js - Creación de usuarios con identificadores administrativos estandarizados
const bcrypt = require('bcryptjs');
const db = require('./db');
require('dotenv').config();

async function crearUsuariosIniciales() {
    try {
        console.log("Iniciando la creación de usuarios base...");

        const passAdmin = await bcrypt.hash('Admin123!', 10);
        const passMonitor = await bcrypt.hash('Monitor123!', 10);
        const passAlumno = await bcrypt.hash('Alumno123!', 10);

        const usuarios = [
            {
                numeroControl: 'ADM-01', // Identificador administrativo estandarizado
                nombre: 'Reyna',
                apellidoPaterno: 'Machorro',
                apellidoMaterno: 'Luna',
                email: 'reyna.machorro@puebla.tecnm.mx',
                passwordHash: passAdmin,
                carreraId: null,
                semestreId: null,
                periodoId: null,
                rol: 'ADMIN'
            },
            {
                numeroControl: 'MON-01', // Identificador para la pantalla del monitor
                nombre: 'Estación',
                apellidoPaterno: 'Monitor',
                apellidoMaterno: 'Recepción',
                email: 'monitor@itpuebla.edu.mx',
                passwordHash: passMonitor,
                carreraId: null,
                semestreId: null,
                periodoId: null,
                rol: 'DISPLAY'
            },
            {
                numeroControl: '22220900', // Matrícula de alumno de prueba
                nombre: 'Luis Enrique',
                apellidoPaterno: 'Figueroa',
                apellidoMaterno: 'Castillo',
                email: 'i22220900.19@puebla.tecnm.mx',
                passwordHash: passAlumno,
                carreraId: 1, // ID catálogo carreras
                semestreId: 9, // Semestre 9 (ID 9)
                periodoId: 1, // Periodo inicial (ID 1)
                rol: 'PERSONAL'
            }
        ];

        for (const u of usuarios) {
            const queryText = `
                INSERT INTO usuarios (
                    numero_control, nombre, apellido_paterno, apellido_materno, 
                    email, password_hash, carrera_id, semestre_id, periodo_id, rol, activo
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
                ON CONFLICT (numero_control) DO NOTHING;
            `;
            await db.query(queryText, [
                u.numeroControl, u.nombre, u.apellidoPaterno, u.apellidoMaterno,
                u.email, u.passwordHash, u.carreraId, u.semestreId, u.periodoId, u.rol
            ]);
            console.log(`✓ Usuario configurado: ${u.numeroControl} (${u.rol})`);
        }

        console.log("\n¡Credenciales iniciales listas!");
        process.exit(0);

    } catch (error) {
        console.error("Error al poblar la base de datos:", error);
        process.exit(1);
    }
}

crearUsuariosIniciales();