// ===================================================================
// SERVIDOR PRINCIPAL (server.js) - CONTROL DE ASISTENCIA SS
// ===================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
require('dotenv').config();

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());
// Servir la carpeta de archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_asistencia_2026';
const PORT = process.env.PORT || 3000;

// -------------------------------------------------------------------
// MIDDLEWARES DE SEGURIDAD Y ROLES
// -------------------------------------------------------------------

// Verificar autenticación mediante token JWT
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ mensaje: "Acceso denegado: Token no proporcionado" });

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) return res.status(403).json({ mensaje: "Sesión inválida o expirada" });
        req.usuario = usuario;
        next();
    });
}

// Verificar rol de Administrador
function esAdmin(req, res, next) {
    if (req.usuario && req.usuario.rol === 'ADMIN') {
        next();
    } else {
        return res.status(403).json({ mensaje: "Acceso denegado: Requiere rol de Administrador" });
    }
}

// Verificar rol de Monitor o Administrador
function esMonitorOAdmin(req, res, next) {
    if (req.usuario && (req.usuario.rol === 'DISPLAY' || req.usuario.rol === 'ADMIN')) {
        next();
    } else {
        return res.status(403).json({ mensaje: "Acceso denegado: Estación no autorizada" });
    }
}

// -------------------------------------------------------------------
// RUTAS DE AUTENTICACIÓN Y SISTEMA
// -------------------------------------------------------------------

// 1. Inicio de Sesión General (Admin, Monitor o Personal)
app.post('/api/auth/login', async (req, res) => {
    const { numeroControl, password } = req.body;

    try {
        const queryText = 'SELECT * FROM usuarios WHERE numero_control = $1 AND activo = TRUE';
        const result = await db.query(queryText, [numeroControl]);

        if (result.rows.length === 0) {
            return res.status(401).json({ mensaje: "Número de control o contraseña incorrectos" });
        }

        const usuario = result.rows[0];
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);

        if (!passwordValida) {
            return res.status(401).json({ mensaje: "Número de control o contraseña incorrectos" });
        }

        const token = jwt.sign(
            { 
                numeroControl: usuario.numero_control, 
                nombre: usuario.nombre, 
                rol: usuario.rol 
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            usuario: {
                numeroControl: usuario.numero_control,
                nombre: usuario.nombre,
                apellidoPaterno: usuario.apellido_paterno,
                rol: usuario.rol
            }
        });
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ mensaje: "Error interno en el servidor" });
    }
});

// 2. Generación del QR Dinámico (10 segundos de vigencia)
app.get('/api/qr/generar', verificarToken, esMonitorOAdmin, (req, res) => {
    const nonce = crypto.randomBytes(16).toString('hex');
    const qrToken = jwt.sign({ nonce }, JWT_SECRET, { expiresIn: '10s' });
    res.json({ qrToken });
});

// 3. Endpoint de Registro de Asistencia Automático (Entrada/Salida y Cálculo de Horas)
app.post('/api/asistencia/registrar', verificarToken, async (req, res) => {
    const { qrToken } = req.body;
    const numeroControl = req.usuario.numeroControl;

    if (!qrToken) {
        return res.status(400).json({ mensaje: "Código QR no proporcionado." });
    }

    try {
        // 1. Validar la autenticidad y expiración de 10 segundos del código QR
        const decoded = jwt.verify(qrToken, JWT_SECRET);

        // 2. Verificar que el QR no haya sido reutilizado
        const checkQr = await db.query('SELECT token FROM qr_tokens_usados WHERE token = $1', [decoded.nonce]);
        if (checkQr.rows.length > 0) {
            return res.status(400).json({ mensaje: "Este código QR ya fue utilizado por otra persona." });
        }

        // 3. Marcar el token QR como consumido
        await db.query('INSERT INTO qr_tokens_usados (token) VALUES ($1)', [decoded.nonce]);

        // 4. Determinar automáticamente si es ENTRADA o SALIDA consultando el último registro de HOY
        const ultimoRegistroQuery = `
            SELECT tipo_registro 
            FROM asistencias 
            WHERE numero_control = $1 AND fecha_hora::date = CURRENT_DATE 
            ORDER BY fecha_hora DESC 
            LIMIT 1;
        `;
        const ultimoRes = await db.query(ultimoRegistroQuery, [numeroControl]);

        let nuevoTipo = 'ENTRADA';
        if (ultimoRes.rows.length > 0 && ultimoRes.rows[0].tipo_registro === 'ENTRADA') {
            nuevoTipo = 'SALIDA';
        }

        // 5. Registrar el nuevo movimiento en PostgreSQL
        const insertQuery = `
            INSERT INTO asistencias (numero_control, fecha_hora, tipo_registro) 
            VALUES ($1, CURRENT_TIMESTAMP, $2) 
            RETURNING id, fecha_hora, tipo_registro;
        `;
        const insertRes = await db.query(insertQuery, [numeroControl, nuevoTipo]);
        const nuevoRegistro = insertRes.rows[0];

        // 6. Si el registro fue SALIDA, calcular las horas acumuladas del día
        let horasMensaje = "";
        if (nuevoTipo === 'SALIDA') {
            const historialHoyQuery = `
                SELECT tipo_registro, fecha_hora 
                FROM asistencias 
                WHERE numero_control = $1 AND fecha_hora::date = CURRENT_DATE 
                ORDER BY fecha_hora ASC;
            `;
            const historialHoyRes = await db.query(historialHoyQuery, [numeroControl]);
            const registrosHoy = historialHoyRes.rows;

            let msTotales = 0;
            let entradaTemp = null;

            // Recorrer los registros ordenados para calcular bloques
            for (const reg of registrosHoy) {
                if (reg.tipo_registro === 'ENTRADA') {
                    entradaTemp = new Date(reg.fecha_hora);
                } else if (reg.tipo_registro === 'SALIDA' && entradaTemp) {
                    const salidaTemp = new Date(reg.fecha_hora);
                    msTotales += (salidaTemp - entradaTemp);
                    entradaTemp = null; // Reiniciar para el siguiente bloque
                }
            }

            // Convertir milisegundos a horas y minutos
            const minutosTotales = Math.floor(msTotales / (1000 * 60));
            const horas = Math.floor(minutosTotales / 60);
            const minutos = minutosTotales % 60;

            horasMensaje = ` Tiempo acumulado hoy: ${horas}h ${minutos}m (Meta diaria: 4h).`;
        }

        res.status(201).json({
            exito: true,
            tipo: nuevoTipo,
            mensaje: `¡${nuevoTipo} registrada con éxito!${horasMensaje}`,
            registro: nuevoRegistro
        });

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ mensaje: "El código QR ha expirado. Escanea el nuevo código en pantalla." });
        }
        console.error("Error al registrar asistencia:", error);
        res.status(500).json({ mensaje: "Error interno al procesar el registro de asistencia." });
    }
});

