/* =========================================================
   HORARIOS
========================================================= */


/* =========================================================
   OBTENER EXCEPCIÓN
========================================================= */

function obtenerExcepcion(

    trabajadorId,

    fecha,

    tipo = null

) {

    const excepciones =

        obtenerExcepciones();

    return excepciones.find(e =>

        Number(e.trabajadorId) === Number(trabajadorId)

        &&

        e.fecha === fecha

        &&

        (!tipo || e.tipo === tipo)

    );

}


/* =========================================================
   OBTENER HORARIO REAL
========================================================= */

function obtenerHorarioReal(

    trabajadorId,

    fecha

) {

    const trabajador =

        obtenerTrabajador(trabajadorId);

    if (!trabajador) {

        return null;

    }


    const sede =

        obtenerSede(trabajador.sedeId);

    const turno =

        obtenerTurno(trabajador.turnoId);


    let resultado = {

        trabajadorId: trabajador.id,

        fecha,

        sedeId: trabajador.sedeId,

        sede: sede?.nombre || "",

        turnoId: trabajador.turnoId,

        turno: turno?.nombre || "",

        horaInicio: turno?.horaInicio || "",

        horaFin: turno?.horaFin || "",

        estado: "trabaja",

        tipo: "normal",

        motivo: ""

    };


    /* =====================================================
       DESCANSO GENERAL
    ===================================================== */

    const fechaObj = new Date(

        `${fecha}T00:00:00`

    );

    const diaSemana = fechaObj.getDay();


    /*
        JavaScript:

        0 = Domingo
        1 = Lunes
        2 = Martes
        ...
        6 = Sábado
    */

    if (

        Number(trabajador.diaDescanso)

        ===

        Number(diaSemana)

    ) {

        resultado.estado = "descanso";

        resultado.tipo = "descanso";

    }

    const estadoDia = obtenerExcepcion(trabajadorId, fecha, "estado_dia");
    if (estadoDia) {
        resultado.estado = estadoDia.estado;
        resultado.tipo = estadoDia.estado;
        resultado.sedeId = estadoDia.sedeId || resultado.sedeId;
        resultado.turnoId = estadoDia.turnoId || resultado.turnoId;
        resultado.motivo = estadoDia.motivo || "";
        const sedeEstado = obtenerSede(resultado.sedeId);
        const turnoEstado = obtenerTurno(resultado.turnoId);
        resultado.sede = sedeEstado?.nombre || resultado.sede;
        resultado.turno = turnoEstado?.nombre || resultado.turno;
        resultado.horaInicio = turnoEstado?.horaInicio || resultado.horaInicio;
        resultado.horaFin = turnoEstado?.horaFin || resultado.horaFin;
    }


    /* =====================================================
       PERMISO
    ===================================================== */

    const permiso =

        obtenerPermisoTrabajadorFecha(

            trabajadorId,

            fecha

        );

    if (permiso) {

        resultado.estado =

            permiso.tipo.toLowerCase();

        resultado.tipo = "ausencia";

        resultado.motivo =

            permiso.motivo || "";

    }


    /* =====================================================
       CAMBIO DE DESCANSO
    ===================================================== */

    const cambioDescanso =

        obtenerExcepcion(

            trabajadorId,

            fecha,

            "cambio_descanso"

        );

    if (cambioDescanso) {

        resultado.estado = "descanso";

        resultado.tipo = "descanso";

        resultado.motivo =

            cambioDescanso.motivo || "";

    }


    /* =====================================================
       CAMBIO DE TURNO
    ===================================================== */

    const cambioTurno =

        obtenerExcepcion(

            trabajadorId,

            fecha,

            "cambio_turno"

        );

    if (cambioTurno) {

        const nuevoTurno =

            obtenerTurno(

                cambioTurno.turnoId

            );

        const nuevaSede =

            obtenerSede(

                cambioTurno.sedeId

            );

        resultado.turnoId =

            cambioTurno.turnoId;

        resultado.turno =

            nuevoTurno?.nombre || "";

        resultado.horaInicio =

            nuevoTurno?.horaInicio || "";

        resultado.horaFin =

            nuevoTurno?.horaFin || "";

        resultado.sedeId =

            cambioTurno.sedeId;

        resultado.sede =

            nuevaSede?.nombre || "";

        resultado.estado = "trabaja";

        resultado.tipo = "cambio_turno";

        resultado.motivo =

            cambioTurno.motivo || "";

    }


    /* =====================================================
       APOYO
    ===================================================== */

    const apoyo =

        obtenerExcepcion(

            trabajadorId,

            fecha,

            "apoyo"

        );

    if (apoyo) {

        const turnoApoyo =

            obtenerTurno(

                apoyo.turnoId

            );

        const sedeApoyo =

            obtenerSede(

                apoyo.sedeId

            );

        resultado.turnoId =

            apoyo.turnoId;

        resultado.turno =

            turnoApoyo?.nombre || "";

        resultado.horaInicio =

            turnoApoyo?.horaInicio || "";

        resultado.horaFin =

            turnoApoyo?.horaFin || "";

        resultado.sedeId =

            apoyo.sedeId;

        resultado.sede =

            sedeApoyo?.nombre || "";

        resultado.estado = "trabaja";

        resultado.tipo = "apoyo";

        resultado.apoyoId = apoyo.id;

        resultado.apoyoConfirmado = apoyo.confirmado === true;

        resultado.motivo =

            apoyo.motivo || "";

    }


    /* =====================================================
       DOBLETE
    ===================================================== */

    const doblete =

        obtenerExcepcion(

            trabajadorId,

            fecha,

            "doblete"

        );

    if (doblete) {

        const turnoExtra =

            obtenerTurno(

                doblete.turnoId

            );

        const sedeExtra =

            obtenerSede(

                doblete.sedeId

            );

        resultado.doblete = {

            turnoId: doblete.turnoId,

            turno:

                turnoExtra?.nombre || "",

            horaInicio:

                turnoExtra?.horaInicio || "",

            horaFin:

                turnoExtra?.horaFin || "",

            sedeId: doblete.sedeId,

            sede:

                sedeExtra?.nombre || ""

        };

    }


    return resultado;

}

