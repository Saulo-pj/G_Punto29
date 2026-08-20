/* =========================================================
   STORAGE
========================================================= */

const STORAGE_KEY = "organizador_horarios_data";
const REMOTE_WORKERS_CLEANUP_KEY = "horarios_remote_workers_cleaned_v1";
let catalogosHorarios = { sedes: [], turnos: [] };
let agendaPersistenciaLista = false;

async function cargarCatalogosHorarios() {
    const respuesta = await fetch("/api/horarios/catalogos", { credentials: "same-origin" });
    if (!respuesta.ok) throw new Error("No se pudieron cargar los catálogos globales.");
    catalogosHorarios = await respuesta.json();
    const scope = window.AGENDA_SCOPE || {};
    if (scope.role !== "admin_general" && scope.turnoId) {
        const turnoGlobal = catalogosHorarios.turnos.find(turno => String(turno.id_global) === String(scope.turnoId));
        if (turnoGlobal) scope.turnoId = turnoGlobal.id;
    }
    const datos = obtenerDatos();
    datos.sedes = catalogosHorarios.sedes;
    datos.turnos = catalogosHorarios.turnos;
    guardarDatos(datos);
    return catalogosHorarios;
}

async function sincronizarAgendaConServidor() {
    const respuesta = await fetch("/api/horarios/datos", { credentials: "same-origin" });
    if (!respuesta.ok) throw new Error("No se pudieron cargar los datos persistidos.");
    const remoto = await respuesta.json();
    if (remoto.exists && remoto.datos) {
        const datosRemotos = normalizarDatos(remoto.datos);
        if (datosRemotos.configuracion.horariosWorkersCleanedV1 !== true) {
            datosRemotos.trabajadores = [];
            datosRemotos.configuracion.horariosWorkersCleanedV1 = true;
            const limpieza = await fetch("/api/horarios/datos", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datosRemotos) });
            if (!limpieza.ok) throw new Error("No se pudieron limpiar los trabajadores locales.");
            localStorage.setItem(REMOTE_WORKERS_CLEANUP_KEY, "1");
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(datosRemotos));
        agendaPersistenciaLista = true;
        return;
    }
    const datosInicialesRemotos = normalizarDatos({
        configuracion: {},
        sedes: catalogosHorarios.sedes,
        turnos: catalogosHorarios.turnos,
        areas: [],
        cargos: [],
        trabajadores: [],
        permisos: [],
        excepciones: [],
        asistencias: [],
        historial: []
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datosInicialesRemotos));
    localStorage.setItem(REMOTE_WORKERS_CLEANUP_KEY, "1");
    const guardado = await fetch("/api/horarios/datos", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datosInicialesRemotos) });
    if (!guardado.ok) throw new Error("No se pudieron migrar los datos locales.");
    agendaPersistenciaLista = true;
}

let sincronizacionPendiente = null;
function programarSincronizacionAgenda() {
    if (!agendaPersistenciaLista) return;
    clearTimeout(sincronizacionPendiente);
    sincronizacionPendiente = setTimeout(() => fetch("/api/horarios/datos", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obtenerDatos()) }).catch(() => undefined), 250);
}

function obtenerSedes() { return catalogosHorarios.sedes.length ? catalogosHorarios.sedes : obtenerColeccion("sedes"); }
function obtenerSede(id) { return obtenerSedes().find(sede => Number(sede.id) === Number(id)); }
function obtenerTurnos() { return catalogosHorarios.turnos.length ? catalogosHorarios.turnos : obtenerColeccion("turnos"); }
function obtenerTurno(id) { return obtenerTurnos().find(turno => String(turno.id) === String(id)); }

function registrarAuditoriaAgenda(accion, entidad, detalle = {}) {
    return fetch("/api/horarios/auditoria", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, entidad, ...detalle })
    }).catch(() => undefined);
}


/* =========================================================
   INICIALIZAR
========================================================= */

function inicializarStorage() {

    const datosGuardados = localStorage.getItem(STORAGE_KEY);

    if (!datosGuardados) {

        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizarDatos({
            configuracion: {}, sedes: [], turnos: [], areas: [], cargos: [],
            trabajadores: [], permisos: [], excepciones: [], asistencias: [], historial: []
        })));

    }

}


/* =========================================================
   OBTENER DATOS
========================================================= */

function obtenerDatos() {

    const datos = localStorage.getItem(STORAGE_KEY);

    if (!datos) {

        inicializarStorage();

        return normalizarDatos(structuredClone(DATOS_INICIALES));

    }

    return normalizarDatos(JSON.parse(datos));

}