// 4. Mis Reportes (Para la app móvil del Personal - Solo Lectura)
app.get('/api/asistencia/mis-reportes', verificarToken, async (req, res) => {
    const numeroControl = req.usuario.numeroControl;

    try {
        const queryText = `
            SELECT id, fecha_hora 
            FROM asistencias 
            WHERE numero_control = $1 
            ORDER BY fecha_hora DESC;
        `;
        const result = await db.query(queryText, [numeroControl]);
        res.json({ asistencias: result.rows });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al obtener historial" });
    }
});

// 5. Historial Global (Para el Dashboard del Administrador)
app.get('/api/admin/asistencias', verificarToken, esAdmin, async (req, res) => {
    try {
        const queryText = `
            SELECT 
                a.id,
                a.fecha_hora,
                u.numero_control,
                u.nombre,
                u.apellido_paterno,
                u.apellido_materno
            FROM asistencias a
            INNER JOIN usuarios u ON a.numero_control = u.numero_control
            ORDER BY a.fecha_hora DESC;
        `;
        const result = await db.query(queryText);

        const totalUsuarios = await db.query(
            "SELECT COUNT(*) FROM usuarios WHERE rol = 'PERSONAL' AND activo = TRUE"
        );

        res.json({
            exito: true,
            totalPersonal: parseInt(totalUsuarios.rows[0].count),
            asistencias: result.rows
        });
    } catch (error) {
        res.status(500).json({ mensaje: "Error al consultar asistencias globales" });
    }
});

// 6. Registrar nuevo integrante (Alta desde el Administrador)
app.post('/api/admin/usuarios', verificarToken, esAdmin, async (req, res) => {
    const { 
        numeroControl, nombre, apellidoPaterno, apellidoMaterno, 
        email, password, semestreNumero, periodoServicio 
    } = req.body;

    if (!numeroControl || !nombre || !apellidoPaterno || !email || !password) {
        return res.status(400).json({ mensaje: "Por favor completa los campos obligatorios." });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const queryText = `
            INSERT INTO usuarios (
                numero_control, nombre, apellido_paterno, apellido_materno, 
                email, password_hash, semestre_numero, periodo_servicio, rol, activo
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PERSONAL', TRUE)
            RETURNING numero_control, nombre, apellido_paterno, email;
        `;

        const result = await db.query(queryText, [
            numeroControl, nombre, apellidoPaterno, apellidoMaterno || null,
            email, passwordHash, semestreNumero || null, periodoServicio || null
        ]);

        res.status(201).json({ mensaje: "Usuario registrado correctamente", usuario: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ mensaje: "El Número de Control o Correo ya existe en la base de datos." });
        }
        res.status(500).json({ mensaje: "Error al dar de alta al usuario" });
    }
});

// 7. Ruta raíz por defecto
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Arrancar Servidor
app.listen(PORT, () => {
    console.log(`Servidor de asistencia ejecutándose en el puerto ${PORT}`);
});
