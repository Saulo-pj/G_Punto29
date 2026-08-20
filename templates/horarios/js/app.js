/* =========================================================
   APP PRINCIPAL
========================================================= */


/* =========================================================
   INICIO
========================================================= */

document.addEventListener(

    "DOMContentLoaded",

    () => {

        inicializarAplicacion();

    }

);


/* =========================================================
   INICIALIZAR
========================================================= */

async function inicializarAplicacion() {

    try {
        await cargarCatalogosHorarios();
        await sincronizarAgendaConServidor();
    } catch (error) {
        console.error(error);
    }

    inicializarNavegacion();

    inicializarMenuAgenda();

    inicializarBotones();

    inicializarFiltros();

    inicializarModal();

    renderizarTodo();

    aplicarAlcanceAgenda();

}


/* =========================================================
   RENDER GENERAL
========================================================= */

function renderizarTodo() {

    renderizarCalendario();

    renderizarTrabajadores();

    renderizarSedes();

    renderizarTurnos();

    renderizarDashboard();

    renderizarAsistencia();

    renderizarCatalogoCargosAreas();

}


/* =========================================================
   NAVEGACIÓN
========================================================= */

function inicializarNavegacion() {

    const botones =

        document.querySelectorAll(

            "[data-section]"

        );


    botones.forEach(boton => {

        boton.addEventListener(

            "click",

            () => {

                cambiarSeccion(

                    boton.dataset.section

                );

            }

        );

    });

    document.querySelectorAll("[data-section-button]").forEach(boton => {
        boton.addEventListener("click", () => cambiarSeccion(boton.dataset.sectionButton));
    });

}


/* =========================================================
   CAMBIAR SECCIÓN
========================================================= */

function cambiarSeccion(nombre) {

    document

        .querySelectorAll(

            ".page-section"

        )

        .forEach(seccion => {

            seccion.classList.remove(

                "active"

            );

        });


    const objetivo =

        document.querySelector(

            `#section-${nombre}`

        );


    if (objetivo) {

        objetivo.classList.add(

            "active"

        );

    }


    document

        .querySelectorAll(

            "[data-section]"

        )

        .forEach(boton => {

            boton.classList.remove(

                "active"

            );

        });


    const botonActivo =

        document.querySelector(

            `[data-section="${nombre}"]`

        );


    if (botonActivo) {

        botonActivo.classList.add(

            "active"

        );

    }

    const titulos = {
        dashboard: ["Dashboard", "Resumen del personal y horarios"],
        agenda: ["Agenda de horarios", "Organiza los turnos, descansos, permisos y dobletes"],
        trabajadores: ["Trabajadores", "Gestiona la información y asignación del personal"],
        sedes: ["Sedes", "Administra las sedes disponibles"],
        turnos: ["Turnos", "Configura los horarios de trabajo"],
        cargos: ["Cargos y áreas", "Configura los cargos y áreas del personal"],
        reportes: ["Reportes", "Consulta y exporta información del personal"]
        ,asistencia: ["Asistencia", "Control de entradas, salidas, tardanzas y horas extras"]
    };
    const titulo = titulos[nombre];
    if (titulo) {
        document.querySelector("#pageTitle").textContent = titulo[0];
        document.querySelector("#pageDescription").textContent = titulo[1];
    }


    cerrarSidebarMobile();

}


/* =========================================================
   BOTONES
========================================================= */

function inicializarBotones() {


    /* -----------------------------------------------------
       BOTÓN HOY
    ----------------------------------------------------- */

    const hoy =

        document.querySelector(

            "#btnToday"

        );

    if (hoy) {

        hoy.addEventListener(

            "click",

            irAHoy

        );

    }


    /* -----------------------------------------------------
       ANTERIOR
    ----------------------------------------------------- */

    const anterior =

        document.querySelector(

            "#prevPeriod"

        );

    if (anterior) {

        anterior.addEventListener(

            "click",

            () => cambiarMes(-1)

        );

    }


    /* -----------------------------------------------------
       SIGUIENTE
    ----------------------------------------------------- */

    const siguiente =

        document.querySelector(

            "#nextPeriod"

        );

    if (siguiente) {

        siguiente.addEventListener(

            "click",

            () => cambiarMes(1)

        );

    }


    /* -----------------------------------------------------
       MES
    ----------------------------------------------------- */

    const mes =

        document.querySelector(

            "#btnMonthView"

        );

    if (mes) {

        mes.addEventListener(

            "click",

            () => {

                cambiarModoCalendario(

                    "mes"

                );

            }

        );

    }


    /* -----------------------------------------------------
       SEMANA
    ----------------------------------------------------- */

    const semana =

        document.querySelector(

            "#btnWeekView"

        );

    if (semana) {

        semana.addEventListener(

            "click",

            () => {

                cambiarModoCalendario(

                    "semana"

                );

            }

        );

    }


    /* -----------------------------------------------------
       MENU MOBILE
    ----------------------------------------------------- */

    const menu =

        document.querySelector(

            "#mobileMenuButton"

        );

    if (menu) {

        menu.addEventListener(

            "click",

            () => {

                document

                    .querySelector(

                        ".sidebar"

                    )

                    ?.classList.toggle(

                        "open"

                    );

            }

        );

    }

    document.querySelectorAll("#btnNewWorker, #btnAddWorker").forEach(boton => {
        boton.addEventListener("click", () => {
            trabajadorEditandoId = null;
            document.querySelector("#workerForm")?.reset();
            document.querySelector("#workerModalTitle").textContent = "Nuevo trabajador";
            cargarOpcionesTrabajador();
            abrirModal("workerModal");
        });
    });
    document.querySelector("#btnWorkerTemplate")?.addEventListener("click", descargarMoldeTrabajadores);
    document.querySelector("#btnImportWorkers")?.addEventListener("click", () => document.querySelector("#workerImportFile")?.click());
    document.querySelector("#workerImportFile")?.addEventListener("change", importarTrabajadoresExcel);
    document.querySelector("#btnExportWorkers")?.addEventListener("click", exportarTrabajadoresExcel);

    const fechaAsistencia = document.querySelector("#attendanceDate");
    if (fechaAsistencia) {
        fechaAsistencia.value = formatearFechaISO(new Date());
        fechaAsistencia.addEventListener("change", renderizarAsistencia);
    }
    const asistenciaSede = document.querySelector("#attendanceSedeFilter");
    const asistenciaTurno = document.querySelector("#attendanceTurnoFilter");
    if (asistenciaSede) {
        asistenciaSede.innerHTML = obtenerSedes().filter(item => item.estado === "activo").map(item => `<option value="${item.id}">${item.nombre}</option>`).join("");
        asistenciaSede.addEventListener("change", renderizarAsistencia);
    }
    if (asistenciaTurno) {
        asistenciaTurno.innerHTML = obtenerTurnos().filter(item => item.estado === "activo").map(item => `<option value="${item.id}">${item.nombre}</option>`).join("");
        asistenciaTurno.addEventListener("change", renderizarAsistencia);
    }
    document.querySelector("#exportAttendance")?.addEventListener("click", () => exportarAsistenciaCSV(document.querySelector("#attendanceDate")?.value));

    document.querySelector("#section-dashboard .more-button")?.addEventListener("click", () => cambiarSeccion("reportes"));
    document.querySelectorAll("#section-reportes .report-card button").forEach((button, index) => {
        button.addEventListener("click", () => {
            if (index === 2) {
                const filas = obtenerColeccion("trabajadores").map(worker => [worker.nombre, worker.apellido, worker.dni, obtenerSede(worker.sedeId)?.nombre || "", obtenerTurno(worker.turnoId)?.nombre || ""]);
                exportarCSV("personal", ["Nombre", "Apellido", "DNI", "Sede", "Turno"], filas);
                return;
            }
            const filas = obtenerColeccion("trabajadores").map(worker => [worker.nombre, worker.apellido, obtenerSede(worker.sedeId)?.nombre || "", obtenerTurno(worker.turnoId)?.nombre || ""]);
            exportarCSV(index === 0 ? "horario-mensual" : "horario-semanal", ["Nombre", "Apellido", "Sede", "Turno"], filas);
        });
    });

    document.querySelectorAll("#btnAddLocation, #btnAddLocationCard").forEach(button => button.addEventListener("click", () => abrirFormularioGestion("sede")));
    document.querySelectorAll("#btnAddShift, #btnAddShiftCard").forEach(button => button.addEventListener("click", () => abrirFormularioGestion("turno")));
    document.querySelector("#btnAddPosition")?.addEventListener("click", () => abrirFormularioGestion("cargo"));
    document.querySelector("#workerForm")?.addEventListener("submit", guardarTrabajadorFormulario);
    cargarOpcionesTrabajador();

}


/* =========================================================
   SIDEBAR MOBILE
========================================================= */

function cerrarSidebarMobile() {

    document

        .querySelector(

            ".sidebar"

        )

        ?.classList.remove(

            "open"

        );

        document.querySelector(".agenda-side-nav")?.classList.remove("is-open");
        document.querySelector("#agendaNavToggle")?.classList.remove("is-open");

}


/* =========================================================
   FILTROS
========================================================= */

function inicializarFiltros() {

    const buscar =

        document.querySelector(

            "#workerSearch"

        );


    if (buscar) {

        buscar.addEventListener(

            "input",

            renderizarTrabajadores

        );

    }


    const sede =

        document.querySelector(

            "#workerFilterSede"

        );


    if (sede) {

        sede.addEventListener(

            "change",

            renderizarTrabajadores

        );

    }


    const turno =

        document.querySelector(

            "#agendaSedeFilter"

        );


    if (turno) {

        turno.addEventListener(

            "change",

            renderizarCalendario

        );

    }


    const area =

        document.querySelector(

            "#workerFilterStatus"

        );


    if (area) {

        area.addEventListener(

            "change",

            renderizarTrabajadores

        );

    }

    const agendaTurnos = document.querySelectorAll("[data-agenda-turno]");
    agendaTurnos.forEach(boton => boton.addEventListener("click", () => {
        agendaTurnoSeleccionado = boton.dataset.agendaTurno;
        agendaTurnos.forEach(item => item.classList.toggle("active", item === boton));
        renderizarCalendario();
    }));
    const agendaSede = document.querySelector("#agendaSedeFilter");
    if (agendaSede) {
        agendaSede.innerHTML = obtenerSedes().filter(sede => sede.estado === "activo").map(sede => `<option value="${sede.id}">${sede.nombre}</option>`).join("");
        agendaSede.addEventListener("change", renderizarCalendario);
    }

    const workerSede = document.querySelector("#workerFilterSede");
    if (workerSede) workerSede.addEventListener("change", renderizarTrabajadores);
    const workerStatus = document.querySelector("#workerFilterStatus");
    if (workerStatus) workerStatus.addEventListener("change", renderizarTrabajadores);

}


/* =========================================================
   RENDER TRABAJADORES
========================================================= */

