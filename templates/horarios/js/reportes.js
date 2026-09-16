/* Exportacion de reportes sin acoplar la persistencia a la interfaz. */

function escaparCSV(valor) {
    return `"${String(valor ?? "").replace(/"/g, '""')}"`;
}

function exportarCSV(nombre, columnas, filas) {
    const contenido = [columnas, ...filas].map(fila => fila.map(escaparCSV).join(",")).join("\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob(["\ufeff" + contenido], { type: "text/csv;charset=utf-8" }));
    enlace.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
}

function exportarAsistenciaCSV(fecha = "") {
    const sedeId = Number(document.querySelector("#attendanceSedeFilter")?.value || 0);
    const turnoId = Number(document.querySelector("#attendanceTurnoFilter")?.value || 0);
    const trabajadores = obtenerTrabajadores().filter(trabajador => {
        const horario = obtenerHorarioReal(trabajador.id, fecha || formatearFechaISO(new Date()));
        return (!sedeId || Number(horario?.sedeId) === sedeId) && (!turnoId || Number(horario?.turnoId) === turnoId);
    });
    const ids = new Set(trabajadores.map(trabajador => Number(trabajador.id)));
    const filas = (fecha ? obtenerAsistenciaDelDia(fecha) : obtenerAsistencias()).filter(item => ids.has(Number(item.trabajadorId))).map(item => {
        const trabajador = obtenerTrabajador(item.trabajadorId);
        return [fecha || item.fecha, nombreCompleto(trabajador || { nombre: "", apellido: "" }), item.horaEntrada, item.horaSalida, item.estado || item.clasificacion?.estado, item.tardanza, item.horasTrabajadas, item.horasExtras];
    });
    exportarCSV("asistencia", ["Fecha", "Trabajador", "Entrada", "Salida", "Estado", "Tardanza (min)", "Horas trabajadas (min)", "Horas extra (min)"], filas);
}