function obtenerEstadoVisualAgenda(horario) {
    if (!horario) return "sin_estado";
    if (horario.doblete) return "doblete";
    if (horario.tipo === "apoyo") return "apoyo";
    if (horario.tipo === "cambio_turno") return "cambio_turno";
    return horario.estado || "trabaja";
}


/* =========================================================
   OBTENER TRABAJADORES DEL DÍA
========================================================= */

function obtenerTrabajadoresDelDia(fecha) {

    const trabajadores =

        obtenerTrabajadores()

            .filter(

                t => t.estado === "activo"

            );


    return trabajadores.map(trabajador => ({

        trabajador,

        horario:

            obtenerHorarioReal(

                trabajador.id,

                fecha

            )

    }));

}


/* =========================================================
   CONTAR TRABAJADORES DEL DÍA
========================================================= */

function contarTrabajadoresDelDia(fecha) {

    const trabajadores =

        obtenerTrabajadoresDelDia(fecha);


    const resultado = {

        total: 0,

        dia: 0,

        noche: 0,

        dobletes: 0,

        descansos: 0,

        permisos: 0,

        faltas: 0,

        vacaciones: 0,

        suspensiones: 0,

        incapacidades: 0,

        apoyos: 0

    };


    trabajadores.forEach(item => {

        const horario = item.horario;


        if (

            horario.estado ===

            "trabaja"

        ) {

            resultado.total++;

        }


        if (

            horario.turno

                ?.toLowerCase() ===

            "día"

        ) {

            if (

                horario.estado ===

                "trabaja"

            ) {

                resultado.dia++;

            }

        }


        if (

            horario.turno

                ?.toLowerCase() ===

            "noche"

        ) {

            if (

                horario.estado ===

                "trabaja"

            ) {

                resultado.noche++;

            }

        }


        if (horario.doblete) {

            resultado.dobletes++;

        }


        if (

            horario.estado ===

            "descanso"

        ) {

            resultado.descansos++;

        }


        if (

            horario.estado ===

            "permiso"

        ) {

            resultado.permisos++;

        }


        if (

            horario.estado ===

            "falta"

        ) {

            resultado.faltas++;

        }


        if (

            horario.estado ===

            "vacaciones"

        ) {

            resultado.vacaciones++;

        }


        if (

            horario.estado ===

            "suspensión"

        ) {

            resultado.suspensiones++;

        }


        if (

            horario.estado ===

            "incapacidad"

        ) {

            resultado.incapacidades++;

        }


        if (

            horario.tipo ===

            "apoyo"

        ) {

            resultado.apoyos++;

        }

    });


    return resultado;

}


/* =========================================================
   OBTENER RESUMEN DE UNA SEMANA
========================================================= */

function obtenerResumenSemana(fechaInicio) {

    const resultado = [];

    const inicio = new Date(

        `${fechaInicio}T00:00:00`

    );


    for (let i = 0; i < 7; i++) {

        const fecha = new Date(inicio);

        fecha.setDate(

            inicio.getDate() + i

        );

        const fechaTexto =

            formatearFechaISO(fecha);


        resultado.push({

            fecha: fechaTexto,

            ...contarTrabajadoresDelDia(

                fechaTexto

            )

        });

    }


    return resultado;

}


/* =========================================================
   FECHA ISO
========================================================= */

function formatearFechaISO(fecha) {

    const year = fecha.getFullYear();

    const month = String(

        fecha.getMonth() + 1

    ).padStart(2, "0");

    const day = String(

        fecha.getDate()

    ).padStart(2, "0");


    return `${year}-${month}-${day}`;

}

function obtenerAlertasPlanificacion(fecha) {
    const alertas = [];
    const trabajadores = obtenerTrabajadores().filter(trabajador => trabajador.estado === "activo");
    const sedes = obtenerSedes().filter(sede => sede.estado === "activo");
    const turnos = obtenerTurnos().filter(turno => turno.estado === "activo");
    const limiteDescansos = Number(obtenerDatos().configuracion?.limiteDescansosPorTurno || 3);

    sedes.forEach(sede => {
        turnos.forEach(turno => {
            const grupo = trabajadores.filter(trabajador => Number(trabajador.sedeId) === Number(sede.id) && Number(trabajador.turnoId) === Number(turno.id));
            const descansos = grupo.filter(trabajador => obtenerHorarioReal(trabajador.id, fecha)?.estado === "descanso").length;
            if (descansos > limiteDescansos) alertas.push({ tipo: "descansos", nivel: "warning", texto: `${sede.nombre} · ${turno.nombre}: ${descansos} descansos, supera el límite de ${limiteDescansos}.` });

            const porArea = {};
            grupo.forEach(trabajador => {
                const horario = obtenerHorarioReal(trabajador.id, fecha);
                if (horario?.estado === "trabaja") porArea[trabajador.areaId] = (porArea[trabajador.areaId] || 0) + 1;
            });
            obtenerColeccion("areas").forEach(area => {
                const minimo = Number(sede.minimosPorArea?.[area.id] || 0);
                const presentes = porArea[area.id] || 0;
                if (minimo > 0 && presentes < minimo) alertas.push({ tipo: "minimo", nivel: "danger", texto: `${sede.nombre} · ${turno.nombre} · ${area.nombre}: faltan ${minimo - presentes} personas.` });
            });
        });
    });
    return alertas;
}