/* =========================================================
   DATOS INICIALES DEL SISTEMA
========================================================= */

const DATOS_INICIALES = {

    configuracion: {

        empresa: "Organizador de Horarios",

        sedePrincipal: "Sede Principal",

        turnoPrincipal: "Día",

        semanaInicio: 1

    },


    /* =====================================================
       SEDES
    ===================================================== */

    sedes: [

        {
            id: 1,
            nombre: "Sede 17",
            direccion: "San Juan de Lurigancho",
            mesas: 0,
            observaciones: "",
            minimosPorArea: {},
            estado: "activo"
        },

        {
            id: 2,
            nombre: "Sede 20",
            direccion: "San Juan de Lurigancho",
            mesas: 0,
            observaciones: "",
            minimosPorArea: {},
            estado: "activo"
        },

        {
            id: 3,
            nombre: "Almacén Central",
            direccion: "San Juan de Lurigancho",
            mesas: 0,
            observaciones: "",
            minimosPorArea: {},
            estado: "activo"
        }

    ],


    /* =====================================================
       TURNOS
    ===================================================== */

    turnos: [

        {
            id: 1,
            nombre: "Día",
            horaInicio: "12:00",
            horaFin: "17:30",
            toleranciaMinutos: 10,
            estado: "activo"
        },

        {
            id: 2,
            nombre: "Noche",
            horaInicio: "18:30",
            horaFin: "00:30",
            toleranciaMinutos: 10,
            estado: "activo"
        }

    ],


    /* =====================================================
       ÁREAS
    ===================================================== */

    areas: [

        {
            id: 1,
            nombre: "Cocina",
            estado: "activo"
        },

        {
            id: 2,
            nombre: "Producción",
            estado: "activo"
        },

        {
            id: 3,
            nombre: "Salón",
            estado: "activo"
        },

        {
            id: 4,
            nombre: "Bar",
            estado: "activo"
        },

        {
            id: 5,
            nombre: "Administración",
            estado: "activo"
        },

        {
            id: 6,
            nombre: "Marketing",
            estado: "activo"
        }

    ],


    /* =====================================================
       CARGOS
    ===================================================== */

    cargos: [

        {
            id: 1,
            nombre: "Chef",
            areaId: 1,
            estado: "activo"
        },

        {
            id: 2,
            nombre: "Ayudante de cocina",
            areaId: 1,
            estado: "activo"
        },

        {
            id: 3,
            nombre: "Mozo",
            areaId: 3,
            estado: "activo"
        },

        {
            id: 4,
            nombre: "Azafata",
            areaId: 3,
            estado: "activo"
        },

        {
            id: 5,
            nombre: "Bartender",
            areaId: 4,
            estado: "activo"
        },

        {
            id: 6,
            nombre: "Ayudante de bartender",
            areaId: 4,
            estado: "activo"
        },

        {
            id: 7,
            nombre: "Producción",
            areaId: 2,
            estado: "activo"
        },

        {
            id: 8,
            nombre: "Administrador",
            areaId: 5,
            estado: "activo"
        }

    ],


    /* =====================================================
       TRABAJADORES
    ===================================================== */

    trabajadores: [

        {
            id: 1,

            nombre: "Carlos",
            apellido: "Ramírez",

            dni: "71234567",

            telefono: "987654321",

            cargos: [1],

            areaId: 1,

            sedeId: 1,

            fechaNacimiento: "1990-04-15",

            fechaIngreso: "2023-01-10",

            gradoProfesional: "Técnico",

            profesion: "Gastronomía",

            direccion: "SJL",

            emergenciaNumero: "987111222",

            turnoId: 1,

            diaDescanso: 1,

            estado: "activo"

        },


        {
            id: 2,

            nombre: "Miguel",
            apellido: "Torres",

            dni: "72345678",

            telefono: "986555444",

            cargos: [2],

            areaId: 1,

            sedeId: 1,

            fechaNacimiento: "1995-07-20",

            fechaIngreso: "2024-02-15",

            gradoProfesional: "Técnico",

            profesion: "Gastronomía",

            direccion: "SJL",

            emergenciaNumero: "986111333",

            turnoId: 1,

            diaDescanso: 2,

            estado: "activo"

        },


        {
            id: 3,

            nombre: "José",
            apellido: "Quispe",

            dni: "73456789",

            telefono: "985222333",

            cargos: [3, 4],

            areaId: 3,

            sedeId: 2,

            fechaNacimiento: "1993-10-02",

            fechaIngreso: "2023-06-01",

            gradoProfesional: "Universitario",

            profesion: "Administración",

            direccion: "SJL",

            emergenciaNumero: "985444555",

            turnoId: 2,

            diaDescanso: 3,

            estado: "activo"

        },


        {
            id: 4,

            nombre: "Andrea",
            apellido: "Flores",

            dni: "74567890",

            telefono: "984333222",

            cargos: [5],

            areaId: 4,

            sedeId: 2,

            fechaNacimiento: "1997-11-11",

            fechaIngreso: "2024-01-20",

            gradoProfesional: "Técnico",

            profesion: "Bartender",

            direccion: "SJL",

            emergenciaNumero: "984555666",

            turnoId: 2,

            diaDescanso: 4,

            estado: "activo"

        },


        {
            id: 5,

            nombre: "Luis",
            apellido: "Sánchez",

            dni: "75678901",

            telefono: "983444555",

            cargos: [7],

            areaId: 2,

            sedeId: 3,

            fechaNacimiento: "1991-08-25",

            fechaIngreso: "2022-09-10",

            gradoProfesional: "Técnico",

            profesion: "Producción",

            direccion: "SJL",

            emergenciaNumero: "983666777",

            turnoId: 1,

            diaDescanso: 5,

            estado: "activo"

        }

    ],


    /* =====================================================
       EXCEPCIONES DE HORARIO
    ===================================================== */

    excepciones: [

        /*
        Ejemplo:

        {
            id: 1,
            trabajadorId: 1,
            fecha: "2026-08-20",
            tipo: "apoyo",
            sedeId: 2,
            turnoId: 2,
            motivo: "Apoyo por falta de personal"
        }
        */

    ],


    /* =====================================================
       PERMISOS
    ===================================================== */

    permisos: [

        /*
        {
            id: 1,
            trabajadorId: 2,
            fechaInicio: "2026-08-21",
            fechaFin: "2026-08-21",
            tipo: "Permiso",
            motivo: "Cita personal"
        }
        */

    ]

};