function renderizarTrabajadores() {

    const tabla =

        document.querySelector(

            "#workersTableBody"

        );


    if (!tabla) return;


    const valorFiltro = selector => {
        const valor = document.querySelector(selector)?.value || "";
        return valor === "all" ? "" : valor;
    };

    const trabajadores = filtrarTrabajadores({
        texto: document.querySelector("#workerSearch")?.value || "",
        sedeId: valorFiltro("#workerFilterSede"),
        estado: valorFiltro("#workerFilterStatus"),
        turnoId: "",
        areaId: ""
    });


    tabla.innerHTML =

        trabajadores

            .map(

                trabajador => {

                    const sede =

                        obtenerSede(

                            trabajador.sedeId

                        );

                    const turno =

                        obtenerTurno(

                            trabajador.turnoId

                        );


                    const iniciales =

                        trabajador.nombre

                            .charAt(0)

                        +

                        trabajador.apellido

                            .charAt(0);


                    return `

                        <tr>

                            <td>

                                <div

                                    class="worker-table-info"

                                >

                                    <div

                                        class="worker-avatar"

                                    >

                                        ${iniciales}

                                    </div>


                                    <div>

                                        <strong>

                                            <button class="worker-name-button" type="button" onclick="abrirPerfilTrabajador(${trabajador.id})">
                                                ${nombreCompleto(trabajador)}
                                            </button>

                                        </strong>


                                        <small>Contacto: ${trabajador.telefono || "-"}</small>

                                    </div>

                                </div>

                            </td>


                            <td>${trabajador.dni || "-"}</td>

                            <td>${obtenerNombresCargos(trabajador) || "-"}</td>

                            <td>${obtenerColeccion("areas").find(area => Number(area.id) === Number(trabajador.areaId))?.nombre || "-"}</td>


                            <td>

                                ${sede?.nombre || "-"}

                            </td>


                            <td>

                                ${turno?.nombre || "-"}

                            </td>


                            <td>

                                ${

                                    NOMBRES_DIAS[

                                        trabajador

                                            .diaDescanso

                                    ]

                                }

                            </td>


                            <td>

                                <span

                                    class="status-badge ${

                                        trabajador.estado ===

                                        "activo"

                                            ? "active"

                                            : "inactive"

                                    }"

                                >

                                    ${

                                        trabajador.estado ===

                                        "activo"

                                            ? "Activo"

                                            : "Inactivo"

                                    }

                                </span>

                            </td>


                            <td>

                                <button

                                    class="table-action"

                                    onclick="abrirEditarTrabajador(${trabajador.id})"

                                >

                                    <i

                                        class="fa-solid fa-pen"

                                    ></i>

                                </button>

                            </td>

                        </tr>

                    `;

                }

            )

            .join("");

}


/* =========================================================
   RENDER SEDES
========================================================= */

function renderizarSedes() {

    const contenedor =

        document.querySelector(

            "#locationsContainer"

        );


    if (!contenedor) return;


    const sedes =

        obtenerSedes()

            .filter(

                s => s.estado === "activo"

            );


    contenedor.innerHTML =

        sedes

            .map(

                sede => `

                    <div class="management-card">

                        <div

                            class="management-card-header"

                        >

                            <div

                                class="management-icon building"

                            >

                                <i

                                    class="fa-solid fa-building"

                                ></i>

                            </div>

                        </div>


                        <h3>

                            ${sede.nombre}

                        </h3>


                        <p>

                            ${sede.direccion || ""}

                        </p>


                        <div

                            class="management-info"

                        >

                            <span>

                                <i

                                    class="fa-solid fa-users"

                                ></i>

                                ${

                                    obtenerTrabajadores()

                                        .filter(

                                            t =>

                                                Number(

                                                    t.sedeId

                                                ) ===

                                                Number(

                                                    sede.id

                                                )

                                        )

                                        .length

                                }

                                trabajadores

                            </span>

                        </div>


                        <button

                            class="btn btn-secondary btn-small"

                            onclick="abrirEditarSede(${sede.id})"

                        >

                            <i

                                class="fa-solid fa-pen"

                            ></i>

                            Editar

                        </button>

                    </div>

                `

            )

            .join("");

}


/* =========================================================
   RENDER TURNOS
========================================================= */

function renderizarTurnos() {

    const contenedor =

        document.querySelector(

            "#shiftsContainer"

        );


    if (!contenedor) return;


    const turnos =

        obtenerTurnos()

            .filter(

                t => t.estado === "activo"

            );


    contenedor.innerHTML =

        turnos

            .map(

                turno => `

                    <div class="management-card">

                        <div

                            class="management-card-header"

                        >

                            <div

                                class="management-icon ${

                                    turno.nombre

                                        .toLowerCase()

                                        .includes("noche")

                                        ? "moon"

                                        : "sun"

                                }"

                            >

                                <i

                                    class="fa-solid ${

                                        turno.nombre

                                            .toLowerCase()

                                            .includes(

                                                "noche"

                                            )

                                            ? "fa-moon"

                                            : "fa-sun"

                                    }"

                                ></i>

                            </div>

                        </div>


                        <h3>

                            ${turno.nombre}

                        </h3>


                        <p>

                            Horario configurado

                        </p>


                        <div class="shift-time">

                            <i

                                class="fa-regular fa-clock"

                            ></i>


                            <strong>

                                ${turno.horaInicio}

                                -

                                ${turno.horaFin}

                            </strong>

                        </div>


                        <button

                            class="btn btn-secondary btn-small"

                            onclick="abrirEditarTurno(${turno.id})"

                        >

                            <i

                                class="fa-solid fa-pen"

                            ></i>

                            Editar

                        </button>

                    </div>

                `

            )

            .join("");

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderizarDashboard() {

    const trabajadores =

        obtenerTrabajadores()

            .filter(

                t => t.estado === "activo"

            );


    const hoy =

        formatearFechaISO(

            new Date()

        );


    const resumen =

        contarTrabajadoresDelDia(

            hoy

        );


    const turnoDia = obtenerTurnos().find(turno => {
        const nombre = turno.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return nombre.includes("dia") || nombre.includes("manana");
    });
    const turnoNoche = obtenerTurnos().find(turno =>
        turno.nombre.toLowerCase().includes("noche")
    );

    const valores = {
        "#statWorkers": trabajadores.length,
        "#statDay": trabajadores.filter(trabajador => Number(trabajador.turnoId) === Number(turnoDia?.id)).length,
        "#statNight": trabajadores.filter(trabajador => Number(trabajador.turnoId) === Number(turnoNoche?.id)).length,
        "#statDouble": resumen.dobletes,
        "#statRest": resumen.descansos,
        "#statPermission": resumen.permisos,
        "#statAbsence": resumen.faltas,
        "#statVacation": resumen.vacaciones
    };

    Object.entries(valores).forEach(([selector, valor]) => {
        const elemento = document.querySelector(selector);
        if (elemento) elemento.textContent = valor;
    });

    renderizarAlertasPlanificacion(hoy);

}


/* =========================================================
   MODAL
========================================================= */

function inicializarModal() {

    document

        .querySelectorAll(

            "[data-close-modal]"

        )

        .forEach(boton => {

            boton.addEventListener(

                "click",

                cerrarModal

            );

        });

    document.querySelector("#btnDayAssignment")?.addEventListener("click", () => abrirModal("assignmentModal"));
    document.querySelector("#btnSupportAssignment")?.addEventListener("click", () => abrirModal("assignmentModal"));
    document.querySelector("#btnDoubleShift")?.addEventListener("click", () => abrirModal("assignmentModal"));
    document.querySelector("#btnSpecialStatus")?.addEventListener("click", () => abrirModal("incidentModal"));
    document.querySelector("#assignmentForm")?.addEventListener("submit", guardarCambioTemporal);
    document.querySelector("#incidentForm")?.addEventListener("submit", guardarIncidencia);
    document.querySelector("#permanentChangeForm")?.addEventListener("submit", guardarCambioPermanente);


    document

        .querySelectorAll(

            ".modal-overlay"

        )

        .forEach(overlay => {

            overlay.addEventListener(

                "click",

                event => {

                    if (

                        event.target ===

                        overlay

                    ) {

                        cerrarModal();

                    }

                }

            );

        });

}


/* =========================================================
   ABRIR MODAL
========================================================= */

function abrirModal(id) {

    const modal =

        document.querySelector(

            `#${id}`

        );


    if (!modal) return;


    modal.classList.add(

        "active"

    );

}


/* =========================================================
   CERRAR MODAL
========================================================= */

function cerrarModal() {

    document

        .querySelectorAll(

            ".modal-overlay"

        )

        .forEach(modal => {

            modal.classList.remove(

                "active"

            );

        });

}


/* =========================================================
   EDITAR TRABAJADOR
========================================================= */

function abrirEditarTrabajador(id) {

    console.log(

        "Editar trabajador:",

        id

    );


    /*
        Posteriormente aquí abriremos
        el formulario completo del trabajador.
    */

}


/* =========================================================
   EDITAR SEDE
========================================================= */

function abrirEditarSede(id) {
    abrirFormularioGestion("sede", id);

}


/* =========================================================
   EDITAR TURNO
========================================================= */

function abrirEditarTurno(id) {
    abrirFormularioGestion("turno", id);

}


/* =========================================================
   DETALLE DE DÍA
========================================================= */

function abrirModalDetalleDiaLegacy(fecha) {

    const trabajadores =

        obtenerTrabajadoresDelDia(

            fecha

        );


    const modal =

        document.querySelector(

            "#modalDetalleDia"

        );


    if (!modal) {

        console.log(

            "Trabajadores del día:",

            trabajadores

        );

        return;

    }


    const titulo =

        modal.querySelector(

            "[data-dia-titulo]"

        );


    if (titulo) {

        const fechaObj =

            new Date(

                `${fecha}T00:00:00`

            );


        titulo.textContent =

            `${NOMBRES_DIAS[

                fechaObj.getDay()

            ]} ${

                fechaObj.getDate()

            } de ${

                NOMBRES_MESES[

                    fechaObj.getMonth()

                ]

            }`;

    }


    const lista =

        modal.querySelector(

            "[data-dia-trabajadores]"

        );


    if (lista) {

        lista.innerHTML =

            trabajadores

                .map(

                    item => {

                        const t =

                            item.trabajador;

                        const h =

                            item.horario;


                        return `

                            <div class="day-worker">

                                <div

                                    class="day-worker-info"

                                >

                                    <div

                                        class="worker-avatar"

                                    >

                                        ${

                                            t.nombre.charAt(0)

                                            +

                                            t.apellido.charAt(0)

                                        }

                                    </div>


                                    <div>

                                        <strong>

                                            ${nombreCompleto(t)}

                                        </strong>

                                        <small>

                                            ${

                                                h.sede

                                            }

                                        </small>

                                    </div>

                                </div>


                                <div class="worker-status">

                                    ${

                                        h.estado ===

                                        "trabaja"

                                            ? `

                                                <span

                                                    class="shift-tag ${

                                                        h.turno

                                                            ?.toLowerCase() ===

                                                        "noche"

                                                            ? "night"

                                                            : "day"

                                                    }"

                                                >

                                                    ${h.turno}

                                                </span>

                                            `

                                            : `

                                                <span

                                                    class="shift-tag support"

                                                >

                                                    ${h.estado}

                                                </span>

                                            `

                                    }


                                    ${

                                        h.doblete

                                            ? `

                                                <span

                                                    class="shift-tag double"

                                                >

                                                    DOBLETE

                                                </span>

                                            `

                                            : ""

                                    }

                                </div>

                            </div>

                        `;

                    }

                )

                .join("");

    }


    abrirModal(

        "modalDetalleDia"

    );

}

