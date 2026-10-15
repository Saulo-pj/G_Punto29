# Cambios operativos

El catálogo usa una sola fila `Producto` por ID. Almacén y Admin General administran
sus atributos; cada sede conserva `InventarioSede.stock_actual` y `punto_minimo`.
Las sedes nuevas reciben filas de stock en cero. La baja de un producto lo marca
`Inactivo` en todo el catálogo sin eliminar pedidos, stocks ni movimientos históricos.
No se fusionan automáticamente IDs distintos con nombres parecidos.

Admin General puede seleccionar listas del día de operación, incluidas las finalizadas,
y corregir cantidades sin reabrir su estado. La nueva vista **Ajustes → Roles, áreas y
permisos** permite crear roles, áreas por sede y asignaciones, y editar lectura/escritura.
Sin configuración explícita, los roles existentes conservan sus permisos originales.
Admin General conserva acceso completo. Arqueo rechaza Almacén como sede de destino.

## Guardado local y sincronización

Checklist, despacho de pedidos y arqueo guardan sus operaciones en IndexedDB por
usuario. La interfaz distingue guardado local de confirmación del servidor. La cola
se procesa en orden con la sesión autenticada y un token CSRF revalidado; cada operación
conserva su fecha original e identificador para que un reintento no duplique efectos.
Las cantidades de checklist incluyen el valor anterior para detectar conflictos.
Ante conflicto o rechazo, la cola se detiene y ofrece **Revisar**, **Reintentar** y
**Descartar cambio local**. Descartar requiere confirmación; recargar permite volver
a consultar el valor del servidor. No se fusionan automáticamente conflictos.

La sincronización funciona mientras la aplicación permanece abierta y al recuperar
conexión. Las importaciones requieren conexión. La impresión espera la confirmación
de los cambios pendientes y toma la selección actual de checkboxes.
El service worker mantiene páginas operativas visitadas y recursos locales, separa
la caché por usuario y elimina páginas guardadas al entrar/salir de sesión.
Se requiere HTTPS (o localhost) para service workers. Si el navegador reinicia el
service worker sin una pestaña identificada, exige conexión antes de recuperar
páginas privadas. El borrador de arqueo usa LocalStorage por usuario/fecha/vista.

SSE comunica cambios entre pantallas con alcance de sede y permisos. La actualización
automática se pospone mientras se escribe o existen operaciones pendientes.
`Procfile` usa Gunicorn con threads para los streams SSE; dimensionar workers/threads
según el número de pantallas concurrentes y desactivar buffering SSE en el proxy.

## Instalación y comprobación

Mantener `SECRET_KEY` estable en todas las instancias. Al arrancar, `create_all` crea
las nuevas tablas y la migración existente añade columnas de metadatos a detalles.
No se borran datos. El catálogo compartido materializa filas de stock faltantes en cero.

Pruebas en una base aislada, nunca sobre la base operativa:

```powershell
$env:DATABASE_URL='sqlite:///:memory:'
$env:SECRET_KEY='test-isolated'
python -m unittest discover -s tests -v
node tests/checklist_save_test.js
node tests/local_first_test.js
```

Las pruebas PostgreSQL verifican carga del controlador y compilación de consultas;
no sustituyen una ejecución de integración contra un servidor PostgreSQL real.
La prueba de cola simula IndexedDB y transporte; falta validar desconexión física,
impresión y comportamiento táctil en los navegadores y dispositivos de producción.

La capa visual sigue los criterios de respuesta inmediata, jerarquía, tipografía
del sistema, áreas táctiles y accesibilidad de la referencia
[Apple Design de Emil Kowalski](https://github.com/emilkowalski/skills/tree/main/skills/apple-design).
Los principios de gestos físicos se aplican solo donde existe una interacción equivalente.
