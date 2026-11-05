<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitor de Asistencia - Servicio Social</title>
    <!-- Tailwind CSS desde CDN para diseño moderno -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Generador de Código QR nativo en cliente -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <!-- Librería de Íconos Lucide -->
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body class="bg-slate-900 text-white min-h-screen flex flex-col justify-between items-center p-6 font-sans">

    <!-- 1. VISTA DE INICIO DE SESIÓN (Se muestra si no hay token de sesión válido) -->
    <div id="vista-login" class="w-full max-w-sm bg-slate-800 border border-slate-700 p-8 rounded-3xl shadow-2xl my-auto hidden">
        <div class="text-center mb-6">
            <div class="inline-flex items-center justify-center p-3 bg-blue-600 rounded-2xl mb-3 text-white">
                <i data-lucide="monitor" class="w-8 h-8"></i>
            </div>
            <h2 class="text-xl font-bold">Acceso a Monitor</h2>
            <p class="text-xs text-slate-400 mt-1">Ingresa las credenciales de la cuenta DISPLAY para proyectar el QR.</p>
        </div>

        <form id="form-login" class="space-y-4">
            <div>
                <label class="block text-xs font-medium text-slate-300 mb-1">Número de Control / Identificador</label>
                <input type="text" id="input-usuario" required placeholder="Ej. MONITOR01" 
                       class="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500">
            </div>

            <div>
                <label class="block text-xs font-medium text-slate-300 mb-1">Contraseña</label>
                <input type="password" id="input-password" required placeholder="••••••••" 
                       class="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500">
            </div>

            <div id="error-login" class="text-xs text-rose-400 font-medium hidden"></div>

            <button type="submit" class="w-full py-3 bg-blue-600 hover:bg-blue-700 font-semibold rounded-xl text-sm transition-all shadow-lg">
                Iniciar Monitor
            </button>
        </form>
    </div>


    <!-- 2. VISTA PRINCIPAL DEL MONITOR QR (Se activa tras iniciar sesión) -->
    <div id="vista-monitor" class="w-full max-w-xl flex flex-col items-center my-auto hidden">
        
        <!-- Encabezado -->
        <header class="text-center mb-6">
            <div class="inline-flex items-center gap-2 bg-slate-800 border border-slate-700 px-4 py-2 rounded-full mb-3">
                <i data-lucide="shield-check" class="w-5 h-5 text-emerald-400"></i>
                <span class="text-xs font-semibold tracking-wider text-slate-300 uppercase">Estación de Registro Autorizada</span>
            </div>
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight">Escanea tu Código QR</h1>
            <p class="text-slate-400 text-sm mt-1">Abre tu sesión de personal desde tu dispositivo móvil para registrar tu asistencia.</p>
        </header>

        <!-- Contenedor del QR -->
        <main class="w-full max-w-md bg-white text-slate-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center border border-slate-100">
            
            <div class="p-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl mb-6">
                <!-- Envoltorio donde la librería insertará el código QR en JS -->
                <div id="qrcode-container" class="flex justify-center items-center w-[220px] h-[220px]"></div>
            </div>

            <!-- Barra de Progreso de 10 segundos -->
            <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-3">
                <div id="progress-bar" class="bg-blue-600 h-2.5 rounded-full w-full transition-all duration-1000 ease-linear"></div>
            </div>

            <div class="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin text-blue-600"></i>
                <span>Actualización automática en <strong id="timer-text" class="text-slate-800">10</strong>s</span>
            </div>
        </main>

        <!-- Botón secundario para cerrar sesión de la pantalla -->
        <button onclick="cerrarSesion()" class="mt-6 text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
            <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
            <span>Cerrar sesión de esta estación</span>
        </button>
    </div>


    <!-- Pie de página -->
    <footer class="text-slate-500 text-xs text-center mt-auto pt-4">
        <p>Control de Asistencia • Servicio Social IT Puebla</p>
    </footer>


    <!-- 3. LÓGICA DE PROGRAMACIÓN Y COMUNICACIÓN CON EL BACKEND -->
    <script>
        lucide.createIcons();

        // Referencias a elementos del DOM
        const vistaLogin = document.getElementById('vista-login');
        const vistaMonitor = document.getElementById('vista-monitor');
        const formLogin = document.getElementById('form-login');
        const errorLogin = document.getElementById('error-login');

        const progressBar = document.getElementById('progress-bar');
        const timerText = document.getElementById('timer-text');

        let qrcode = null;
        let segundosRestantes = 10;
        const totalTiempo = 10;
        let intervaloTimer = null;

        // Inicializador del objeto QR
        function inicializarLibreriaQR() {
            if (!qrcode) {
                qrcode = new QRCode(document.getElementById("qrcode-container"), {
                    width: 220,
                    height: 220,
                    colorDark: "#0f172a",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        }

        // Petición HTTP al servidor para obtener el token QR de 10 segundos
        async function obtenerNuevoQR() {
            const tokenSesion = localStorage.getItem('display_jwt_token');

            if (!tokenSesion) {
                mostrarVistaLogin();
                return;
            }

            try {
                const response = await fetch('/api/qr/generar', {
                    headers: {
                        'Authorization': 'Bearer ' + tokenSesion
                    }
                });

                // Si las credenciales o el token no son válidos (no es rol DISPLAY o ADMIN)
                if (response.status === 401 || response.status === 403) {
                    localStorage.removeItem('display_jwt_token');
                    mostrarVistaLogin();
                    return;
                }

                const data = await response.json();

                if (data.qrToken) {
                    inicializarLibreriaQR();
                    qrcode.clear();
                    qrcode.makeCode(data.qrToken);
                }
            } catch (error) {
                console.error("Error al conectar con el servidor backend:", error);
            }
        }

        // Iniciar el temporizador en bucle
        function arrancarCicloQR() {
            if (intervaloTimer) clearInterval(intervaloTimer);
            
            segundosRestantes = totalTiempo;
            obtenerNuevoQR();

            intervaloTimer = setInterval(() => {
                segundosRestantes--;

                if (segundosRestantes <= 0) {
                    segundosRestantes = totalTiempo;
                    obtenerNuevoQR();
                }

                timerText.innerText = segundosRestantes;
                const porcentaje = (segundosRestantes / totalTiempo) * 100;
                progressBar.style.width = `${porcentaje}%`;
            }, 1000);
        }

        // Control de vistas del DOM
        function mostrarVistaMonitor() {
            vistaLogin.classList.add('hidden');
            vistaMonitor.classList.remove('hidden');
            arrancarCicloQR();
        }

        function mostrarVistaLogin() {
            if (intervaloTimer) clearInterval(intervaloTimer);
            vistaMonitor.classList.add('hidden');
            vistaLogin.classList.remove('hidden');
        }

        // Evento de Inicio de Sesión
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorLogin.classList.add('hidden');

            const numeroControl = document.getElementById('input-usuario').value;
            const password = document.getElementById('input-password').value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ numeroControl, password })
                });

                const data = await response.json();

                if (response.ok && data.token) {
                    // Guardar token JWT localmente en el navegador de la recepción
                    localStorage.setItem('display_jwt_token', data.token);
                    mostrarVistaMonitor();
                } else {
                    errorLogin.innerText = data.mensaje || "Credenciales incorrectas";
                    errorLogin.classList.remove('hidden');
                }
            } catch (err) {
                errorLogin.innerText = "Error de conexión con el servidor";
                errorLogin.classList.remove('hidden');
            }
        });

        <!-- Botón secundario para cerrar sesión en la pantalla del monitor -->
<button onclick="cerrarSesion()" class="mt-6 text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
    <i data-lucide="log-out" class="w-3.5 h-3.5"></i>
    <span>Cerrar sesión de esta estación</span>
</button>

        // Verificación inicial de sesión al cargar la página
        if (localStorage.getItem('display_jwt_token')) {
            mostrarVistaMonitor();
        } else {
            mostrarVistaLogin();
        }
    </script>
</body>
</html>
