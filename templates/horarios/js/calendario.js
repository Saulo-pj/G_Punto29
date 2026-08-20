/* =========================================================
   CALENDARIO
========================================================= */

let fechaCalendario = new Date();

let modoCalendario = "mes";

let agendaTurnoSeleccionado = "day";

function obtenerFiltroAgenda() {
    const sedeId = Number(document.querySelector("#agendaSedeFilter")?.value || 0);
    const turnos = obtenerTurnos().filter(turno => turno.estado === "activo");
    const turno = turnos.find(item => agendaTurnoSeleccionado === "night"
        ? item.nombre.toLowerCase().includes("noche")
        : !item.nombre.toLowerCase().includes("noche"));
    return { sedeId, turnoId: turno?.id || 0 };
}

function obtenerTrabajadoresAgendaDelDia(fecha) {
    const filtro = obtenerFiltroAgenda();
    return obtenerTrabajadoresDelDia(fecha).filter(item => {
        const horario = item.horario;
        return (!filtro.sedeId || Number(horario.sedeId) === filtro.sedeId)
            && (!filtro.turnoId || Number(horario.turnoId) === Number(filtro.turnoId));
    });
}

function contarTrabajadoresAgendaDelDia(fecha) {
    const filtro = obtenerFiltroAgenda();
    const resumen = { total: 0, dia: 0, noche: 0, dobletes: 0, apoyos: 0, permisos: 0, faltas: 0, vacaciones: 0 };
    obtenerTrabajadoresAgendaDelDia(fecha).forEach(item => {
        const horario = item.horario;
        if (horario.estado === "trabaja") resumen.total++;
        if (horario.turno?.toLowerCase() === "día" && horario.estado === "trabaja") resumen.dia++;
        if (horario.turno?.toLowerCase() === "noche" && horario.estado === "trabaja") resumen.noche++;
        if (horario.doblete) resumen.dobletes++;
        if (horario.tipo === "apoyo") resumen.apoyos++;
        if (horario.estado === "permiso") resumen.permisos++;
        if (horario.estado === "falta") resumen.faltas++;
        if (horario.estado === "vacaciones") resumen.vacaciones++;
    });
    return resumen;
}


/* =========================================================
   NOMBRES
========================================================= */

const NOMBRES_MESES = [

    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"

];

const NOMBRES_DIAS = [

    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado"

];


/* =========================================================
   CAMBIAR MES
========================================================= */

function cambiarMes(cantidad) {

    fechaCalendario.setMonth(

        fechaCalendario.getMonth() +

        cantidad

    );

    renderizarCalendario();

}


/* =========================================================
   IR A HOY
========================================================= */

function irAHoy() {

    fechaCalendario = new Date();

    renderizarCalendario();

}


/* =========================================================
   OBTENER DÍAS DEL MES
========================================================= */

function obtenerDiasMes(

    year,

    month

) {

    const primerDia = new Date(

        year,

        month,

        1

    );

    const ultimoDia = new Date(

        year,

        month + 1,

        0

    );


    return {

        diasMes: ultimoDia.getDate(),

        primerDiaSemana:

            primerDia.getDay(),

        diasAnterior:

            new Date(

                year,

                month,

                0

            ).getDate()

    };

}


/* =========================================================
   RENDER CALENDARIO
========================================================= */