function abrirModalDetalleDia(fecha) {
    window.fechaDetalleSeleccionada = fecha;
    const modal = document.querySelector("#dayModal");
    if (!modal) return;
    const fechaObj = new Date(`${fecha}T00:00:00`);
    const resumen = contarTrabajadoresAgendaDelDia(fecha);
    const trabajadores = obtenerTrabajadoresAgendaDelDia(fecha);
    const textoFecha = `${NOMBRES_DIAS[fechaObj.getDay()]} ${fechaObj.getDate()} de ${NOMBRES_MESES[fechaObj.getMonth()]}`;
    document.querySelector("#selectedDateText")?.replaceChildren(document.createTextNode(textoFecha));
    [
        ["#dayTotalWorkers", resumen.total], ["#dayTotalDay", resumen.dia],
        ["#dayTotalNight", resumen.noche], ["#dayTotalDouble", resumen.dobletes]
    ].forEach(([selector, valor]) => { const elemento = document.querySelector(selector); if (elemento) elemento.textContent = valor; });
    const lista = document.querySelector("#dayWorkersList");
    if (lista) {
        const estados = [
            ["trabaja", "Trabajo"], ["descanso", "Descanso"], ["permiso", "Permiso"],
            ["falta", "Falta"], ["vacaciones", "Vacaciones"], ["doblete", "Doblete"], ["apoyo", "Apoyo"]
        ];
        lista.innerHTML = trabajadores.map(({ trabajador, horario }) => { const estadoVisual = obtenerEstadoVisualAgenda(horario); return `<div class="day-worker day-worker-editor"><button class="worker-name-button" type="button" onclick="abrirPerfilTrabajador(${trabajador.id})"><strong>${nombreCompleto(trabajador)}</strong><small>${horario.sede} · ${horario.turno || horario.estado}</small></button><div class="status-palette">${estados.map(([estado, etiqueta]) => `<button type="button" class="status-chip ${estado} ${estadoVisual === estado ? "selected" : ""}" data-agenda-status="${estado}" data-worker-id="${trabajador.id}">${etiqueta}</button>`).join("")}</div>${horario.tipo === "apoyo" && horario.apoyoConfirmado !== true ? `<button type="button" class="support-confirm-button" data-confirm-support="${horario.apoyoId}">Confirmar apoyo</button>` : ""}</div>`; }).join("");
        lista.querySelectorAll("[data-agenda-status]").forEach(button => button.addEventListener("click", () => asignarEstadoAgenda(button.dataset.workerId, fecha, button.dataset.agendaStatus)));
        lista.querySelectorAll("[data-confirm-support]").forEach(button => button.addEventListener("click", () => { confirmarApoyo(button.dataset.confirmSupport, obtenerFiltroAgenda().sedeId); abrirModalDetalleDia(fecha); }));
    }
    cargarTrabajadoresEnSelect("#assignmentWorker");
    cargarTrabajadoresEnSelect("#incidentWorker");
    const sedeSelect = document.querySelector("#assignmentLocation");
    if (sedeSelect) sedeSelect.innerHTML = obtenerSedes().filter(sede => sede.estado === "activo").map(sede => `<option value="${sede.id}">${sede.nombre}</option>`).join("");
    const turnoSelect = document.querySelector("#assignmentShift");
    if (turnoSelect) turnoSelect.innerHTML = obtenerTurnos().filter(turno => turno.estado === "activo").map(turno => `<option value="${turno.id}">${turno.nombre}</option>`).join("");
    abrirModal("dayModal");
}

function cargarTrabajadoresEnSelect(selector) {
    const select = document.querySelector(selector);
    if (!select) return;
    select.innerHTML = `<option value="">Seleccionar trabajador</option>` + obtenerTrabajadores().filter(trabajador => trabajador.estado === "activo").map(trabajador => `<option value="${trabajador.id}">${nombreCompleto(trabajador)}</option>`).join("");
}

function guardarCambioTemporal(event) {
    event.preventDefault();
    const tipo = document.querySelector("#assignmentType")?.value;
    const trabajadorId = Number(document.querySelector("#assignmentWorker")?.value);
    const fecha = window.fechaDetalleSeleccionada;
    const sedeId = Number(document.querySelector("#assignmentLocation")?.value);
    const turnoId = Number(document.querySelector("#assignmentShift")?.value);
    const motivo = document.querySelector("#assignmentReason")?.value || "";
    if (!trabajadorId || !fecha) return;
    if (tipo === "support") registrarApoyo({ trabajadorId, fecha, sedeId, turnoId, motivo });
    if (tipo === "double") registrarDoblete({ trabajadorId, fecha, sedeId, turnoExtraId: turnoId, motivo });
    if (tipo === "shift") cambiarTurnoDia({ trabajadorId, fecha, sedeId, turnoId, motivo });
    actualizarColeccion("historial", [...obtenerColeccion("historial"), { id: generarId("historial"), fecha, tipo, trabajadorId, motivo }]);
    cerrarModal();
    renderizarTodo();
}

function guardarIncidencia(event) {
    event.preventDefault();
    const tipo = document.querySelector("#incidentType")?.value;
    const nombres = { rest: "Descanso", permission: "Permiso", absence: "Falta", vacation: "Vacaciones", suspension: "Suspensión", incapacity: "Incapacidad", other: "Otro" };
    registrarPermiso({ trabajadorId: Number(document.querySelector("#incidentWorker")?.value), fechaInicio: document.querySelector("#incidentStart")?.value, fechaFin: document.querySelector("#incidentEnd")?.value, tipo: nombres[tipo] || "Otro", motivo: document.querySelector("#incidentReason")?.value || "" });
    cerrarModal();
    renderizarTodo();
}

let agendaIndividualMes = new Date();

function crearLeyendaEstadosAsistencia() {
    return `
        <aside class="attendance-legend" aria-label="Leyenda de Estados de Asistencia">
            <div class="attendance-legend-header">
                <h3>Leyenda de Estados de Asistencia</h3>
                <span>Colores por temporalidad del día</span>
            </div>
            <section class="attendance-legend-section attendance-legend-past">
                <h4>Días Pasados <small>Histórico de asistencia</small></h4>
                <div class="attendance-legend-items">
                    <span><i class="attendance-dot past-early"></i>Trabajo - Temprano</span>
                    <span><i class="attendance-dot past-tolerance"></i>Trabajo - Tolerancia (10 min)</span>
                    <span><i class="attendance-dot past-late"></i>Trabajo - Tarde</span>
                    <span><i class="attendance-dot past-rest"></i>Descanso</span>
                    <span><i class="attendance-dot past-absence"></i>Faltó</span>
                    <span><i class="attendance-dot past-vacation"></i>Vacacionó</span>
                </div>
            </section>
            <section class="attendance-legend-section attendance-legend-today">
                <h4>Día Actual <small>Hoy - asistencia en vivo</small></h4>
                <div class="attendance-legend-items">
                    <span><i class="attendance-dot today-early"></i>Trabaja - Temprano</span>
                    <span><i class="attendance-dot today-tolerance"></i>Trabaja - Tolerancia (10 min)</span>
                    <span><i class="attendance-dot today-late"></i>Trabaja - Tarde</span>
                    <span><i class="attendance-dot today-rest-black"></i>Descansa</span>
                    <span><i class="attendance-dot today-absence"></i>Faltó</span>
                    <span><i class="attendance-dot today-vacation"></i>Vacaciona</span>
                </div>
            </section>
            <section class="attendance-legend-section attendance-legend-future">
                <h4>Días Futuros <small>Proyección y planificación</small></h4>
                <div class="attendance-legend-items">
                    <span><i class="attendance-dot future-work"></i>Trabajará</span>
                    <span><i class="attendance-dot future-double-same"></i>Dobleteará misma sede</span>
                    <span><i class="attendance-dot future-double-other"></i>Dobleteará otra sede</span>
                    <span><i class="attendance-dot future-shift-same"></i>Cambio de turno misma sede</span>
                    <span><i class="attendance-dot future-shift-other"></i>Cambio de turno otra sede</span>
                    <span><i class="attendance-dot future-rest"></i>Descansará</span>
                    <span><i class="attendance-dot future-vacation"></i>Vacacionará</span>
                </div>
            </section>
        </aside>
    `;
}

function abrirPerfilTrabajador(id) {
    const trabajador = obtenerTrabajador(id);
    if (!trabajador) return;
    const sede = obtenerSede(trabajador.sedeId);
    const turno = obtenerTurno(trabajador.turnoId);
    const asistencia = obtenerAsistenciaTrabajador(id);
    let modal = document.querySelector("#workerProfileModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "workerProfileModal";
        modal.className = "modal-overlay agenda-profile-overlay";
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="modal profile-modal"><div class="modal-header"><div><h2>${nombreCompleto(trabajador)}</h2><p>Agenda mensual individual · ${turno?.nombre || "Sin turno"}</p></div><button class="modal-close" type="button" data-profile-close><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="profile-summary"><div class="worker-avatar large">${trabajador.nombre[0]}${trabajador.apellido[0]}</div><div><strong>${nombreCompleto(trabajador)}</strong><span>DNI ${trabajador.dni}</span><span>${sede?.nombre || "Sin sede"} · ${turno?.nombre || "Sin turno"}</span></div></div><div class="profile-grid"><span>Cargo<strong>${obtenerNombresCargos(trabajador) || "-"}</strong></span><span>Área<strong>${obtenerColeccion("areas").find(area => Number(area.id) === Number(trabajador.areaId))?.nombre || "-"}</strong></span><span>Descanso<strong>${NOMBRES_DIAS[trabajador.diaDescanso] || "-"}</strong></span><span>Asistencias<strong>${asistencia.length}</strong></span><span>Tardanzas<strong>${asistencia.filter(item => item.tardanza > 0).length}</strong></span><span>Horas extra<strong>${asistencia.reduce((total, item) => total + Number(item.horasExtras || 0), 0)} min</strong></span></div><div class="profile-month"><div class="profile-month-toolbar"><button type="button" class="calendar-nav-button" data-profile-month-prev title="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button><h3 id="profileMonthTitle"></h3><button type="button" class="calendar-nav-button" data-profile-month-next title="Mes siguiente"><i class="fa-solid fa-chevron-right"></i></button><button type="button" class="btn btn-secondary btn-small" data-profile-month-today>Hoy</button></div><div class="agenda-temporal-legend"><span class="temporal-key past">Pasado</span><span class="temporal-key present">Hoy</span><span class="temporal-key future">Futuro</span></div><div class="profile-month-grid profile-weekdays" id="profileWeekdays"></div><div class="profile-month-grid" id="profileMonthGrid"></div><div class="agenda-legend agenda-legend-persistent"><span><i class="legend-dot green"></i>Pasado: temprano</span><span><i class="legend-dot yellow"></i>Tolerancia</span><span><i class="legend-dot orange"></i>Tarde</span><span><i class="legend-dot today-work"></i>Hoy</span><span><i class="legend-dot darkgreen"></i>Futuro: trabajo</span><span><i class="legend-dot purple"></i>Doblete</span><span><i class="legend-dot cream"></i>Vacaciones</span></div></div><button class="btn btn-secondary" type="button" data-permanent-change="${trabajador.id}">Cambiar asignación permanente</button></div></div>`;
    modal.querySelector(".profile-month")?.insertAdjacentHTML("beforeend", crearLeyendaEstadosAsistencia());
    renderizarCalendarioTrabajador(trabajador.id);
    modal.querySelector("[data-profile-month-prev]").addEventListener("click", () => { agendaIndividualMes.setMonth(agendaIndividualMes.getMonth() - 1); renderizarCalendarioTrabajador(trabajador.id); });
    modal.querySelector("[data-profile-month-next]").addEventListener("click", () => { agendaIndividualMes.setMonth(agendaIndividualMes.getMonth() + 1); renderizarCalendarioTrabajador(trabajador.id); });
    modal.querySelector("[data-profile-month-today]").addEventListener("click", () => { agendaIndividualMes = new Date(); renderizarCalendarioTrabajador(trabajador.id); });
    modal.classList.add("active");
    modal.querySelector("[data-profile-close]").addEventListener("click", () => modal.classList.remove("active"));
    modal.querySelector("[data-permanent-change]").addEventListener("click", () => {
        window.trabajadorCambioPermanente = id;
        const selects = document.querySelectorAll("#permanentChangeForm select");
        if (selects[0]) selects[0].innerHTML = obtenerSedes().filter(item => item.estado === "activo").map(item => `<option value="${item.id}">${item.nombre}</option>`).join("");
        if (selects[1]) selects[1].innerHTML = `<option value="">Mantener turno actual</option>` + obtenerTurnos().filter(item => item.estado === "activo").map(item => `<option value="${item.id}">${item.nombre}</option>`).join("");
        modal.classList.remove("active");
        abrirModal("permanentChangeModal");
    });
}

function renderizarAlertasPlanificacion(fecha) {
    let contenedor = document.querySelector("#planningAlerts");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "planningAlerts";
        contenedor.className = "planning-alerts";
        document.querySelector("#section-dashboard .content-wrapper, #section-dashboard")?.appendChild(contenedor);
    }
    const alertas = obtenerAlertasPlanificacion(fecha);
    contenedor.innerHTML = alertas.length ? `<h3>Alertas de planificación</h3>${alertas.map(alerta => `<div class="planning-alert ${alerta.nivel}"><i class="fa-solid fa-triangle-exclamation"></i>${alerta.texto}</div>`).join("")}` : `<h3>Alertas de planificación</h3><div class="planning-alert success"><i class="fa-solid fa-check"></i>La cobertura configurada no presenta alertas para hoy.</div>`;
}

