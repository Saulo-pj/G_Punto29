# Cambios operativos

La versión publicada aparece al pie de la barra lateral y se define en el archivo
`VERSION` (actualmente `1.0.3`). Se lee una sola vez al arrancar la aplicación.

El catálogo usa una sola fila `Producto` por ID. Almacén y Admin General administran
sus atributos; cada sede conserva `InventarioSede.stock_actual` y `punto_minimo`.
Las sedes nuevas reciben filas de stock en cero. La baja de un producto lo marca
`Inactivo` en todo el catálogo sin eliminar pedidos, stocks ni movimientos históricos.
No se fusionan automáticamente IDs distintos con nombres parecidos.

Admin General puede seleccionar listas del día de operación, incluidas las finalizadas,
y corregir cantidades sin reabrir su estado. La nueva vista **Ajustes → Roles, áreas y
permisos** permite crear roles, áreas por sede y asignaciones, y editar lectura/escritura.
Sin configuración explícita, los roles existentes conservan sus permisos originales.
Admin General conserva acceso completo, incluido ver y editar arqueos de Almacén.
Los demás roles no pueden acceder a arqueo en Almacén, incluso con permisos explícitos.

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

SSE comunica cambios entre pantallas con alcance de sede y permisos. Cada respuesta
es breve y libera el hilo; EventSource consulta de nuevo cada dos segundos desde el
último cursor. Las pestañas ocultas suspenden esta consulta. Los eventos de la propia
pestaña no recargan la página. La actualización desde otros dispositivos se pospone
mientras se escribe o existen operaciones pendientes. Arqueo actualiza sus bloqueos,
resumen e historial al sincronizar sin recargar toda la página.

Los permisos y catálogos auxiliares se reutilizan solo durante cada petición, sin
caché global de autorizaciones. Inventario agrupa sus conteos en SQL y sincroniza
filas de stock al crear productos/sedes o importar, en lugar de hacerlo al abrir la
vista. Los guardados de cantidad evitan cargar catálogos y selectores administrativos.
Los archivos estáticos tienen URL versionada y caché, sin consultar usuarios en BD.
Los editores de inventario crean sus opciones al abrirse; no repiten todo el catálogo
de categorías/unidades por cada producto oculto.
Las pestañas Lista/Editar/Resumen de checklist se alternan localmente; si se añadieron
o quitaron productos, primero se confirman sus identificadores en el servidor.

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
node tests/checklist_interaction_test.js
```

Las pruebas PostgreSQL verifican carga del controlador y compilación de consultas;
no sustituyen una ejecución de integración contra un servidor PostgreSQL real.
La prueba de cola simula IndexedDB y transporte; falta validar desconexión física,
impresión y comportamiento táctil en los navegadores y dispositivos de producción.
La prueba de interacción comprueba que dos toques actualizan las cantidades antes
de resolver cualquier guardado. Su tiempo local no garantiza un tiempo de red de
50 ms en Railway; la respuesta visual inmediata y la confirmación remota se miden
por separado. Las pruebas de rendimiento limitan el número de consultas SQL y
comprueban que SSE no retiene hilos esperando nuevos eventos.

Medición orientativa en SQLite local con 300 productos, 80 categorías y 80 unidades:
Inventario pasó de 199 a 11 consultas SQL. Tras cargar las plantillas, una respuesta
de Inventario tardó aproximadamente 30 ms. El guardado de cantidad local tardó unos
10 ms. Son mediciones de desarrollo, sin latencia de internet ni carga de Railway.

La capa visual sigue los criterios de respuesta inmediata, jerarquía, tipografía
del sistema, áreas táctiles y accesibilidad de la referencia
[Apple Design de Emil Kowalski](https://github.com/emilkowalski/skills/tree/main/skills/apple-design).
Los principios de gestos físicos se aplican solo donde existe una interacción equivalente.