function normalizarDatos(datos) {
    const valoresPorDefecto = {
        areas: [],
        cargos: [],
        sedes: [],
        turnos: [],
        trabajadores: [],
        permisos: [],
        excepciones: [],
        asistencias: [],
        historial: [],
        configuracion: { limiteDescansosPorTurno: 3, tardanzaLeveMaxima: 15 }
    };
    const resultado = { ...valoresPorDefecto, ...datos, configuracion: { ...valoresPorDefecto.configuracion, ...(datos.configuracion || {}) } };
    resultado.sedes = resultado.sedes.map(sede => ({ mesas: 0, observaciones: "", minimosPorArea: {}, ...sede }));
    resultado.turnos = resultado.turnos.map(turno => ({ toleranciaMinutos: 10, ...turno }));
    return resultado;

}


/* =========================================================
   GUARDAR DATOS
========================================================= */

function guardarDatos(datos) {

    localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(datos)

    );

}

function registrarHistorialCambio({
    tipo = "cambio",
    campo = "estado",
    trabajadorId,
    fecha = formatearFechaISO(new Date()),
    usuario = "Sistema",
    valorAnterior = null,
    valorNuevo = null,
    detalle = "",
    idUsuario = 1
}) {
    const historial = obtenerColeccion("historial");

    historial.push({
        id: generarId("historial"),
        id_usuario: Number(idUsuario),
        trabajador_id: Number(trabajadorId),
        fecha_modificada: fecha,
        valor_anterior: valorAnterior,
        valor_nuevo: valorNuevo,
        timestamp: new Date().toISOString(),
        tipo,
        campo,
        trabajadorId: Number(trabajadorId),
        fecha,
        usuario,
        valorAnterior,
        valorNuevo,
        detalle,
        fechaHora: new Date().toISOString()
    });

    actualizarColeccion("historial", historial);
    registrarAuditoriaAgenda(tipo, "historial", { trabajadorId, fecha, detalle });
}


/* =========================================================
   ACTUALIZAR UNA COLECCIÓN
========================================================= */

function actualizarColeccion(nombre, datos) {

    const sistema = obtenerDatos();

    sistema[nombre] = datos;

    guardarDatos(sistema);
    programarSincronizacionAgenda();
    if (typeof renderizarDashboard === "function") renderizarDashboard();

}


/* =========================================================
   OBTENER COLECCIÓN
========================================================= */

function obtenerColeccion(nombre) {

    const datos = obtenerDatos();

    return datos[nombre] || [];

}


/* =========================================================
   GENERAR ID
========================================================= */

function generarId(coleccion) {

    const lista = obtenerColeccion(coleccion);

    if (!lista.length) {

        return 1;

    }

    return Math.max(

        ...lista.map(item => Number(item.id) || 0)

    ) + 1;

}


/* =========================================================
   RESET
========================================================= */

function restaurarDatosIniciales() {

    localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(DATOS_INICIALES)

    );

    location.reload();

}