function renderizarAsistencia() {
    const tabla = document.querySelector("#attendanceTableBody");
    if (!tabla || typeof obtenerAsistencias !== "function") return;
    const fecha = document.querySelector("#attendanceDate")?.value || formatearFechaISO(new Date());
    const sedeId = Number(document.querySelector("#attendanceSedeFilter")?.value || 0);
    const turnoId = Number(document.querySelector("#attendanceTurnoFilter")?.value || 0);
    const registros = obtenerAsistenciaDelDia(fecha);
    const registroPara = trabajadorId => registros.find(registro => Number(registro.trabajadorId) === Number(trabajadorId));
    tabla.innerHTML = obtenerTrabajadores().filter(trabajador => trabajador.estado === "activo" && (!sedeId || Number(trabajador.sedeId) === sedeId) && (!turnoId || Number(trabajador.turnoId) === turnoId)).map(trabajador => {
        const horario = obtenerHorarioReal(trabajador.id, fecha);
        const registro = registroPara(trabajador.id);
        const turno = obtenerTurno(horario?.turnoId || trabajador.turnoId);
        const resumen = registro ? calcularResumenAsistencia(registro) : null;
        const clase = resumen?.clasificacion?.clase || (horario?.estado === "descanso" ? "attendance-rest" : "");
        return `<tr><td><button class="worker-name-button" type="button" onclick="abrirPerfilTrabajador(${trabajador.id})">${nombreCompleto(trabajador)}</button></td><td>${turno?.nombre || horario?.estado || "-"}</td><td>${horario?.horaInicio || "-"}</td><td>${registro?.horaEntrada || "-"}</td><td>${horario?.horaFin || "-"}</td><td>${registro?.horaSalida || "-"}</td><td><span class="attendance-state ${clase}">${registro?.clasificacion?.estado || horario?.estado || "pendiente"}</span></td><td><button class="table-action" type="button" data-attendance-entry="${trabajador.id}" title="Registrar entrada"><i class="fa-solid fa-right-to-bracket"></i></button><button class="table-action" type="button" data-attendance-exit="${trabajador.id}" title="Registrar salida"><i class="fa-solid fa-right-from-bracket"></i></button></td></tr>`;
    }).join("");
    tabla.querySelectorAll("[data-attendance-entry]").forEach(button => button.addEventListener("click", () => registrarAsistenciaDesdeInterfaz(button.dataset.attendanceEntry, "entrada")));
    tabla.querySelectorAll("[data-attendance-exit]").forEach(button => button.addEventListener("click", () => registrarAsistenciaDesdeInterfaz(button.dataset.attendanceExit, "salida")));
    const resumen = obtenerResumenAsistencia(fecha);
    const panel = document.querySelector("#attendanceSummary");
    if (panel) panel.innerHTML = `<span>Total <strong>${resumen.total}</strong></span><span>Presentes <strong>${resumen.presentes}</strong></span><span>Tardanzas <strong>${resumen.tardanzas}</strong></span><span>Leves <strong>${resumen.tardanzasLeves}</strong></span><span>Graves <strong>${resumen.tardanzasGraves}</strong></span><span>Horas extra <strong>${resumen.horasExtras} min</strong></span>`;
}

function registrarAsistenciaDesdeInterfaz(trabajadorId, tipo) {
    const fecha = document.querySelector("#attendanceDate")?.value || formatearFechaISO(new Date());
    const trabajador = obtenerTrabajador(trabajadorId);
    const horario = obtenerHorarioReal(trabajadorId, fecha);
    if (!trabajador || !horario || horario.estado !== "trabaja") return;
    const turno = obtenerTurno(horario.turnoId);
    const actual = obtenerAsistencias().find(registro => Number(registro.trabajadorId) === Number(trabajadorId) && registro.fecha === fecha && Number(registro.turnoId) === Number(turno.id));
    const hora = prompt(tipo === "entrada" ? "Hora real de entrada (HH:MM):" : "Hora real de salida (HH:MM):", tipo === "entrada" ? horario.horaInicio : horario.horaFin);
    if (!hora) return;
    const datos = { trabajadorId: Number(trabajadorId), fecha, turnoId: turno.id, horaProgramadaEntrada: horario.horaInicio, horaProgramadaSalida: horario.horaFin, horaEntrada: tipo === "entrada" ? hora : actual?.horaEntrada, horaSalida: tipo === "salida" ? hora : actual?.horaSalida };
    try { registrarAsistencia(datos); renderizarAsistencia(); } catch (error) { alert(error.message); }
}

function guardarCambioPermanente(event) {
    event.preventDefault();
    const trabajador = obtenerTrabajador(window.trabajadorCambioPermanente);
    if (!trabajador) return;
    const selects = document.querySelectorAll("#permanentChangeForm select");
    const fecha = document.querySelector("#permanentChangeForm input[type=date]")?.value;
    const nuevaSede = Number(selects[0]?.value);
    const nuevoTurno = Number(selects[1]?.value);
    const sedeAnterior = trabajador.sedeId;
    const turnoAnterior = trabajador.turnoId;
    editarTrabajador(trabajador.id, { sedeId: nuevaSede, turnoId: nuevoTurno || trabajador.turnoId });
    actualizarColeccion("historial", [...obtenerColeccion("historial"), { id: generarId("historial"), fecha, tipo: "cambio_permanente", trabajadorId: trabajador.id, datoAnterior: { sedeId: sedeAnterior, turnoId: turnoAnterior }, datoNuevo: { sedeId: nuevaSede, turnoId: nuevoTurno || trabajador.turnoId }, usuario: "Administrador" }]);
    cerrarModal();
    renderizarTodo();
}

function asignarEstadoAgenda(trabajadorId, fecha, estado) {
    const filtro = obtenerFiltroAgenda();
    if (estado === "apoyo") {
        const sedeId = Number(prompt("ID de la sede destino:", filtro.sedeId));
        if (!sedeId) return;
        registrarApoyo({ trabajadorId, fecha, sedeId, turnoId: filtro.turnoId, motivo: "Apoyo asignado desde agenda" });
    } else if (estado === "doblete") {
        registrarDoblete({ trabajadorId, fecha, sedeId: filtro.sedeId, turnoExtraId: filtro.turnoId, motivo: "Doblete asignado desde agenda" });
    } else {
        registrarEstadoDia({ trabajadorId, fecha, estado, sedeId: filtro.sedeId, turnoId: filtro.turnoId });
    }
    renderizarTodo();
    abrirModalDetalleDia(fecha);
}

let trabajadorEditandoId = null;

function cargarOpcionesTrabajador() {
    const sede = document.querySelector("#workerLocation");
    const turno = document.querySelector("#workerShift");
    const area = document.querySelector("#workerArea");
    const cargos = document.querySelector("#workerPosition");
    if (sede) sede.innerHTML = `<option value="">Seleccionar sede</option>` + obtenerSedes().filter(item => item.estado === "activo").map(item => `<option value="${item.id}">${item.nombre}</option>`).join("");
    if (turno) turno.innerHTML = `<option value="">Seleccionar turno</option>` + obtenerTurnos().filter(item => item.estado === "activo").map(item => `<option value="${item.id}">${item.nombre}</option>`).join("");
    if (area) area.innerHTML = `<option value="">Seleccionar área</option>` + obtenerColeccion("areas").filter(item => item.estado === "activo").map(item => `<option value="${item.id}">${item.nombre}</option>`).join("");
    if (cargos) {
        document.querySelector("#workerPositionOptions").innerHTML = obtenerColeccion("cargos").filter(item => item.estado === "activo").map(item => `<option value="${item.nombre}">`).join("");
    }
    const otros = document.querySelector("#workerOtherPositions");
    if (otros) otros.innerHTML = obtenerColeccion("cargos").filter(item => item.estado === "activo").map(item => `<label><input type="checkbox" value="${item.id}"> <span>${item.nombre}</span></label>`).join("");
}

