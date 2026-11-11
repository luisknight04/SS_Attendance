# Sistema de Control de Asistencia para Servicio Social

Este sistema permite gestionar el registro de entradas y salidas de los estudiantes de Servicio Social mediante escaneo de código QR dinámico, cálculo automático de horas acumuladas (sobre la meta oficial de 480 horas), visualización de métricas en tiempo real para el administrador y edición segura de perfiles académicos.

## 🛠️ Tecnologías Utilizadas

* **Backend:** Node.js, Express.js, JSON Web Tokens (JWT), bcrypt.
* **Base de Datos:** PostgreSQL (alojado en Render).
* **Frontend:** HTML5, Tailwind CSS (CDN), Lucide Icons, HTML5-QRCode Scanner.
* **Despliegue:** Render (Integración continua con GitHub).

---

## 📁 Estructura del Proyecto

### 🌐 Archivos en GitHub (Repositorio Remoto)

```text
ASISTENCIA SS/
├── public/
│   ├── app-personal.html     # Interfaz móvil para estudiantes (QR y reportes)
│   ├── dashboard.html        # Panel de administración (Métricas, historial y expedientes)
│   ├── display.html          # Pantalla receptora generadora de QR dinámico
│   └── login.html            # Formulario de inicio de sesión
├── .gitignore                # Reglas para omitir .env y node_modules
├── db.js                     # Configuración y conexión del pool de PostgreSQL
├── normalizar-catalogos.js   # Script de migración y sembrado de tablas catálogo
├── package.json              # Dependencias y scripts de Node.js
├── schema.sql                # Definición completa del esquema de base de datos v2.3
├── seed.js                   # Script para usuarios iniciales / datos de prueba
└── server.js                 # Servidor de Express con todos los endpoints de la API
```

### 💻 Archivos del Entorno Local (Visual Studio Code)

En tu entorno local de trabajo se incluyen adicionalmente archivos de configuración privada y utilidades de diagnóstico:

```text
ASISTENCIA SS/
├── node_modules/             # Dependencias instaladas de Node.js (Ignorado por Git)
├── .env                      # Variables de entorno locales y claves secretas (Ignorado por Git)
├── package-lock.json         # Árbol de versiones exactas de NPM
├── actualizar-tabla.js       # Script auxiliar de migración manual para asistencias
├── comprobar-db.js          # Script de diagnóstico rápido de conexión a PostgreSQL
└── init-db.js                # Script de inicialización base de tablas
```

---

## 🗄️ Arquitectura de la Base de Datos (v2.3)

La base de datos se encuentra normalizada con llaves foráneas conectadas a catálogos para garantizar la integridad de la información:

### Tablas Catálogo
* `catalogo_carreras` (`id`, `nombre`)
* `catalogo_periodos` (`id`, `nombre`)
* `catalogo_semestre` (`id`, `numero`)

### Tablas Principales
* **`usuarios`**: Contiene número de control, nombres, correo, password hash, rol (`ADMIN`, `PERSONAL`, `DISPLAY`), estatus activo/inactivo y referencias a los catálogos (`carrera_id`, `semestre_id`, `periodo_id`).
* **`asistencias`**: Registra marcajes de `ENTRADA` y `SALIDA` con marcas de tiempo (`fecha_hora`) asociadas al número de control.
* **`qr_tokens_usados`**: Almacena tokens consumidos para evitar la reutilización de códigos QR caducados.

---

## ⚙️ Variables de Entorno (`.env` y Render)

Para el funcionamiento local y en producción se requieren las siguientes variables:

```env
PORT=3000
DATABASE_URL=postgresql://usuario:password@host/nombre_bd
JWT_SECRET=secreto_para_asistencias_2026
PIN_EDICION_ADMIN=EdicionAdmin2026*
```

> **Nota de Seguridad:** En el panel web de Render (`Dashboard > Web Service > Environment`), la variable `PIN_EDICION_ADMIN` está configurada para autorizar las ediciones administrativas en `dashboard.html`.

---

## 🚀 Flujo de Trabajo y Despliegue en Render

Cada commit enviado a la rama principal activa un despliegue automático en Render.

### 1. Ejecutar migraciones en PostgreSQL (si aplica)
```bash
node normalizar-catalogos.js
```

### 2. Guardar y desplegar en GitHub y Render
```bash
git add .
git commit -m "Actualización del proyecto y documentación"
git push origin main
```

---

## 🔐 Seguridad e Integridad

* **Tokens QR Dinámicos:** Generados con expiración corta para evitar capturas de pantalla.
* **PIN de Edición Secundaria:** Toda modificación a los datos académicos de los alumnos en `dashboard.html` requiere la confirmación del `PIN_EDICION_ADMIN`.
* **Entradas y Salidas:** Cálculo de horas acumuladas por sesión en milisegundos filtrado por día actual.