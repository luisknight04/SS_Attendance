// server.js - Servidor Node.js / Express adaptado para Render
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_por_defecto';
// Render asigna dinámicamente un puerto en process.env.PORT
const PORT = process.env.PORT || 3000;

// Middleware de Autenticación
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ mensaje: "Acceso denegado: Token no proporcionado" });

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) return res.status(403).json({ mensaje: "Token inválido o expirado" });
        req.usuario = usuario;
        next();
    });
}

// Middleware de Verificación de Administrador
function esAdmin(req, res, next) {
    if (req.usuario && req.usuario.rol === 'ADMIN') {
        next();
    } else {
        return res.status(403).json({ mensaje: "Acceso denegado: Requiere rol de Administrador" });
    }
}

// -------------------------------------------------------------------
// RUTAS DE LA APLICACIÓN
// -------------------------------------------------------------------

// 1. Inicio de Sesión (Usa Número de Control)
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
            { numeroControl: usuario.numero_control, nombre: usuario.nombre, rol: usuario.rol },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            usuario: {
                numeroControl: usuario.numero_control,
                nombre: usuario.nombre,
                rol: usuario.rol
            }
        });
    } catch (error) {
        res.status(500).json({ mensaje: "Error en el servidor", error: error.message });
    }
});

// 2. Generación del QR Dinámico (Para la pantalla del monitor)
app.get('/api/qr/generar', (req, res) => {
    const nonce = crypto.randomBytes(16).toString('hex');
    // Generar token que expira en 10 segundos
    const qrToken = jwt.sign({ nonce }, JWT_SECRET, { expiresIn: '10s' });
    res.json({ qrToken });
});

// 3. Registro de Asistencia mediante QR (Desde el móvil del personal)
app.post('/api/asistencia/registrar', verificarToken, async (req, res) => {
    const { qrToken } = req.body;
    const numeroControl = req.usuario.numeroControl;

    if (!qrToken) return res.status(400).json({ mensaje: "Token QR no enviado" });

    try {
        // Validar vigencia de 10 segundos del QR
        const decoded = jwt.verify(qrToken, JWT_SECRET);

        // Validar si el QR ya fue consumido por alguien más
        const checkQr = await db.query('SELECT token FROM qr_tokens_usados WHERE token = $1', [decoded.nonce]);
        if (checkQr.rows.length > 0) {
            return res.status(400).json({ mensaje: "Este código QR ya ha sido utilizado." });
        }

        // Marcar el QR como usado
        await db.query('INSERT INTO qr_tokens_usados (token) VALUES ($1)', [decoded.nonce]);

        // Registrar marcaje en asistencias
        const insertAsistencia = `
            INSERT INTO asistencias (numero_control, fecha_hora) 
            VALUES ($1, CURRENT_TIMESTAMP) 
            RETURNING id, fecha_hora;
        `;
        const result = await db.query(insertAsistencia, [numeroControl]);

        res.status(201).json({
            exito: true,
            mensaje: "Asistencia registrada exitosamente",
            registro: result.rows[0]
        });

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ mensaje: "El código QR ha expirado. Por favor escanea el nuevo código en pantalla." });
        }
        res.status(500).json({ mensaje: "Error al procesar el registro", error: error.message });
    }
});

// Arrancar Servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});