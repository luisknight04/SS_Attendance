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

// ===================================================================
// REDIRECCIÓN AUTOMÁTICA A LA PÁGINA DE LOGIN
// ===================================================================

// 1. Asegurar que Express sirva los archivos dentro de la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// 2. Ruta raíz ('/'): Redirige automáticamente al usuario a login.html
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

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

// ===================================================================
// ENDPOINTS DE GESTIÓN DE INTEGRANTES (ADMINISTRADOR)
// ===================================================================

// 1. Obtener la lista completa de integrantes de Servicio Social
app.get('/api/admin/usuarios', verificarToken, esAdmin, async (req, res) => {
    try {
        const queryText = `
            SELECT 
                numero_control, 
                nombre, 
                apellido_paterno, 
                apellido_materno, 
                email, 
                semestre_numero, 
                periodo_servicio, 
                activo, 
                creado_en 
            FROM usuarios 
            WHERE rol = 'PERSONAL' 
            ORDER BY apellido_paterno ASC;
        `;
        const result = await db.query(queryText);
        res.json({ exito: true, usuarios: result.rows });
    } catch (error) {
        console.error("Error al obtener la lista de usuarios:", error);
        res.status(500).json({ mensaje: "Error al consultar la lista de usuarios" });
    }
});

// 2. Activar o Desactivar a un integrante (Baja lógica)
app.put('/api/admin/usuarios/:numeroControl/estado', verificarToken, esAdmin, async (req, res) => {
    const { numeroControl } = req.params;
    const { activo } = req.body; // true o false

    try {
        const queryText = `
            UPDATE usuarios 
            SET activo = $1 
            WHERE numero_control = $2 AND rol = 'PERSONAL' 
            RETURNING numero_control, nombre, apellido_paterno, activo;
        `;
        const result = await db.query(queryText, [activo, numeroControl]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: "Usuario no encontrado" });
        }

        res.json({ 
            exito: true, 
            mensaje: `El estatus del usuario ${numeroControl} se actualizó a ${activo ? 'ACTIVO' : 'INACTIVO'}.`, 
            usuario: result.rows[0] 
        });
    } catch (error) {
        console.error("Error al cambiar estatus de usuario:", error);
        res.status(500).json({ mensaje: "Error al actualizar el estatus del usuario" });
    }
});

// 3. Obtener el historial completo y horas totales acumuladas de un estudiante (Corregido contra Error 500)
app.get('/api/admin/usuarios/:numeroControl/asistencias', verificarToken, esAdmin, async (req, res) => {
    const { numeroControl } = req.params;

    try {
        const queryText = `
            SELECT id, fecha_hora, tipo_registro 
            FROM asistencias 
            WHERE numero_control = $1 
            ORDER BY fecha_hora ASC;
        `;
        const result = await db.query(queryText, [numeroControl]);
        const asistencias = result.rows;

        // Si no hay registros de asistencia en la BD, responder limpiamente sin marcar error
        if (asistencias.length === 0) {
            return res.json({
                exito: true,
                numeroControl,
                totalAsistencias: 0,
                horasAcumuladas: { horas: 0, minutos: 0 },
                historial: []
            });
        }

        // Calcular el acumulado total de horas
        let msTotales = 0;
        let entradaTemp = null;

        for (const reg of asistencias) {
            if (reg.tipo_registro === 'ENTRADA') {
                entradaTemp = new Date(reg.fecha_hora);
            } else if (reg.tipo_registro === 'SALIDA' && entradaTemp) {
                const salidaTemp = new Date(reg.fecha_hora);
                msTotales += (salidaTemp - entradaTemp);
                entradaTemp = null;
            }
        }

        const minutosTotales = Math.floor(msTotales / (1000 * 60));
        const horas = Math.floor(minutosTotales / 60);
        const minutos = minutosTotales % 60;

        res.json({
            exito: true,
            numeroControl,
            totalAsistencias: asistencias.length,
            horasAcumuladas: { horas, minutos },
            historial: [...asistencias].reverse()
        });

    } catch (error) {
        console.error("Error al obtener historial del alumno:", error);
        res.status(500).json({ mensaje: "Error al consultar el historial del alumno" });
    }
});

// ===================================================================
// ENDPOINTS DE CATÁLOGOS Y GESTIÓN DE PERFILES NORMALIZADOS
// ===================================================================

// 1. Obtener los 3 catálogos para alimentar los dropdowns del frontend
app.get('/api/catalogos', verificarToken, async (req, res) => {
    try {
        const carrerasRes = await db.query('SELECT id, nombre FROM catalogo_carreras ORDER BY nombre ASC');
        const periodosRes = await db.query('SELECT id, nombre FROM catalogo_periodos ORDER BY id ASC');
        const semestresRes = await db.query('SELECT id, numero FROM catalogo_semestre ORDER BY numero ASC');

        res.json({
            exito: true,
            carreras: carrerasRes.rows,
            periodos: periodosRes.rows,
            semestres: semestresRes.rows
        });
    } catch (error) {
        console.error("Error al obtener los catálogos:", error);
        res.status(500).json({ mensaje: "Error interno al cargar los catálogos" });
    }
});

