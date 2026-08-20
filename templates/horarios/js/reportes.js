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
    const filas = (fecha ? obtenerAsistenciaDelDia(fecha) : obtenerAsistencias()).map(item => {
        const trabajador = obtenerTrabajador(item.trabajadorId);
        return [fecha || item.fecha, nombreCompleto(trabajador || { nombre: "", apellido: "" }), item.horaEntrada, item.horaSalida, item.estado || item.clasificacion?.estado, item.tardanza, item.horasTrabajadas, item.horasExtras];
    });
    exportarCSV("asistencia", ["Fecha", "Trabajador", "Entrada", "Salida", "Estado", "Tardanza (min)", "Horas trabajadas (min)", "Horas extra (min)"], filas);
}