function abrirEditarTrabajador(id) {
    const trabajador = obtenerTrabajador(id);
    if (!trabajador) return;
    trabajadorEditandoId = Number(id);
    cargarOpcionesTrabajador();
    const valores = {
        workerName: trabajador.nombre, workerLastName: trabajador.apellido, workerDni: trabajador.dni,
        workerPhone: trabajador.telefono, workerBirthday: trabajador.fechaNacimiento, workerEntryDate: trabajador.fechaIngreso,
        workerAddress: trabajador.direccion, workerEmergency: trabajador.emergenciaNumero, workerDegree: trabajador.gradoProfesional,
        workerProfession: trabajador.profesion, workerInstitution: trabajador.institucionEstudios, workerArea: trabajador.areaId, workerLocation: trabajador.sedeId,
        workerShift: trabajador.turnoId, workerStatus: trabajador.estado
    };
    Object.entries(valores).forEach(([idCampo, valor]) => { const campo = document.querySelector(`#${idCampo}`); if (campo) campo.value = valor ?? ""; });
    const descanso = document.querySelector("#workerRestDay");
    if (descanso) descanso.value = NOMBRES_DIAS[trabajador.diaDescanso];
    const cargos = document.querySelector("#workerPosition");
    if (cargos) cargos.value = obtenerColeccion("cargos").find(item => Number(item.id) === Number(trabajador.cargos?.[0]))?.nombre || "";
    document.querySelectorAll("#workerOtherPositions input[type=checkbox]").forEach(input => input.checked = (trabajador.otrosCargos || []).includes(Number(input.value)));
    document.querySelector("#workerModalTitle").textContent = "Editar trabajador";
    abrirModal("workerModal");
}

function guardarTrabajadorFormulario(event) {
    event.preventDefault();
    const cargoNombre = document.querySelector("#workerPosition")?.value.trim().toLowerCase();
    const cargoIds = obtenerColeccion("cargos").filter(cargo => cargo.nombre.toLowerCase() === cargoNombre).map(cargo => Number(cargo.id));
    const otrosCargos = Array.from(document.querySelectorAll("#workerOtherPositions input:checked")).map(input => Number(input.value));
    const areaId = Number(document.querySelector("#workerArea")?.value || 0);
    const datos = {
        nombre: document.querySelector("#workerName")?.value.trim(), apellido: document.querySelector("#workerLastName")?.value.trim(), dni: document.querySelector("#workerDni")?.value.trim(),
        telefono: document.querySelector("#workerPhone")?.value.trim(), fechaNacimiento: document.querySelector("#workerBirthday")?.value, fechaIngreso: document.querySelector("#workerEntryDate")?.value,
        direccion: document.querySelector("#workerAddress")?.value.trim(), emergenciaNumero: document.querySelector("#workerEmergency")?.value.trim(), gradoProfesional: document.querySelector("#workerDegree")?.value,
        profesion: document.querySelector("#workerProfession")?.value.trim(), institucionEstudios: document.querySelector("#workerInstitution")?.value.trim(), areaId, cargos: cargoIds, otrosCargos, sedeId: Number(document.querySelector("#workerLocation")?.value), turnoId: Number(document.querySelector("#workerShift")?.value),
        diaDescanso: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].indexOf(document.querySelector("#workerRestDay")?.value), estado: document.querySelector("#workerStatus")?.value || "activo"
    };
    if (!datos.nombre || !datos.apellido || !datos.dni || !datos.sedeId || !datos.turnoId || !datos.cargos.length) return;
    if (trabajadorEditandoId) editarTrabajador(trabajadorEditandoId, datos); else agregarTrabajador(datos);
    trabajadorEditandoId = null;
    event.target.reset();
    document.querySelector("#workerModalTitle").textContent = "Nuevo trabajador";
    cerrarModal();
    renderizarTodo();
}

function mostrarMoldeTrabajadores() {
    let modal = document.querySelector("#workerTemplateModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "workerTemplateModal";
        modal.className = "modal-overlay";
        document.body.appendChild(modal);
    }
    const areas = obtenerColeccion("areas").map(item => item.nombre).join(", ");
    const cargos = obtenerColeccion("cargos").map(item => item.nombre).join(", ");
    const sedes = obtenerSedes().map(item => `${item.id}: ${item.nombre}`).join(" | ");
    const turnos = obtenerTurnos().map(item => `${item.id}: ${item.nombre}`).join(" | ");
    modal.innerHTML = `<div class="modal worker-template-modal"><div class="modal-header"><div><h2>Molde de trabajadores</h2><p>Usa estos nombres y valores para importar o registrar sin errores.</p></div><button type="button" class="modal-close" data-template-close>×</button></div><div class="modal-body"><p><strong>Columnas:</strong> Nombre, Apellido, DNI, Teléfono, Fecha nacimiento, Fecha ingreso, Dirección, Emergencia, Grado profesional, Profesión, Institución de estudios, Área, Cargo principal, Otros cargos, Sede, Turno, Día descanso, Estado.</p><dl><dt>Sedes</dt><dd>${sedes || "Sin sedes"}</dd><dt>Turnos</dt><dd>${turnos || "Sin turnos"}</dd><dt>Áreas</dt><dd>${areas || "Sin áreas"}</dd><dt>Cargos</dt><dd>${cargos || "Sin cargos"}</dd><dt>Otros cargos</dt><dd>Selecciona uno o más cargos existentes con checkbox.</dd></dl></div></div>`;
    modal.classList.add("active");
    modal.querySelector("[data-template-close]").addEventListener("click", () => modal.classList.remove("active"));
}

function exportarTrabajadoresExcel() {
    fetch("/api/horarios/exportar-trabajadores", { credentials: "same-origin" }).then(response => {
        if (!response.ok) throw new Error("No se pudo generar el Excel.");
        return response.blob();
    }).then(blob => {
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(blob);
        enlace.download = `trabajadores-${new Date().toISOString().slice(0, 10)}.xlsx`;
        enlace.click();
        URL.revokeObjectURL(enlace.href);
    }).catch(() => alert("Primero sincroniza la Agenda con el servidor e inténtalo nuevamente."));
    return;
    /* Fallback local para instalaciones sin persistencia habilitada. */
    const filas = obtenerTrabajadores().map(worker => [worker.nombre, worker.apellido, worker.dni, worker.telefono, worker.fechaNacimiento, worker.fechaIngreso, worker.direccion, worker.emergenciaNumero, worker.gradoProfesional, worker.profesion, worker.institucionEstudios, obtenerColeccion("areas").find(area => Number(area.id) === Number(worker.areaId))?.nombre || "", obtenerNombresCargos(worker), (worker.otrosCargos || []).map(id => obtenerColeccion("cargos").find(cargo => Number(cargo.id) === Number(id))?.nombre || "").filter(Boolean).join("; "), obtenerSede(worker.sedeId)?.nombre || "", obtenerTurno(worker.turnoId)?.nombre || "", NOMBRES_DIAS[worker.diaDescanso] || "", worker.estado]);
    exportarCSV("trabajadores", ["Nombre", "Apellido", "DNI", "Telefono", "Fecha nacimiento", "Fecha ingreso", "Direccion", "Emergencia", "Grado profesional", "Profesion", "Institucion de estudios", "Area", "Cargo principal", "Otros cargos", "Sede", "Turno", "Dia descanso", "Estado"], filas);
}

function abrirFormularioGestion(tipo, id = null) {
    if (tipo === "sede" || tipo === "turno") return;
    const existente = id ? (tipo === "sede" ? obtenerSede(id) : tipo === "turno" ? obtenerTurno(id) : obtenerColeccion(tipo === "cargo" ? "cargos" : "areas").find(item => Number(item.id) === Number(id))) : null;
    const etiquetas = { sede: "sede", turno: "turno", cargo: "cargo", area: "área" };
    let modal = document.querySelector("#managementFormModal");
    if (!modal) { modal = document.createElement("div"); modal.id = "managementFormModal"; modal.className = "modal-overlay"; document.body.appendChild(modal); }
    const areaOptions = obtenerColeccion("areas").map(area => `<option value="${area.id}" ${existente?.areaId === area.id ? "selected" : ""}>${area.nombre}</option>`).join("");
    const contenido = tipo === "sede" ? `<label>Nombre<input name="nombre" required value="${existente?.nombre || ""}"></label><label>Dirección<input name="direccion" value="${existente?.direccion || ""}"></label><label>Mesas<input name="mesas" type="number" min="0" value="${existente?.mesas || 0}"></label>` : tipo === "turno" ? `<label>Nombre<input name="nombre" required value="${existente?.nombre || ""}"></label><label>Hora de entrada<input name="horaInicio" type="time" required value="${existente?.horaInicio || ""}"></label><label>Hora de salida<input name="horaFin" type="time" required value="${existente?.horaFin || ""}"></label><label>Tolerancia (minutos)<input name="toleranciaMinutos" type="number" min="0" value="${existente?.toleranciaMinutos || 10}"></label>` : `<label>Nombre<input name="nombre" required value="${existente?.nombre || ""}"></label>${tipo === "cargo" ? `<label>Área<select name="areaId"><option value="">Sin área</option>${areaOptions}</select></label>` : ""}`;
    modal.innerHTML = `<div class="modal"><div class="modal-header"><div><h2>${existente ? "Editar" : "Nuevo"} ${etiquetas[tipo]}</h2><p>Los cambios se sincronizan con el servidor.</p></div><button type="button" class="modal-close" data-management-close><i class="fa-solid fa-xmark"></i></button></div><form class="management-form"><div class="modal-body">${contenido}</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-management-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div></form></div>`;
    modal.classList.add("active");
    modal.querySelectorAll("[data-management-close]").forEach(button => button.addEventListener("click", () => modal.classList.remove("active")));
    modal.querySelector("form").addEventListener("submit", event => {
        event.preventDefault();
        const datos = Object.fromEntries(new FormData(event.target));
        if (tipo === "sede") existente ? editarSede(id, { ...datos, mesas: Number(datos.mesas || 0) }) : agregarSede(datos.nombre, datos.direccion, { mesas: datos.mesas });
        if (tipo === "turno") existente ? editarTurno(id, { ...datos, toleranciaMinutos: Number(datos.toleranciaMinutos || 0) }) : agregarTurno(datos);
        if (tipo === "cargo") guardarCatalogo("cargos", existente, id, { nombre: datos.nombre, areaId: Number(datos.areaId) || null });
        if (tipo === "area") guardarCatalogo("areas", existente, id, { nombre: datos.nombre, estado: "activo" });
        modal.classList.remove("active"); cargarOpcionesTrabajador(); renderizarTodo();
    });
}

function guardarCatalogo(nombre, existente, id, cambios) {
    const lista = obtenerColeccion(nombre);
    if (existente) lista[lista.findIndex(item => Number(item.id) === Number(id))] = { ...existente, ...cambios };
    else lista.push({ id: generarId(nombre), ...cambios });
    actualizarColeccion(nombre, lista);
}

