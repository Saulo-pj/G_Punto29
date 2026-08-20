/* =========================================================
   TRABAJADORES
========================================================= */


/* =========================================================
   OBTENER TRABAJADORES
========================================================= */

function obtenerTrabajadores() {

    const trabajadores = obtenerColeccion("trabajadores");
    const scope = window.AGENDA_SCOPE || {};
    if (scope.role === "admin_general") return trabajadores;
    return trabajadores.filter(trabajador =>
        Number(trabajador.sedeId) === Number(scope.sedeId)
        && Number(trabajador.turnoId) === Number(scope.turnoId)
    );

}


/* =========================================================
   BUSCAR TRABAJADOR
========================================================= */

function obtenerTrabajador(id) {

    return obtenerTrabajadores()

        .find(t => Number(t.id) === Number(id));

}


/* =========================================================
   NOMBRE COMPLETO
========================================================= */

function nombreCompleto(trabajador) {

    return `${trabajador.nombre} ${trabajador.apellido}`;

}


/* =========================================================
   OBTENER CARGOS
========================================================= */

function obtenerNombresCargos(trabajador) {

    const cargos = obtenerColeccion("cargos");

    return trabajador.cargos

        .map(id => {

            const cargo = cargos.find(

                c => Number(c.id) === Number(id)

            );

            return cargo ? cargo.nombre : "";

        })

        .filter(Boolean)

        .join(", ");

}


/* =========================================================
   AGREGAR TRABAJADOR
========================================================= */

function agregarTrabajador(datos) {

    const trabajadores = obtenerTrabajadores();

    const nuevoTrabajador = {

        id: generarId("trabajadores"),

        ...datos,

        estado: "activo"

    };

    trabajadores.push(nuevoTrabajador);

    actualizarColeccion(

        "trabajadores",

        trabajadores

    );

    return nuevoTrabajador;

}


/* =========================================================
   EDITAR TRABAJADOR
========================================================= */

function editarTrabajador(id, cambios) {

    const trabajadores = obtenerTrabajadores();

    const indice = trabajadores.findIndex(

        t => Number(t.id) === Number(id)

    );

    if (indice === -1) {

        return false;

    }

    trabajadores[indice] = {

        ...trabajadores[indice],

        ...cambios

    };

    actualizarColeccion(

        "trabajadores",

        trabajadores

    );

    return true;

}


/* =========================================================
   CAMBIAR ESTADO
========================================================= */

function cambiarEstadoTrabajador(id) {

    const trabajador = obtenerTrabajador(id);

    if (!trabajador) return false;

    editarTrabajador(

        id,

        {

            estado:

                trabajador.estado === "activo"

                    ? "inactivo"

                    : "activo"

        }

    );

    return true;

}


/* =========================================================
   CAMBIAR SEDE PERMANENTE
========================================================= */

function cambiarSedePermanente(

    trabajadorId,

    nuevaSedeId

) {

    const trabajador = obtenerTrabajador(

        trabajadorId

    );

    if (!trabajador) return false;

    const sedeAnteriorId = trabajador.sedeId;
    editarTrabajador(

        trabajadorId,

        {

            sedeId: Number(nuevaSedeId)

        }

    );

    actualizarColeccion("historial", [...obtenerColeccion("historial"), {
        id: generarId("historial"),
        fecha: new Date().toISOString(),
        tipo: "cambio_sede_permanente",
        trabajadorId: trabajador.id,
        datoAnterior: sedeAnteriorId,
        datoNuevo: Number(nuevaSedeId),
        motivo: "Cambio permanente de sede"
    }]);

    return true;

}


/* =========================================================
   CAMBIAR TURNO POR DEFECTO
========================================================= */

function cambiarTurnoPermanente(

    trabajadorId,

    nuevoTurnoId

) {

    return editarTrabajador(

        trabajadorId,

        {

            turnoId: Number(nuevoTurnoId)

        }

    );

}


/* =========================================================
   CAMBIAR DESCANSO GENERAL
========================================================= */

function cambiarDescansoGeneral(

    trabajadorId,

    dia

) {

    return editarTrabajador(

        trabajadorId,

        {

            diaDescanso: Number(dia)

        }

    );

}


/* =========================================================
   ELIMINAR
========================================================= */

function eliminarTrabajador(id) {

    const trabajadores =

        obtenerTrabajadores()

            .filter(

                t => Number(t.id) !== Number(id)

            );

    actualizarColeccion(

        "trabajadores",

        trabajadores

    );

}


/* =========================================================
   FILTRAR
========================================================= */

function filtrarTrabajadores({

    texto = "",

    sedeId = "",

    turnoId = "",

    areaId = "",

    estado = "activo"

} = {}) {

    let trabajadores = obtenerTrabajadores();

    if (estado) {

        trabajadores = trabajadores.filter(

            t => t.estado === estado

        );

    }

    if (texto) {

        const busqueda =

            texto.toLowerCase().trim();

        trabajadores = trabajadores.filter(t =>

            nombreCompleto(t)

                .toLowerCase()

                .includes(busqueda)

            ||

            t.dni.includes(busqueda)

        );

    }

    if (sedeId) {

        trabajadores = trabajadores.filter(

            t => Number(t.sedeId) === Number(sedeId)

        );

    }

    if (turnoId) {

        trabajadores = trabajadores.filter(

            t => Number(t.turnoId) === Number(turnoId)

        );

    }

    if (areaId) {

        trabajadores = trabajadores.filter(

            t => Number(t.areaId) === Number(areaId)

        );

    }

    return trabajadores;

}