function renderizarCalendario() {

    if (modoCalendario === "semana") {

        renderizarSemana();

        return;

    }


    const contenedor =

        document.querySelector(

            "#calendarGrid"

        );

    if (!contenedor) return;


    const year =

        fechaCalendario.getFullYear();

    const month =

        fechaCalendario.getMonth();


    const datos =

        obtenerDiasMes(

            year,

            month

        );


    const totalCeldas = 42;

    let html = "";


    for (

        let i = 0;

        i < totalCeldas;

        i++

    ) {

        let numeroDia;

        let mesDia = month;

        let yearDia = year;

        let clase = "";


        if (

            i <

            datos.primerDiaSemana

        ) {

            numeroDia =

                datos.diasAnterior -

                datos.primerDiaSemana +

                i +

                1;

            mesDia--;

            clase = "other-month";

        }

        else if (

            i >=

            datos.primerDiaSemana +

            datos.diasMes

        ) {

            numeroDia =

                i -

                datos.primerDiaSemana -

                datos.diasMes +

                1;

            mesDia++;

            clase = "other-month";

        }

        else {

            numeroDia =

                i -

                datos.primerDiaSemana +

                1;

        }


        const fecha = new Date(

            yearDia,

            mesDia,

            numeroDia

        );


        const fechaISO =

            formatearFechaISO(

                fecha

            );


        const hoy =

            formatearFechaISO(

                new Date()

            );


        if (fechaISO === hoy) {

            clase += " today";

        }


        const resumen =

            contarTrabajadoresAgendaDelDia(

                fechaISO

            );


        html += `

            <div

                class="calendar-day ${clase}"

                data-fecha="${fechaISO}"

                onclick="abrirDetalleDia('${fechaISO}')"

            >

                <div class="day-number">

                    ${numeroDia}

                </div>


                <div class="day-worker-count">

                    <i class="fa-solid fa-users"></i>

                    <span>

                        ${resumen.total}

                        trabajadores

                    </span>

                </div>


                <div class="day-mini-stats">

                    <span class="mini-stat day">

                        D ${resumen.dia}

                    </span>


                    <span class="mini-stat night">

                        N ${resumen.noche}

                    </span>


                    ${

                        resumen.dobletes

                            ? `

                            <span class="mini-stat double">

                                +${resumen.dobletes}

                            </span>

                            `

                            : ""

                    }

                </div>


                <div class="day-events">

                    ${

                        resumen.apoyos

                            ? `

                            <div class="day-event support">

                                ${resumen.apoyos}

                                apoyo(s)

                            </div>

                            `

                            : ""

                    }


                    ${

                        resumen.permisos

                            ? `

                            <div class="day-event permission">

                                ${resumen.permisos}

                                permiso(s)

                            </div>

                            `

                            : ""

                    }


                    ${

                        resumen.vacaciones

                            ? `

                            <div class="day-event vacation">

                                ${resumen.vacaciones}

                                vacaciones

                            </div>

                            `

                            : ""

                    }


                    ${

                        resumen.faltas

                            ? `

                            <div class="day-event absence">

                                ${resumen.faltas}

                                falta(s)

                            </div>

                            `

                            : ""

                    }

                </div>

            </div>

        `;

    }


    contenedor.innerHTML = html;


    actualizarTituloCalendario();

}


/* =========================================================
   TITULO
========================================================= */

function actualizarTituloCalendario() {

    const elemento =

        document.querySelector(

            "#calendarMonth"

        );


    if (!elemento) return;


    elemento.textContent =

        `${NOMBRES_MESES[

            fechaCalendario.getMonth()

        ]} ${

            fechaCalendario.getFullYear()

        }`;

}


/* =========================================================
   CAMBIAR MODO
========================================================= */

function cambiarModoCalendario(modo) {

    modoCalendario = modo;

    document.querySelector("#monthlyCalendar")?.classList.toggle("hidden", modo !== "mes");
    document.querySelector("#weeklyCalendar")?.classList.toggle("hidden", modo !== "semana");

    renderizarCalendario();

}


/* =========================================================
   SEMANA ACTUAL
========================================================= */

function obtenerInicioSemana(fecha) {

    const nuevaFecha = new Date(fecha);

    const dia = nuevaFecha.getDay();

    const diferencia =

        dia === 0

            ? -6

            : 1 - dia;


    nuevaFecha.setDate(

        nuevaFecha.getDate() +

        diferencia

    );


    return nuevaFecha;

}


/* =========================================================
   RENDER SEMANA
========================================================= */