function renderizarCatalogoCargosAreas() {
    const tabla = document.querySelector("#section-cargos tbody");
    if (!tabla) return;
    tabla.innerHTML = obtenerColeccion("cargos").map(cargo => `<tr><td><strong>${cargo.nombre}</strong></td><td>${obtenerColeccion("areas").find(area => Number(area.id) === Number(cargo.areaId))?.nombre || "-"}</td><td>${obtenerTrabajadores().filter(trabajador => trabajador.cargos.includes(Number(cargo.id))).length}</td><td><span class="status-badge ${cargo.estado === "activo" ? "active" : "inactive"}">${cargo.estado === "activo" ? "Activo" : "Inactivo"}</span></td><td><button class="table-action" type="button" data-edit-cargo="${cargo.id}"><i class="fa-solid fa-pen"></i></button></td></tr>`).join("");
    tabla.querySelectorAll("[data-edit-cargo]").forEach(button => button.addEventListener("click", () => abrirFormularioGestion("cargo", button.dataset.editCargo)));
    let areasPanel = document.querySelector("#areasManagementPanel");
    if (!areasPanel) { areasPanel = document.createElement("div"); areasPanel.id = "areasManagementPanel"; areasPanel.className = "table-card catalog-areas-panel"; document.querySelector("#section-cargos")?.appendChild(areasPanel); }
    areasPanel.innerHTML = `<div class="card-header"><div><h3>Áreas operativas</h3><span>Crear, editar y activar áreas</span></div><button class="btn btn-secondary btn-small" type="button" id="btnAddArea">Agregar área</button></div><div class="catalog-area-list">${obtenerColeccion("areas").map(area => `<div><span>${area.nombre}</span><span class="status-badge ${area.estado === "activo" ? "active" : "inactive"}">${area.estado}</span><button class="table-action" type="button" data-edit-area="${area.id}"><i class="fa-solid fa-pen"></i></button></div>`).join("")}</div>`;
    areasPanel.querySelector("#btnAddArea").addEventListener("click", () => abrirFormularioGestion("area"));
    areasPanel.querySelectorAll("[data-edit-area]").forEach(button => button.addEventListener("click", () => abrirFormularioGestion("area", button.dataset.editArea)));
}

function obtenerEtiquetaEstadoAgenda(estado) {
    const etiquetas = {
        trabaja: "Trabajo",
        descanso: "Descanso",
        permiso: "Permiso",
        falta: "Falta",
        vacaciones: "Vacaciones",
        apoyo: "Apoyo",
        doblete: "Doblete"
    };
    return etiquetas[estado] || "Trabajo";
}

function obtenerTipoTemporalFecha(fecha) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaObj = new Date(`${fecha}T00:00:00`);

    if (fechaObj < hoy) return "pasado";
    if (fechaObj.getTime() === hoy.getTime()) return "hoy";
    return "futuro";
}

function validarOrdenHoras(horaEntrada, horaSalida, turno) {
    if (!horaEntrada || !horaSalida) return true;
    const entrada = minutosDesdeMedianoche(horaEntrada);
    const salida = minutosDesdeMedianoche(horaSalida);
    if (entrada === null || salida === null || entrada === salida) return false;
    if (salida > entrada) return true;

    const inicioProgramado = minutosDesdeMedianoche(turno?.horaInicio);
    const finProgramado = minutosDesdeMedianoche(turno?.horaFin);
    return inicioProgramado !== null && finProgramado !== null && finProgramado < inicioProgramado;
}

function obtenerBadgePuntualidad(trabajadorId, fecha) {
    const asistencia = obtenerAsistenciaTrabajador(trabajadorId).find(item => item.fecha === fecha);
    const horario = obtenerHorarioReal(trabajadorId, fecha);
    const turno = obtenerTurno(horario?.turnoId || obtenerTrabajador(trabajadorId)?.turnoId);
    const horaProgramada = horario?.horaInicio || turno?.horaInicio;
    const horaReal = asistencia?.horaEntrada || horario?.horaInicio;

    if (!horaProgramada || !horaReal) {
        return { texto: "Sin hora", clase: "status-muted" };
    }

    const tardanza = calcularTardanza(horaProgramada, horaReal, turno?.toleranciaMinutos || 0);
    return tardanza <= 0
        ? { texto: "Temprano", clase: "status-success" }
        : { texto: "Tarde", clase: "status-warning" };
}

function obtenerDetalleAgendaDiaria(trabajadorId, fecha) {
    const trabajador = obtenerTrabajador(trabajadorId);
    const horario = obtenerHorarioReal(trabajadorId, fecha);
    const turno = obtenerTurno(horario?.turnoId || trabajador?.turnoId);
    const asistencia = obtenerAsistenciaTrabajador(trabajadorId).find(item => item.fecha === fecha);
    const permiso = obtenerPermisoTrabajadorFecha(trabajadorId, fecha);
    const temporalidad = obtenerTipoTemporalFecha(fecha);
    const estadoBase = horario?.estado || "trabaja";
    const estadoVisual = obtenerEstadoVisualAgenda(horario);
    const estado = estadoVisual === "sin_estado" ? "trabaja" : (estadoBase === "work" ? "trabaja" : estadoVisual);
    const etiqueta = obtenerEtiquetaEstadoAgenda(estado);
    const esFuturo = temporalidad === "futuro";
    const entrada = esFuturo ? "-" : (asistencia?.horaEntrada || horario?.horaInicio || "-");
    const salida = esFuturo ? "-" : (asistencia?.horaSalida || horario?.horaFin || "-");
    const puntualidad = esFuturo
        ? { texto: "Planificado", clase: "status-planned" }
        : obtenerBadgePuntualidad(trabajadorId, fecha);
    let detalleExtra = "";

    if (estado === "vacaciones" && permiso) {
        detalleExtra = `Vacaciones: ${permiso.fechaInicio} al ${permiso.fechaFin}`;
    }

    if (estado === "apoyo" && horario?.sede) {
        detalleExtra = `Apoyo: ${horario.sede}`;
    }

    if (horario?.doblete) {
        detalleExtra = `Doblete: ${horario.doblete.sede || "Sede"} · ${horario.doblete.turno || "turno"}`;
    }

    return {
        etiqueta,
        entrada,
        salida,
        puntalidad: puntualidad,
        horario,
        turno,
        detalleExtra,
        estado,
        temporalidad,
        esFuturo
    };
}

function renderizarCalendarioTrabajador(trabajadorId) {
    const grid = document.querySelector("#profileMonthGrid");
    if (!grid) return;
    const calendarioMes = new Date(agendaIndividualMes.getFullYear(), agendaIndividualMes.getMonth(), 1);
    const total = new Date(calendarioMes.getFullYear(), calendarioMes.getMonth() + 1, 0).getDate();
    const primerDia = (calendarioMes.getDay() + 6) % 7;
    const title = document.querySelector("#profileMonthTitle");
    const weekdays = document.querySelector("#profileWeekdays");
    const nombresCortos = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    if (title) title.textContent = calendarioMes.toLocaleDateString("es-PE", { month: "long", year: "numeric" }).replace(/^./, letra => letra.toUpperCase());
    if (weekdays) weekdays.innerHTML = nombresCortos.map(dia => `<span class="profile-weekday">${dia}</span>`).join("");

    grid.innerHTML = Array.from({ length: primerDia + total }, (_, index) => {
        if (index < primerDia) return `<div class="profile-month-empty" aria-hidden="true"></div>`;
        const dia = index - primerDia + 1;
        const fecha = new Date(calendarioMes.getFullYear(), calendarioMes.getMonth(), dia);
        const fechaISO = formatearFechaISO(fecha);
        const detalle = obtenerDetalleAgendaDiaria(trabajadorId, fechaISO);
        const clase = detalle.estado || "trabaja";
        const claseTemporal = `agenda-day-${detalle.temporalidad}`;
        const turnoIcono = (detalle.turno?.nombre || detalle.horario?.turno || "").toLowerCase().includes("noche") ? "fa-moon" : "fa-sun";
        const etiquetaTemporal = detalle.temporalidad === "hoy" ? "Hoy" : detalle.temporalidad === "pasado" ? "Pasado" : "Futuro";

        return `
            <div class="profile-month-day ${clase} ${claseTemporal}" data-worker-month-day="${fechaISO}" data-worker-id="${trabajadorId}" title="${etiquetaTemporal} · ${detalle.horario?.sede || "Sin sede"}">
                <div class="profile-day-top"><strong>${dia}</strong><span class="profile-temporal-label">${etiquetaTemporal}</span></div>
                <span class="profile-shift"><i class="fa-solid ${turnoIcono}"></i> ${detalle.esFuturo ? "Planificado" : (detalle.turno?.nombre || detalle.horario?.turno || "Sin turno")}</span>
                <span class="state-label ${clase}">${detalle.etiqueta}</span>
                <span class="attendance-inline">${detalle.entrada} - ${detalle.salida}</span>
                <span class="punctuality-badge ${detalle.puntalidad.clase}">${detalle.puntalidad.texto}</span>
                ${detalle.detalleExtra ? `<span class="attendance-inline">${detalle.detalleExtra}</span>` : ""}
            </div>
        `;
    }).join("");

    grid.querySelectorAll("[data-worker-month-day]").forEach(button => {
        button.addEventListener("click", () => {
            abrirEdicionDiaTrabajador(Number(button.dataset.workerId), button.dataset.workerMonthDay);
        });
    });
}