function generarDatosSemilla() {
    const sedes = [
        { id: 1, nombre: "Sede 17" },
        { id: 2, nombre: "Sede 20" },
        { id: 3, nombre: "Almacén Central" }
    ];

    const turnos = [
        { id: 1, nombre: "Día", horaInicio: "12:00", horaFin: "17:30", toleranciaMinutos: 10 },
        { id: 2, nombre: "Noche", horaInicio: "18:30", horaFin: "00:30", toleranciaMinutos: 10 }
    ];

    const nombres = [
        ["Carlos", "Ramírez"], ["Miguel", "Torres"], ["José", "Quispe"], ["Andrea", "Flores"],
        ["Luis", "Sánchez"], ["María", "Pérez"], ["Renzo", "Castro"], ["Diana", "Vargas"],
        ["Diego", "Mendoza"], ["Sara", "Rojas"], ["Javier", "Cárdenas"], ["Lucía", "Salazar"],
        ["Alberto", "García"], ["Patricia", "Vela"], ["Sebastián", "Silva"], ["Karen", "Duarte"],
        ["Marco", "Ponce"], ["Cecilia", "Nuñez"], ["Daniel", "Rios"], ["Fernanda", "Ortega"],
        ["Felipe", "López"], ["Valeria", "Moya"], ["Óscar", "Aguirre"], ["Natalia", "Ramos"]
    ];

    const trabajadores = [];
    let workerId = 1;

    sedes.forEach((sede, sedeIndex) => {
        turnos.forEach((turno, turnoIndex) => {
            for (let i = 0; i < 4; i++) {
                const [nombre, apellido] = nombres[(sedeIndex * 2 + turnoIndex * 4 + i) % nombres.length];
                const base = i + 1;
                trabajadores.push({
                    id: workerId++,
                    nombre,
                    apellido,
                    dni: String(70000000 + sedeIndex * 10000 + turnoIndex * 1000 + i * 17 + 1).slice(0, 8),
                    telefono: "9" + String(80000000 + sedeIndex * 9000 + turnoIndex * 2000 + i * 123),
                    cargos: [((sedeIndex * 2 + turnoIndex + i) % 8) + 1],
                    areaId: ((sedeIndex + turnoIndex + i) % 6) + 1,
                    sedeId: sede.id,
                    fechaNacimiento: "1990-01-01",
                    fechaIngreso: "2024-01-01",
                    gradoProfesional: "Técnico",
                    profesion: "Operación",
                    direccion: "Lima",
                    emergenciaNumero: "9" + String(70000000 + i * 112),
                    turnoId: turno.id,
                    diaDescanso: (i % 7),
                    estado: "activo"
                });
            }
        });
    });

    return {
        configuracion: {
            empresa: "Organizador de Horarios",
            sedePrincipal: "Sede 17",
            turnoPrincipal: "Día",
            semanaInicio: 1,
            limiteDescansosPorTurno: 3,
            tardanzaLeveMaxima: 15
        },
        sedes: sedes.map((sede, index) => ({
            id: sede.id,
            nombre: sede.nombre,
            direccion: "Dirección " + (index + 1),
            mesas: 0,
            observaciones: "",
            minimosPorArea: {},
            estado: "activo"
        })),
        turnos: turnos.map(turno => ({
            id: turno.id,
            nombre: turno.nombre,
            horaInicio: turno.horaInicio,
            horaFin: turno.horaFin,
            toleranciaMinutos: turno.toleranciaMinutos,
            estado: "activo"
        })),
        areas: [
            { id: 1, nombre: "Cocina", estado: "activo" },
            { id: 2, nombre: "Producción", estado: "activo" },
            { id: 3, nombre: "Salón", estado: "activo" },
            { id: 4, nombre: "Bar", estado: "activo" },
            { id: 5, nombre: "Administración", estado: "activo" },
            { id: 6, nombre: "Marketing", estado: "activo" }
        ],
        cargos: [
            { id: 1, nombre: "Chef", areaId: 1, estado: "activo" },
            { id: 2, nombre: "Ayudante de cocina", areaId: 1, estado: "activo" },
            { id: 3, nombre: "Mozo", areaId: 3, estado: "activo" },
            { id: 4, nombre: "Azafata", areaId: 3, estado: "activo" },
            { id: 5, nombre: "Bartender", areaId: 4, estado: "activo" },
            { id: 6, nombre: "Ayudante de bartender", areaId: 4, estado: "activo" },
            { id: 7, nombre: "Producción", areaId: 2, estado: "activo" },
            { id: 8, nombre: "Administrador", areaId: 5, estado: "activo" }
        ],
        trabajadores,
        permisos: [],
        excepciones: [],
        asistencias: [],
        historial: [],
        reportes: []
    };
}


/* =========================================================
   EXPORTAR
========================================================= */

function exportarDatos() {

    const datos = obtenerDatos();

    const archivo = new Blob(

        [JSON.stringify(datos, null, 4)],

        {
            type: "application/json"
        }

    );

    const url = URL.createObjectURL(archivo);

    const enlace = document.createElement("a");

    enlace.href = url;

    enlace.download =

        `organizador-horarios-${new Date()
            .toISOString()
            .slice(0, 10)}.json`;

    enlace.click();

    URL.revokeObjectURL(url);

}


/* =========================================================
   IMPORTAR
========================================================= */

function importarDatos(archivo) {

    const lector = new FileReader();

    lector.onload = function(event) {

        try {

            const datos = JSON.parse(

                event.target.result

            );

            guardarDatos(datos);
            programarSincronizacionAgenda();

            location.reload();

        } catch (error) {

            alert(

                "El archivo no contiene datos válidos."

            );

        }

    };

    lector.readAsText(archivo);

}


/* =========================================================
   INICIO
========================================================= */

inicializarStorage();