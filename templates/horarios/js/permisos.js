/* =========================================================
   PERMISOS Y EXCEPCIONES
========================================================= */

const TIPOS_AUSENCIA = [

    "Descanso",

    "Permiso",

    "Falta",

    "Vacaciones",

    "Suspensión",

    "Incapacidad",

    "Otro"

];


/* =========================================================
   OBTENER PERMISOS
========================================================= */

function obtenerPermisos() {

    return obtenerColeccion("permisos");

}


/* =========================================================
   BUSCAR PERMISO POR FECHA
========================================================= */

function obtenerPermisoTrabajadorFecha(

    trabajadorId,

    fecha

) {

    return obtenerPermisos().find(p =>

        Number(p.trabajadorId) === Number(trabajadorId)

        &&

        fecha >= p.fechaInicio

        &&

        fecha <= p.fechaFin

    );

}


/* =========================================================
   REGISTRAR PERMISO
========================================================= */

function registrarPermiso({

    trabajadorId,

    fechaInicio,

    fechaFin,

    tipo,

    motivo = ""

}) {

    if (!TIPOS_AUSENCIA.includes(tipo)) {

        throw new Error(

            "Tipo de permiso no válido."

        );

    }

    if (

        tipo === "Permiso"

        &&

        !motivo.trim()

    ) {

        throw new Error(

            "El permiso necesita un motivo."

        );

    }

    const permisos = obtenerPermisos();

    const nuevo = {

        id: generarId("permisos"),

        trabajadorId: Number(trabajadorId),

        fechaInicio,

        fechaFin,

        tipo,

        motivo: motivo.trim()

    };

    permisos.push(nuevo);

    actualizarColeccion(

        "permisos",

        permisos

    );

    return nuevo;

}


/* =========================================================
   ELIMINAR PERMISO
========================================================= */

function eliminarPermiso(id) {

    const permisos = obtenerPermisos()

        .filter(

            p => Number(p.id) !== Number(id)

        );

    actualizarColeccion(

        "permisos",

        permisos

    );

}


/* =========================================================
   EXCEPCIONES
========================================================= */


/*
   Tipos:

   apoyo
   doblete
   cambio_turno
   cambio_descanso
*/


function obtenerExcepciones() {

    return obtenerColeccion("excepciones");

}

function registrarEstadoDia({ trabajadorId, fecha, estado, sedeId, turnoId, motivo = "" }) {
    const excepciones = obtenerExcepciones().filter(item => !(Number(item.trabajadorId) === Number(trabajadorId) && item.fecha === fecha && item.tipo === "estado_dia"));
    excepciones.push({ id: generarId("excepciones"), trabajadorId: Number(trabajadorId), fecha, tipo: "estado_dia", estado, sedeId: Number(sedeId), turnoId: Number(turnoId), motivo });
    actualizarColeccion("excepciones", excepciones);
}

function confirmarApoyo(id, confirmadoPor = "Sede destino") {
    const excepciones = obtenerExcepciones();
    const apoyo = excepciones.find(item => Number(item.id) === Number(id) && item.tipo === "apoyo");
    if (!apoyo) return false;
    apoyo.confirmado = true;
    apoyo.confirmadoPor = confirmadoPor;
    apoyo.confirmadoEn = new Date().toISOString();
    actualizarColeccion("excepciones", excepciones);
    return true;
}


/* =========================================================
   REGISTRAR APOYO
========================================================= */

function registrarApoyo({

    trabajadorId,

    fecha,

    sedeId,

    turnoId,

    motivo = "",

    confirmado = false

}) {

    const excepciones = obtenerExcepciones();

    const nueva = {

        id: generarId("excepciones"),

        trabajadorId: Number(trabajadorId),

        fecha,

        tipo: "apoyo",

        sedeId: Number(sedeId),

        turnoId: Number(turnoId),

        motivo,

        confirmado

    };

    excepciones.push(nueva);

    actualizarColeccion(

        "excepciones",

        excepciones

    );

    return nueva;

}


/* =========================================================
   REGISTRAR DOBLETE
========================================================= */

function registrarDoblete({

    trabajadorId,

    fecha,

    turnoExtraId,

    sedeId,

    motivo = ""

}) {

    const excepciones = obtenerExcepciones().filter(item => !(Number(item.trabajadorId) === Number(trabajadorId) && item.fecha === fecha && item.tipo === "doblete"));

    const nueva = {

        id: generarId("excepciones"),

        trabajadorId: Number(trabajadorId),

        fecha,

        tipo: "doblete",

        sedeId: Number(sedeId),

        turnoId: Number(turnoExtraId),

        motivo

    };

    excepciones.push(nueva);

    actualizarColeccion(

        "excepciones",

        excepciones

    );

    return nueva;

}


/* =========================================================
   CAMBIO DE DESCANSO
========================================================= */

function cambiarDescansoSemana({

    trabajadorId,

    fecha,

    motivo = ""

}) {

    const excepciones =

        obtenerExcepciones();

    const nueva = {

        id: generarId("excepciones"),

        trabajadorId: Number(trabajadorId),

        fecha,

        tipo: "cambio_descanso",

        motivo

    };

    excepciones.push(nueva);

    actualizarColeccion(

        "excepciones",

        excepciones

    );

    return nueva;

}


/* =========================================================
   CAMBIO DE TURNO POR UN DÍA
========================================================= */

function cambiarTurnoDia({

    trabajadorId,

    fecha,

    turnoId,

    sedeId,

    motivo = ""

}) {

    const excepciones =

        obtenerExcepciones();

    const nueva = {

        id: generarId("excepciones"),

        trabajadorId: Number(trabajadorId),

        fecha,

        tipo: "cambio_turno",

        turnoId: Number(turnoId),

        sedeId: Number(sedeId),

        motivo

    };

    excepciones.push(nueva);

    actualizarColeccion(

        "excepciones",

        excepciones

    );

    return nueva;

}