function abrirEdicionDiaTrabajador(trabajadorId, fecha) {
    const trabajador = obtenerTrabajador(trabajadorId);
    if (!trabajador) return;

    const fechaObj = new Date(`${fecha}T00:00:00`);
    const temporalidad = obtenerTipoTemporalFecha(fecha);
    const detalle = obtenerDetalleAgendaDiaria(trabajadorId, fecha);
    const horario = detalle.horario || { turnoId: trabajador.turnoId, sedeId: trabajador.sedeId, estado: "trabaja" };
    const turnoActual = obtenerTurno(horario.turnoId || trabajador.turnoId);
    const turnoContrario = obtenerTurnos().find(item => item.estado === "activo" && Number(item.id) !== Number(trabajador.turnoId));
    const asistencia = obtenerAsistenciaTrabajador(trabajadorId).find(item => item.fecha === fecha);
    const permiso = obtenerPermisoTrabajadorFecha(trabajadorId, fecha);

    const opcionesEstado = {
        pasado: [
            { value: "trabaja", label: "Trabajo (registrado)" },
            { value: "descanso", label: "Descanso" },
            { value: "falta", label: "Faltó" },
            { value: "vacaciones", label: "Vacacionó" }
        ],
        hoy: [
            { value: "trabaja", label: "Trabaja (en curso)" },
            { value: "descanso", label: "Descansa" },
            { value: "falta", label: "Faltó" },
            { value: "vacaciones", label: "Vacaciona" }
        ],
        futuro: [
            { value: "trabaja", label: "Trabajará" },
            { value: "doblete", label: "Doblete" },
            { value: "apoyo", label: "Apoyo" },
            { value: "cambio_turno", label: "Cambio de turno" },
            { value: "cambio_turno_otra", label: "Cambio de turno a otra sede" },
            { value: "descanso", label: "Descansará" },
            { value: "vacaciones", label: "Vacaciones" }
        ]
    };

    const htmlEstado = (opcionesEstado[temporalidad] || opcionesEstado.hoy).map(item => {
        const isSelected = detalle.estado === item.value || (!detalle.estado && item.value === "trabaja");
        return `<option value="${item.value}" ${isSelected ? "selected" : ""}>${item.label}</option>`;
    }).join("");

    let camposExtras = "";
    if (temporalidad === "pasado" || temporalidad === "hoy") {
        camposExtras = `
            <div class="agenda-legend agenda-legend-past">
                <span><i class="legend-dot green"></i>Temprano</span>
                <span><i class="legend-dot yellow"></i>Dentro de tolerancia</span>
                <span><i class="legend-dot orange"></i>Tarde</span>
                <span><i class="legend-dot gray"></i>Descanso</span>
                <span><i class="legend-dot red"></i>Falta</span>
                <span><i class="legend-dot purple"></i>Vacaciones</span>
            </div>
            <div class="agenda-legend agenda-legend-today">
                <span><i class="legend-dot today-work"></i>Hoy: trabajo en curso</span>
                <span><i class="legend-dot today-rest"></i>Hoy: descanso</span>
                <span><i class="legend-dot today-alert"></i>Hoy: incidencia</span>
                <span><i class="legend-dot today-leave"></i>Hoy: permiso/vacaciones</span>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Hora de entrada</label>
                    <input type="time" name="horaEntrada" value="${asistencia?.horaEntrada || turnoActual?.horaInicio || ""}" />
                </div>
                <div class="form-group">
                    <label>Hora de salida</label>
                    <input type="time" name="horaSalida" value="${asistencia?.horaSalida || turnoActual?.horaFin || ""}" />
                </div>
                <div class="form-group">
                    <label>Sede</label>
                    <select name="sedeAsignada">
                        ${obtenerSedes().filter(item => item.estado === "activo").map(sede => `<option value="${sede.id}" ${Number(horario.sedeId || trabajador.sedeId) === Number(sede.id) ? "selected" : ""}>${sede.nombre}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group">
                    <label>Turno</label>
                    <select name="turnoAsignado">
                        ${obtenerTurnos().filter(item => item.estado === "activo").map(turno => `<option value="${turno.id}" ${Number(turnoActual?.id || trabajador.turnoId) === Number(turno.id) ? "selected" : ""}>${turno.nombre}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div class="form-group checkbox-row">
                <label><input type="checkbox" name="dobleteActivo" ${detalle.estado === "doblete" ? "checked" : ""} /> Activar doblete</label>
            </div>
            <div class="form-grid form-doblete-extra" ${detalle.estado === "doblete" ? "" : "style=\"display:none;\""}>
                <div class="form-group">
                    <label>Hora entrada adicional</label>
                    <input type="time" name="dobleteEntrada" value="${asistencia?.horaEntrada || ""}" />
                </div>
                <div class="form-group">
                    <label>Hora salida adicional</label>
                    <input type="time" name="dobleteSalida" value="${asistencia?.horaSalida || ""}" />
                </div>
                <div class="form-group">
                    <label>Sede adicional</label>
                    <select name="dobleteSede">
                        ${obtenerSedes().filter(item => item.estado === "activo").map(sede => `<option value="${sede.id}" ${Number(horario.sedeId || trabajador.sedeId) === Number(sede.id) ? "selected" : ""}>${sede.nombre}</option>`).join("")}
                    </select>
                </div>
            </div>
        `;
    } else if (temporalidad === "futuro") {
        camposExtras = `
            <div class="agenda-legend">
                <span><i class="legend-dot darkgreen"></i>Trabajará</span>
                <span><i class="legend-dot purple"></i>Doblete</span>
                <span><i class="legend-dot brown"></i>Cambio de turno</span>
                <span><i class="legend-dot gray"></i>Descanso</span>
                <span><i class="legend-dot cream"></i>Vacaciones</span>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Turno automático</label>
                    <input type="text" name="turnoAdicionalNombre" value="${turnoContrario?.nombre || "Sin turno contrario"}" readonly />
                    <input type="hidden" name="turnoAdicional" value="${turnoContrario?.id || ""}" />
                </div>
                <div class="form-group">
                    <label>Sede de apoyo</label>
                    <select name="sedeApoyo">
                        <option value="">Sin sede de apoyo</option>
                        ${obtenerSedes().filter(item => item.estado === "activo").map(sede => `<option value="${sede.id}">${sede.nombre}</option>`).join("")}
                    </select>
                </div>
            </div>
            <div class="form-group full-width">
                <label>Motivo / nota</label>
                <textarea name="motivoPlanificado" rows="2" placeholder="Ej. apoyo a otra sede, cambio de turno, vacaciones..."></textarea>
            </div>
        `;
    }

    camposExtras += `
        <div class="form-group full-width day-editor-field" data-day-field="absence-reason">
            <label>Motivo de la ausencia</label>
            <textarea name="faltaMotivo" rows="2">${horario?.motivo || permiso?.motivo || ""}</textarea>
        </div>
        <div class="form-grid day-editor-field" data-day-field="vacation-period">
            <div class="form-group">
                <label>Fecha inicio de permiso o vacaciones</label>
                <input type="date" name="vacacionInicio" value="${permiso?.fechaInicio || fecha}" />
            </div>
            <div class="form-group">
                <label>Fecha fin de permiso o vacaciones</label>
                <input type="date" name="vacacionFin" value="${permiso?.fechaFin || fecha}" />
            </div>
        </div>
        <div class="form-group full-width day-editor-field" data-day-field="vacation-reason">
            <label>Motivo del permiso o vacaciones</label>
            <textarea name="vacacionMotivo" rows="2">${permiso?.motivo || ""}</textarea>
        </div>
        <div class="form-group full-width">
            <label>Observación del cambio</label>
            <textarea name="motivoAgenda" rows="2" placeholder="Detalle del cambio realizado..."></textarea>
        </div>
    `;

    const modal = document.createElement("div");
    modal.className = "modal-overlay active";
    modal.id = "workerDayEditorModal";
    modal.innerHTML = `
        <div class="modal large-modal">
            <div class="modal-header">
                <div>
                    <h2>Editar día del trabajador</h2>
                    <p>${nombreCompleto(trabajador)} · ${NOMBRES_DIAS[fechaObj.getDay()]} ${fechaObj.getDate()} de ${NOMBRES_MESES[fechaObj.getMonth()]} · ${temporalidad}</p>
                </div>
                <button type="button" class="modal-close" data-worker-day-close>
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <form id="workerDayEditorForm">
                <div class="modal-body">
                    <div class="form-grid">
                        <div class="form-group full-width">
                            <label>Estado del día</label>
                            <select name="estado">${htmlEstado}</select>
                        </div>
                    </div>
                    ${camposExtras}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-worker-day-close>Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelectorAll("[data-worker-day-close]").forEach(button => button.addEventListener("click", () => modal.remove()));

    const selectorEstado = modal.querySelector('[name="estado"]');
    const actualizarCamposEstado = () => {
        const estado = selectorEstado.value;
        const esAusencia = estado === "falta" || estado === "permiso";
        const esVacaciones = estado === "vacaciones" || estado === "permiso";
        const esTrabajo = estado === "trabaja" || estado === "doblete" || estado === "apoyo";
        const esPlanificacion = temporalidad === "futuro";
        const dobleteActivo = modal.querySelector('[name="dobleteActivo"]')?.checked === true;

        modal.querySelector('[data-day-field="absence-reason"]')?.classList.toggle("is-hidden", !esAusencia);
        modal.querySelector('[data-day-field="vacation-period"]')?.classList.toggle("is-hidden", !esVacaciones);
        modal.querySelector('[data-day-field="vacation-reason"]')?.classList.toggle("is-hidden", !esVacaciones);
        modal.querySelectorAll('[name="horaEntrada"], [name="horaSalida"], [name="sedeAsignada"], [name="turnoAsignado"], [name="dobleteActivo"]').forEach(field => {
            field.closest(".form-group")?.classList.toggle("is-hidden", esPlanificacion || !esTrabajo);
        });
        modal.querySelector(".form-doblete-extra")?.classList.toggle("is-hidden", esPlanificacion || (estado !== "doblete" && !dobleteActivo));
        modal.querySelectorAll('[name="turnoAdicionalNombre"], [name="turnoAdicional"], [name="motivoPlanificado"]').forEach(field => {
            field.closest(".form-group")?.classList.toggle("is-hidden", !esPlanificacion);
        });
        const sedeApoyo = modal.querySelector('[name="sedeApoyo"]');
        if (sedeApoyo) sedeApoyo.closest(".form-group")?.classList.toggle("is-hidden", !esPlanificacion || !["apoyo", "cambio_turno_otra"].includes(estado));
    };
    if (selectorEstado) {
        selectorEstado.addEventListener("change", actualizarCamposEstado);
        modal.querySelector('[name="dobleteActivo"]')?.addEventListener("change", actualizarCamposEstado);
        actualizarCamposEstado();
    }

    modal.querySelector("#workerDayEditorForm").addEventListener("submit", event => {
        event.preventDefault();
        const form = event.target;
        const estado = form.estado.value;
        const estadoAnterior = detalle.estado || "trabaja";
        const motivo = (form.motivoAgenda?.value || form.motivoPlanificado?.value || form.faltaMotivo?.value || form.vacacionMotivo?.value || "").trim();
        const diaTemporal = obtenerTipoTemporalFecha(fecha);

        const fechaInicioVacaciones = form.vacacionInicio?.value || "";
        const fechaFinVacaciones = form.vacacionFin?.value || "";
        if (diaTemporal !== "futuro" && estado === "trabaja" && (!form.horaEntrada.value || !form.horaSalida.value || !form.sedeAsignada.value || !form.turnoAsignado.value)) {
            alert("Para registrar trabajo debes completar entrada, salida, sede y turno.");
            return;
        }
        if (diaTemporal !== "futuro" && estado === "falta" && !form.faltaMotivo.value.trim()) {
            alert("Debes indicar el motivo de la falta.");
            return;
        }
        if (diaTemporal !== "futuro" && estado === "vacaciones" && (!fechaInicioVacaciones || !fechaFinVacaciones || !form.vacacionMotivo.value.trim())) {
            alert("Debes completar las fechas y el motivo de vacaciones.");
            return;
        }
        if (diaTemporal === "futuro" && estado === "doblete" && !turnoContrario?.id) {
            alert("No existe un turno contrario activo para planificar el doblete.");
            return;
        }
        if (diaTemporal === "futuro" && estado === "apoyo" && !form.sedeApoyo.value) {
            alert("Debes seleccionar la sede de apoyo.");
            return;
        }
        if (diaTemporal === "futuro" && estado === "cambio_turno_otra" && !form.sedeApoyo.value) {
            alert("Debes seleccionar la sede de apoyo.");
            return;
        }
        if (diaTemporal === "futuro" && estado === "vacaciones" && (!fechaInicioVacaciones || !fechaFinVacaciones || !form.vacacionMotivo.value.trim())) {
            alert("Debes completar las fechas y el motivo de vacaciones.");
            return;
        }

        if (diaTemporal === "futuro") {
            eliminarAsistenciaTrabajadorFecha(trabajador.id, fecha);
        }

        const turnoFormulario = obtenerTurno(Number(form.turnoAsignado?.value || trabajador.turnoId));
        if (diaTemporal !== "futuro" && ["trabaja", "doblete"].includes(estado) && !validarOrdenHoras(form.horaEntrada?.value, form.horaSalida?.value, turnoFormulario)) {
            alert(turnoFormulario?.horaFin < turnoFormulario?.horaInicio
                ? "La salida debe ser posterior a la entrada, incluso si ocurre al día siguiente."
                : "La hora de salida debe ser posterior a la hora de entrada.");
            return;
        }
        const turnoDobleteFormulario = obtenerTurno(Number(turnoContrario?.id || form.turnoAsignado?.value || trabajador.turnoId));
        const dobleteActivo = estado === "doblete" || form.dobleteActivo?.checked;
        if (diaTemporal !== "futuro" && dobleteActivo && !validarOrdenHoras(form.dobleteEntrada?.value, form.dobleteSalida?.value, turnoDobleteFormulario)) {
            alert(turnoDobleteFormulario?.horaFin < turnoDobleteFormulario?.horaInicio
                ? "La salida adicional debe ser posterior a la entrada adicional, incluso si ocurre al día siguiente."
                : "La salida adicional debe ser posterior a la entrada adicional.");
            return;
        }

        const guardarHistorial = (detalleCambio) => {
            registrarHistorialCambio({
                tipo: "agenda_manual",
                campo: "estado",
                trabajadorId: trabajador.id,
                fecha,
                usuario: "Administrador",
                valorAnterior: estadoAnterior,
                valorNuevo: estado,
                detalle: detalleCambio,
                idUsuario: 1
            });
        };

        if (diaTemporal === "pasado" || diaTemporal === "hoy") {
            if (estado === "trabaja") {
                const horaEntrada = form.horaEntrada.value;
                const horaSalida = form.horaSalida.value;
                const sedeId = Number(form.sedeAsignada.value || trabajador.sedeId);
                const turnoId = Number(form.turnoAsignado.value || trabajador.turnoId);

                registrarEstadoDia({ trabajadorId: trabajador.id, fecha, estado: "trabaja", sedeId, turnoId, motivo });
                if (horaEntrada || horaSalida) {
                    registrarAsistencia({
                        trabajadorId: trabajador.id,
                        fecha,
                        turnoId,
                        horaProgramadaEntrada: obtenerTurno(turnoId)?.horaInicio || "00:00",
                        horaProgramadaSalida: obtenerTurno(turnoId)?.horaFin || "00:00",
                        horaEntrada: horaEntrada || obtenerTurno(turnoId)?.horaInicio || "00:00",
                        horaSalida: horaSalida || obtenerTurno(turnoId)?.horaFin || "00:00"
                    });
                }
                if (form.dobleteActivo?.checked) {
                    const turnoDoblete = obtenerTurnos().find(item => item.estado === "activo" && Number(item.id) !== Number(turnoId));
                    if (!turnoDoblete) {
                        alert("No existe un turno contrario activo para registrar el doblete.");
                        return;
                    }
                    registrarDoblete({ trabajadorId: trabajador.id, fecha, sedeId, turnoExtraId: turnoDoblete.id, motivo: motivo || "Doblete registrado" });
                }
                guardarHistorial(`Trabajo registrado para ${obtenerSede(sedeId)?.nombre || "-"}`);
            } else if (estado === "doblete") {
                const sedeId = Number(form.dobleteSede?.value || form.sedeAsignada?.value || trabajador.sedeId);
                const turnoId = Number(form.turnoAsignado?.value || trabajador.turnoId);
                registrarDoblete({ trabajadorId: trabajador.id, fecha, sedeId, turnoExtraId: turnoId, motivo: motivo || "Doblete registrado" });
                if (form.dobleteEntrada?.value || form.dobleteSalida?.value) {
                    registrarAsistencia({
                        trabajadorId: trabajador.id,
                        fecha,
                        turnoId,
                        horaProgramadaEntrada: obtenerTurno(turnoId)?.horaInicio || "00:00",
                        horaProgramadaSalida: obtenerTurno(turnoId)?.horaFin || "00:00",
                        horaEntrada: form.dobleteEntrada.value || obtenerTurno(turnoId)?.horaInicio || "00:00",
                        horaSalida: form.dobleteSalida.value || obtenerTurno(turnoId)?.horaFin || "00:00"
                    });
                }
                guardarHistorial(`Doblete registrado en ${obtenerSede(sedeId)?.nombre || "-"}`);
            } else if (estado === "apoyo") {
                const sedeId = Number(form.sedeAsignada?.value || trabajador.sedeId);
                const turnoId = Number(form.turnoAsignado?.value || trabajador.turnoId);
                registrarApoyo({ trabajadorId: trabajador.id, fecha, sedeId, turnoId, motivo: motivo || "Apoyo registrado", confirmado: true });
                guardarHistorial(`Apoyo registrado en ${obtenerSede(sedeId)?.nombre || "-"}`);
            } else if (estado === "descanso") {
                registrarEstadoDia({ trabajadorId: trabajador.id, fecha, estado: "descanso", sedeId: trabajador.sedeId, turnoId: trabajador.turnoId, motivo });
                guardarHistorial("Descanso registrado");
            } else if (estado === "permiso") {
                const fechaInicio = form.vacacionInicio.value || fecha;
                const fechaFin = form.vacacionFin.value || fecha;
                registrarPermiso({ trabajadorId: trabajador.id, fechaInicio, fechaFin, tipo: "Permiso", motivo: motivo || "Permiso registrado" });
                guardarHistorial(`Permiso del ${fechaInicio} al ${fechaFin}`);
            } else if (estado === "falta") {
                registrarEstadoDia({ trabajadorId: trabajador.id, fecha, estado: "falta", sedeId: trabajador.sedeId, turnoId: trabajador.turnoId, motivo: motivo || "Sin motivo indicado" });
                guardarHistorial(`Falta registrada: ${motivo || "sin motivo"}`);
            } else if (estado === "vacaciones") {
                const fechaInicio = form.vacacionInicio.value || fecha;
                const fechaFin = form.vacacionFin.value || fecha;
                registrarPermiso({
                    trabajadorId: trabajador.id,
                    fechaInicio,
                    fechaFin,
                    tipo: "Vacaciones",
                    motivo: form.vacacionMotivo.value || motivo || "Vacaciones"
                });
                guardarHistorial(`Vacaciones del ${fechaInicio} al ${fechaFin}`);
            }
        } else if (diaTemporal === "futuro") {
            if (estado === "trabaja") {
                registrarEstadoDia({ trabajadorId: trabajador.id, fecha, estado: "trabaja", sedeId: trabajador.sedeId, turnoId: trabajador.turnoId, motivo: motivo || "Planificado" });
                guardarHistorial("Trabajo planificado");
            } else if (estado === "doblete") {
                const turnoAdicional = Number(turnoContrario?.id || trabajador.turnoId);
                registrarDoblete({ trabajadorId: trabajador.id, fecha, sedeId: trabajador.sedeId, turnoExtraId: turnoAdicional, motivo: motivo || "Doblete planificado" });
                guardarHistorial(`Doblete planificado con ${obtenerTurno(turnoAdicional)?.nombre || "-"}`);
            } else if (estado === "apoyo") {
                const sedeApoyo = Number(form.sedeApoyo.value || trabajador.sedeId);
                const turnoAdicional = Number(turnoContrario?.id || trabajador.turnoId);
                registrarApoyo({ trabajadorId: trabajador.id, fecha, sedeId: sedeApoyo, turnoId: turnoAdicional, motivo: motivo || "Apoyo planificado", confirmado: true });
                guardarHistorial(`Apoyo planificado a ${obtenerSede(sedeApoyo)?.nombre || "-"}`);
            } else if (estado === "cambio_turno") {
                const turnoCambio = Number(form.turnoAdicional.value || trabajador.turnoId);
                cambiarTurnoDia({ trabajadorId: trabajador.id, fecha, turnoId: turnoCambio, sedeId: trabajador.sedeId, motivo: motivo || "Cambio de turno planificado" });
                guardarHistorial(`Cambio de turno planificado a ${obtenerTurno(turnoCambio)?.nombre || "-"}`);
            } else if (estado === "cambio_turno_otra") {
                const sedeCambio = Number(form.sedeApoyo.value || trabajador.sedeId);
                const turnoCambio = Number(form.turnoAdicional.value || trabajador.turnoId);
                cambiarTurnoDia({ trabajadorId: trabajador.id, fecha, turnoId: turnoCambio, sedeId: sedeCambio, motivo: motivo || "Cambio de turno a otra sede" });
                guardarHistorial(`Cambio planificado a ${obtenerSede(sedeCambio)?.nombre || "-"}`);
            } else if (estado === "descanso") {
                registrarEstadoDia({ trabajadorId: trabajador.id, fecha, estado: "descanso", sedeId: trabajador.sedeId, turnoId: trabajador.turnoId, motivo: motivo || "Descanso planificado" });
                guardarHistorial("Descanso planificado");
            } else if (estado === "vacaciones") {
                const fechaInicio = form.vacacionInicio?.value || fecha;
                const fechaFin = form.vacacionFin?.value || fecha;
                registrarPermiso({ trabajadorId: trabajador.id, fechaInicio, fechaFin, tipo: "Vacaciones", motivo: form.vacacionMotivo?.value || motivo || "Vacaciones" });
                guardarHistorial(`Vacaciones previstas del ${fechaInicio} al ${fechaFin}`);
            }
        }

        modal.remove();
        renderizarTodo();
        renderizarCalendarioTrabajador(trabajador.id);
    });
}

function inicializarMenuAgenda() {
    const panel = document.querySelector(".agenda-side-nav");
    const toggle = document.querySelector("#agendaNavToggle");
    if (!panel || !toggle) return;
    toggle.addEventListener("click", () => {
        const abierto = panel.classList.toggle("is-open");
        toggle.classList.toggle("is-open", abierto);
        toggle.setAttribute("aria-expanded", String(abierto));
    });
}

function aplicarAlcanceAgenda() {
    const scope = window.AGENDA_SCOPE || {};
    if (scope.role === "admin_general") return;
    document.querySelector(".agenda-integrated")?.classList.add("agenda-restricted");
    const sede = document.querySelector("#agendaSedeFilter");
    const workerSede = document.querySelector("#workerFilterSede");
    const attendanceSede = document.querySelector("#attendanceSedeFilter");
    [sede, workerSede, attendanceSede].forEach(select => {
        if (!select) return;
        select.value = String(scope.sedeId || "");
        select.disabled = true;
    });
    document.querySelectorAll("[data-agenda-turno]").forEach(button => {
        button.disabled = true;
        const esNoche = button.dataset.agendaTurno === "night";
        const turno = obtenerTurnos().find(item => Number(item.id) === Number(scope.turnoId));
        button.classList.toggle("active", Boolean(turno && (esNoche === turno.nombre.toLowerCase().includes("noche"))));
    });
    const attendanceTurno = document.querySelector("#attendanceTurnoFilter");
    if (attendanceTurno) {
        attendanceTurno.value = String(scope.turnoId || "");
        attendanceTurno.disabled = true;
    }
    renderizarDashboard();
    renderizarCalendario();
    renderizarTrabajadores();
    renderizarAsistencia();
}

function descargarMoldeTrabajadores() {
    fetch("/api/horarios/molde-trabajadores", { credentials: "same-origin" }).then(response => response.blob()).then(blob => {
        const enlace = document.createElement("a"); enlace.href = URL.createObjectURL(blob); enlace.download = "molde_trabajadores.xlsx"; enlace.click(); URL.revokeObjectURL(enlace.href);
    });
}

function importarTrabajadoresExcel(event) {
    const archivo = event.target.files?.[0];
    if (!archivo) return;
    const form = new FormData(); form.append("archivo", archivo);
    fetch("/api/horarios/importar-trabajadores", { method: "POST", credentials: "same-origin", body: form }).then(response => response.json()).then(resultado => {
        if (!resultado.ok) throw new Error(resultado.error || "No se pudo importar.");
        alert(`Se importaron ${resultado.importados} trabajadores.`); location.reload();
    }).catch(error => alert(error.message));
}