// 2. Registrar un nuevo integrante del Servicio Social con llaves foráneas
app.post('/api/admin/usuarios', verificarToken, esAdmin, async (req, res) => {
    const { 
        numeroControl, nombre, apellidoPaterno, apellidoMaterno, 
        email, password, carreraId, semestreId, periodoId 
    } = req.body;

    if (!numeroControl || !nombre || !apellidoPaterno || !email || !password) {
        return res.status(400).json({ mensaje: "Por favor completa todos los campos obligatorios." });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const queryText = `
            INSERT INTO usuarios (
                numero_control, nombre, apellido_paterno, apellido_materno, 
                email, password_hash, carrera_id, semestre_id, periodo_id, rol, activo
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PERSONAL', TRUE)
            RETURNING numero_control, nombre, apellido_paterno, email;
        `;

        const result = await db.query(queryText, [
            numeroControl, 
            nombre, 
            apellidoPaterno, 
            apellidoMaterno || null,
            email, 
            passwordHash, 
            carreraId || null, 
            semestreId || null, 
            periodoId || null
        ]);

        res.status(201).json({ 
            exito: true, 
            mensaje: "Integrante registrado correctamente en el sistema.", 
            usuario: result.rows[0] 
        });

    } catch (error) {
        console.error("Error al registrar usuario:", error);
        if (error.code === '23505') {
            return res.status(400).json({ mensaje: "El Número de Control o Correo Electrónico ya está registrado." });
        }
        res.status(500).json({ mensaje: "Error al registrar el usuario en la base de datos." });
    }
});

// 3. Editar datos académicos y personales de un alumno (Protegido por PIN de Edición)
app.put('/api/admin/usuarios/:numeroControl/editar', verificarToken, esAdmin, async (req, res) => {
    const { numeroControl } = req.params;
    const { 
        nombre, apellidoPaterno, apellidoMaterno, 
        email, carreraId, semestreId, periodoId, 
        pinEdicion 
    } = req.body;

    // Validación de la contraseña secundaria de seguridad
    if (pinEdicion !== process.env.PIN_EDICION_ADMIN) {
        return res.status(403).json({ mensaje: "PIN de edición incorrecto. Operación denegada." });
    }

    try {
        const queryText = `
            UPDATE usuarios 
            SET 
                nombre = COALESCE($1, nombre),
                apellido_paterno = COALESCE($2, apellido_paterno),
                apellido_materno = COALESCE($3, apellido_materno),
                email = COALESCE($4, email),
                carrera_id = $5,
                semestre_id = $6,
                periodo_id = $7
            WHERE numero_control = $8 AND rol = 'PERSONAL'
            RETURNING numero_control, nombre;
        `;
        
        const result = await db.query(queryText, [
            nombre, apellidoPaterno, apellidoMaterno, 
            email, carreraId || null, semestreId || null, periodoId || null, 
            numeroControl
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: "Integrante no encontrado." });
        }

        res.json({ exito: true, mensaje: "Perfil actualizado correctamente." });

    } catch (error) {
        console.error("Error al editar perfil del alumno:", error);
        if (error.code === '23505') {
            return res.status(400).json({ mensaje: "El correo electrónico ya pertenece a otro usuario." });
        }
        res.status(500).json({ mensaje: "Error interno al actualizar la información." });
    }
});