function renderizarSemana() {

    const contenedor =

        document.querySelector(

            "#weeklyCalendar"

        );

    if (!contenedor) return;


    const inicio =

        obtenerInicioSemana(

            fechaCalendario

        );


    const filtro = obtenerFiltroAgenda();
    const trabajadores = obtenerTrabajadores().filter(t => t.estado === "activo"
        && (!filtro.sedeId || Number(t.sedeId) === filtro.sedeId)
        && (!filtro.turnoId || Number(t.turnoId) === Number(filtro.turnoId)));


    let html = `

        <div class="weekly-calendar">

            <div class="week-table">

                <div class="week-table-header">

                    <div class="worker-column">

                        Trabajador

                    </div>

    `;


    for (let i = 0; i < 7; i++) {

        const fecha = new Date(inicio);

        fecha.setDate(

            inicio.getDate() + i

        );


        const iso =

            formatearFechaISO(fecha);


        const esHoy =

            iso ===

            formatearFechaISO(

                new Date()

            );


        html += `

            <div class="${

                esHoy

                    ? "current-day"

                    : ""

            }">

                <span>

                    ${

                        NOMBRES_DIAS[

                            fecha.getDay()

                        ].slice(0, 3)

                    }

                </span>

                <strong>

                    ${fecha.getDate()}

                </strong>

            </div>

        `;

    }


    html += `

                </div>

                <div class="week-table-body">

    `;


    trabajadores.forEach(trabajador => {

        html += `

            <div class="week-worker-row">

                <div class="week-worker-name">

                    <div class="week-worker-avatar">

                        ${

                            trabajador.nombre

                                .charAt(0)

                            +

                            trabajador.apellido

                                .charAt(0)

                        }

                    </div>

                    <div>

                        <strong>

                            <button class="worker-name-button" type="button" onclick="abrirPerfilTrabajador(${trabajador.id})">${nombreCompleto(trabajador)}</button>

                        </strong>

                        <small>

                            ${

                                obtenerNombresCargos(

                                    trabajador

                                )

                            }

                        </small>

                    </div>

                </div>

        `;


        for (let i = 0; i < 7; i++) {

            const fecha = new Date(inicio);

            fecha.setDate(

                inicio.getDate() + i

            );


            const iso =

                formatearFechaISO(

                    fecha

                );


            const horario =

                obtenerHorarioReal(

                    trabajador.id,

                    iso

                );


            html +=

                crearCeldaSemanal(

                    horario,

                    iso

                );

        }


        html += `

            </div>

        `;

    });


    html += `

                </div>

            </div>

        </div>

    `;


    contenedor.innerHTML = html;
    contenedor.classList.remove("hidden");


    actualizarTituloSemana(inicio);

}


/* =========================================================
   CELDA SEMANAL
========================================================= */

function crearCeldaSemanal(

    horario,

    fecha

) {

    if (!horario) {

        return `

            <div class="week-day-cell">

                -

            </div>

        `;

    }


    let contenido = "";
    const estadoVisual = obtenerEstadoVisualAgenda(horario);


    if (estadoVisual === "doblete") {
        contenido = `
            <div class="week-shift double">DOBLETE · ${horario.doblete.turno}</div>
        `;
    } else if (estadoVisual === "apoyo") {
        contenido = `
            <div class="week-shift support">APOYO · ${horario.turno}</div>
        `;
    } else if (estadoVisual === "cambio_turno") {
        contenido = `
            <div class="week-shift change-turn">CAMBIO · ${horario.turno}</div>
        `;
    } else if (estadoVisual === "descanso") {

        contenido = `

            <div class="week-shift rest">

                DESCANSO

            </div>

        `;

    }

    else if (estadoVisual !== "trabaja") {

        contenido = `

            <div class="week-shift ${

                horario.estado ===

                "permiso"

                    ? "permission"

                    : horario.estado ===

                      "vacaciones"

                        ? "vacation"

                        : "absence"

            }">

                ${estadoVisual.toUpperCase()}

            </div>

        `;

    }

    else {

        const clase =

            horario.turno

                ?.toLowerCase() ===

            "noche"

                ? "night"

                : "day";


        contenido = `

            <div class="week-shift ${clase}">

                ${horario.turno}

                ·

                ${horario.horaInicio}

                -

                ${horario.horaFin}

            </div>

        `;

    }


    return `

        <div

            class="week-day-cell"

            onclick="abrirDetalleDia('${fecha}')"

        >

            ${contenido}

            <div class="week-location">

                ${horario.sede || ""}

            </div>

        </div>

    `;

}


/* =========================================================
   TITULO SEMANAL
========================================================= */

function actualizarTituloSemana(inicio) {

    const elemento =

        document.querySelector(

            "#calendarMonth"

        );


    if (!elemento) return;


    const fin = new Date(inicio);

    fin.setDate(

        inicio.getDate() + 6

    );


    elemento.textContent =

        `${inicio.getDate()} ${

            NOMBRES_MESES[

                inicio.getMonth()

            ]

        } -

        ${fin.getDate()} ${

            NOMBRES_MESES[

                fin.getMonth()

            ]

        } ${fin.getFullYear()}`;

}


/* =========================================================
   DETALLE DEL DÍA
========================================================= */

function abrirDetalleDia(fecha) {

    if (

        typeof window

            .abrirModalDetalleDia ===

        "function"

    ) {

        window.abrirModalDetalleDia(

            fecha

        );

        return;

    }


    console.log(

        "Detalle del día:",

        fecha

    );

}


/* =========================================================
   INICIO
========================================================= */

document.addEventListener(

    "DOMContentLoaded",

    function() {

        renderizarCalendario();

    }

);