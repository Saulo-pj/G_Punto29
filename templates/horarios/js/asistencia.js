/* Control de asistencia y calculos de tiempo. */

function obtenerAsistencias() {
    return obtenerColeccion("asistencias");
}

function minutosDesdeMedianoche(hora) {
    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) return null;
    const [horas, minutos] = hora.split(":").map(Number);
    return horas * 60 + minutos;
}

function diferenciaMinutos(horaInicio, horaFin) {
    const inicio = minutosDesdeMedianoche(horaInicio);
    const fin = minutosDesdeMedianoche(horaFin);
    if (inicio === null || fin === null) return 0;
    return fin >= inicio ? fin - inicio : 1440 - inicio + fin;
}

function calcularTardanza(horaProgramada, horaReal, tolerancia = 0) {
    const diferencia = diferenciaMinutos(horaProgramada, horaReal);
    return Math.max(0, diferencia - Number(tolerancia || 0));
}

function calcularSalidaAnticipada(horaProgramada, horaReal) {
    const programada = minutosDesdeMedianoche(horaProgramada);
    const real = minutosDesdeMedianoche(horaReal);
    if (programada === null || real === null) return 0;
    let diferencia = programada - real;
    if (diferencia > 720) diferencia -= 1440;
    if (diferencia < -720) diferencia += 1440;
    return Math.max(0, diferencia);
}

function calcularHorasTrabajadas(horaEntrada, horaSalida) {
    return diferenciaMinutos(horaEntrada, horaSalida);
}

function calcularHorasExtras(horaProgramadaSalida, horaSalidaReal) {
    const programada = minutosDesdeMedianoche(horaProgramadaSalida);
    const real = minutosDesdeMedianoche(horaSalidaReal);
    if (programada === null || real === null) return 0;
    const diferencia = diferenciaMinutos(horaProgramadaSalida, horaSalidaReal);
    return real === programada ? 0 : diferencia;
}

function clasificarAsistencia(tardanza, tolerancia = 0, limiteLeve = 15) {
    if (tardanza <= 0) return { estado: "a_tiempo", clase: "attendance-on-time" };
    return tardanza <= Number(limiteLeve) ? { estado: "tardanza_leve", clase: "attendance-late" } : { estado: "tardanza_grave", clase: "attendance-late-severe" };
}

function calcularResumenAsistencia(registro) {
    const trabajador = obtenerTrabajador(registro.trabajadorId);
    const turno = obtenerTurno(registro.turnoId || trabajador?.turnoId);
    const tolerancia = turno?.toleranciaMinutos || 0;
    const tardanza = calcularTardanza(registro.horaProgramadaEntrada, registro.horaEntrada, tolerancia);
    const salidaAnticipada = calcularSalidaAnticipada(registro.horaProgramadaSalida, registro.horaSalida);
    const horasTrabajadas = calcularHorasTrabajadas(registro.horaEntrada, registro.horaSalida);
    const horasProgramadas = calcularHorasTrabajadas(registro.horaProgramadaEntrada, registro.horaProgramadaSalida);
    return { tardanza, salidaAnticipada, horasTrabajadas, horasExtras: Math.max(0, horasTrabajadas - horasProgramadas), clasificacion: clasificarAsistencia(tardanza, tolerancia) };
}

function registrarAsistencia(datos) {
    const asistencias = obtenerAsistencias();
    const existente = asistencias.find(item => Number(item.trabajadorId) === Number(datos.trabajadorId) && item.fecha === datos.fecha && Number(item.turnoId) === Number(datos.turnoId));
    const registro = { id: existente?.id || generarId("asistencias"), ...datos, ...calcularResumenAsistencia(datos), actualizadoEn: new Date().toISOString() };
    if (existente) asistencias[asistencias.indexOf(existente)] = registro; else asistencias.push(registro);
    actualizarColeccion("asistencias", asistencias);
    registrarAuditoriaAgenda("guardar_asistencia", "asistencia", { trabajadorId: datos.trabajadorId, fecha: datos.fecha, turnoId: datos.turnoId });
    return registro;
}

function registrarEntrada(datos) {
    const actual = obtenerAsistencias().find(item => Number(item.trabajadorId) === Number(datos.trabajadorId) && item.fecha === datos.fecha && Number(item.turnoId) === Number(datos.turnoId));
    return registrarAsistencia({ ...actual, ...datos, horaEntrada: datos.horaEntrada });
}

function registrarSalida(datos) {
    const actual = obtenerAsistencias().find(item => Number(item.trabajadorId) === Number(datos.trabajadorId) && item.fecha === datos.fecha && Number(item.turnoId) === Number(datos.turnoId));
    if (!actual?.horaEntrada && !datos.horaEntrada) throw new Error("No se puede registrar la salida sin una entrada.");
    return registrarAsistencia({ ...actual, ...datos, horaSalida: datos.horaSalida, horaEntrada: datos.horaEntrada || actual.horaEntrada });
}

function obtenerAsistenciaDelDia(fecha) { return obtenerAsistencias().filter(item => item.fecha === fecha); }
function obtenerAsistenciaTrabajador(trabajadorId) { return obtenerAsistencias().filter(item => Number(item.trabajadorId) === Number(trabajadorId)); }
function eliminarAsistenciaTrabajadorFecha(trabajadorId, fecha) {
    const asistencias = obtenerAsistencias().filter(item => !(Number(item.trabajadorId) === Number(trabajadorId) && item.fecha === fecha));
    actualizarColeccion("asistencias", asistencias);
}
function obtenerResumenAsistencia(fecha = "") {
    const registros = fecha ? obtenerAsistenciaDelDia(fecha) : obtenerAsistencias();
    return { total: registros.length, presentes: registros.filter(item => item.horaEntrada).length, tardanzas: registros.filter(item => item.tardanza > 0).length, tardanzasLeves: registros.filter(item => item.clasificacion?.estado === "tardanza_leve").length, tardanzasGraves: registros.filter(item => item.clasificacion?.estado === "tardanza_grave").length, horasExtras: registros.reduce((total, item) => total + Number(item.horasExtras || 0), 0) };
}
