-- ===================================================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS: CONTROL DE ASISTENCIA (v2.3)
-- Motor: PostgreSQL
-- ===================================================================

-- 1. Limpieza de tablas previas
DROP TABLE IF EXISTS qr_tokens_usados CASCADE;
DROP TABLE IF EXISTS asistencias CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS catalogo_carreras CASCADE;
DROP TABLE IF EXISTS catalogo_periodos CASCADE;
DROP TABLE IF EXISTS catalogo_semestre CASCADE;

-- 2. Tablas Catálogo (Normalización)
CREATE TABLE catalogo_carreras (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE catalogo_periodos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE catalogo_semestre (
    id SERIAL PRIMARY KEY,
    numero INT UNIQUE NOT NULL
);

-- 3. Tabla de Usuarios
CREATE TABLE usuarios (
    numero_control VARCHAR(20) PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    apellido_paterno VARCHAR(50) NOT NULL,
    apellido_materno VARCHAR(50),
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    carrera_id INT REFERENCES catalogo_carreras(id) ON DELETE SET NULL,
    semestre_id INT REFERENCES catalogo_semestre(id) ON DELETE SET NULL,
    periodo_id INT REFERENCES catalogo_periodos(id) ON DELETE SET NULL,
    
    rol VARCHAR(10) NOT NULL DEFAULT 'PERSONAL',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_rol CHECK (rol IN ('ADMIN', 'PERSONAL', 'DISPLAY'))
);

-- 4. Tabla de Asistencias
CREATE TABLE asistencias (
    id SERIAL PRIMARY KEY,
    numero_control VARCHAR(20) NOT NULL,
    fecha_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tipo_registro VARCHAR(10) NOT NULL DEFAULT 'ENTRADA',
    
    CONSTRAINT fk_usuario_asistencia 
        FOREIGN KEY (numero_control) 
        REFERENCES usuarios(numero_control) 
        ON DELETE CASCADE,
    CONSTRAINT chk_tipo_registro 
        CHECK (tipo_registro IN ('ENTRADA', 'SALIDA'))
);

-- 5. Tabla de Tokens QR Usados
CREATE TABLE qr_tokens_usados (
    token VARCHAR(64) PRIMARY KEY,
    usado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Índices de optimización
CREATE INDEX idx_asistencias_usuario ON asistencias(numero_control);
CREATE INDEX idx_asistencias_fecha ON asistencias(fecha_hora);