// 4. Obtener perfil completo con los nombres de catálogos mediante LEFT JOIN (Para Alumno)
// Obtener perfil completo y métricas de un alumno específico (Para el Administrador)
app.get('/api/admin/usuarios/:numeroControl/perfil', verificarToken, esAdmin, async (req, res) => {
    const { numeroControl } = req.params;

    try {
        // Consulta SQL con LEFT JOIN hacia las tablas catálogo
        const usuarioQuery = `
            SELECT 
                u.numero_control, u.nombre, u.apellido_paterno, u.apellido_materno, u.email, u.activo, u.creado_en,
                c.id AS carrera_id, c.nombre AS carrera_nombre,
                s.id AS semestre_id, s.numero AS semestre_numero,
                p.id AS periodo_id, p.nombre AS periodo_nombre
            FROM usuarios u
            LEFT JOIN catalogo_carreras c ON u.carrera_id = c.id
            LEFT JOIN catalogo_semestre s ON u.semestre_id = s.id
            LEFT JOIN catalogo_periodos p ON u.periodo_id = p.id
            WHERE u.numero_control = $1 AND u.rol = 'PERSONAL';
        `;
        const usuarioRes = await db.query(usuarioQuery, [numeroControl]);

        if (usuarioRes.rows.length === 0) {
            return res.status(404).json({ exito: false, mensaje: "Integrante no encontrado en la base de datos." });
        }

        const usuario = usuarioRes.rows[0];

        // Consultar asistencias para las métricas del modal
        const asistenciasQuery = `
            SELECT fecha_hora, tipo_registro 
            FROM asistencias 
            WHERE numero_control = $1 
            ORDER BY fecha_hora ASC;
        `;
        const asistenciasRes = await db.query(asistenciasQuery, [numeroControl]);
        const asistencias = asistenciasRes.rows;

        let msTotales = 0;
        let entradaTemp = null;
        const diasUnicos = new Set();

        for (const reg of asistencias) {
            diasUnicos.add(new Date(reg.fecha_hora).toDateString());
            if (reg.tipo_registro === 'ENTRADA') {
                entradaTemp = new Date(reg.fecha_hora);
            } else if (reg.tipo_registro === 'SALIDA' && entradaTemp) {
                msTotales += (new Date(reg.fecha_hora) - entradaTemp);
                entradaTemp = null;
            }
        }

        const minutosTotales = Math.floor(msTotales / (1000 * 60));
        const horasTotales = Math.floor(minutosTotales / 60);
        const minutosRestantes = minutosTotales % 60;
        const metaHoras = 480;
        const porcentajeAvance = Math.min(100, parseFloat(((horasTotales / metaHoras) * 100).toFixed(1)));

        // Responder en formato JSON limpio
        res.json({
            exito: true,
            perfil: usuario,
            metricas: {
                horasAcumuladas: horasTotales,
                minutosAcumulados: minutosRestantes,
                metaHoras,
                porcentajeAvance,
                diasAsistidos: diasUnicos.size,
                totalMarcajes: asistencias.length
            }
        });

    } catch (error) {
        console.error("Error al obtener perfil por administrador:", error);
        // Garantizar que SIEMPRE devuelva JSON y nunca una página HTML
        res.status(500).json({ 
            exito: false, 
            mensaje: "Error interno al consultar la base de datos.", 
            error: error.message 
        });
    }
});

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

    for (const reg of registrosHoy) {
        if (reg.tipo_registro === 'ENTRADA') {
            entradaTemp = new Date(reg.fecha_hora);
        } else if (reg.tipo_registro === 'SALIDA' && entradaTemp) {
            const salidaTemp = new Date(reg.fecha_hora);
            msTotales += (salidaTemp - entradaTemp);
            entradaTemp = null;
        }
    }

    const segundosTotales = Math.floor(msTotales / 1000);
    const minutosTotales = Math.floor(segundosTotales / 60);
    const horas = Math.floor(minutosTotales / 60);
    const minutos = minutosTotales % 60;
    const segundos = segundosTotales % 60;

    if (minutosTotales === 0) {
        horasMensaje = ` Tiempo acumulado hoy: ${segundos} segundos.`;
    } else {
        horasMensaje = ` Tiempo acumulado hoy: ${horas}h ${minutos}m (Meta diaria: 4h).`;
    }
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

// 4. Endpoint para obtener el historial personal del alumno (Corregido con tipo_registro)
app.get('/api/asistencia/mis-reportes', verificarToken, async (req, res) => {
    const numeroControl = req.usuario.numeroControl;

    try {
        const queryText = `
            SELECT id, fecha_hora, tipo_registro 
            FROM asistencias 
            WHERE numero_control = $1 
            ORDER BY fecha_hora DESC;
        `;
        const result = await db.query(queryText, [numeroControl]);
        res.json({ asistencias: result.rows });
    } catch (error) {
        console.error("Error al obtener reportes del alumno:", error);
        res.status(500).json({ mensaje: "Error al obtener historial" });
    }
});

// 5. Historial Global (Para el Dashboard del Administrador)
app.get('/api/admin/asistencias', verificarToken, esAdmin, async (req, res) => {
    try {
        // Consulta SQL incluyendo la columna tipo_registro
        const queryText = `
            SELECT 
                a.id,
                a.fecha_hora,
                a.tipo_registro,
                u.numero_control,
                u.nombre,
                u.apellido_paterno,
                u.apellido_materno
            FROM asistencias a
            INNER JOIN usuarios u ON a.numero_control = u.numero_control
            ORDER BY a.fecha_hora DESC;
        `;
        
        const result = await db.query(queryText);
        
        const totalUsuariosResult = await db.query(
            "SELECT COUNT(*) FROM usuarios WHERE rol = 'PERSONAL' AND activo = TRUE"
        );

        res.json({
            exito: true,
            totalPersonal: parseInt(totalUsuariosResult.rows[0].count),
            asistencias: result.rows
        });
    } catch (error) {
        console.error("Error al consultar asistencias globales:", error);
        res.status(500).json({ mensaje: "Error interno al obtener reportes globales" });
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
