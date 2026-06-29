# G_Punto29

Sistema web Flask para inventario, pedidos, checklist y arqueo de caja.

## Despliegue

- Configurado para Railway con `gunicorn`.
- Usa PostgreSQL en produccion a traves de `DATABASE_URL`.
- La base se inicializa desde cero al arrancar si no existe estructura.

## Requisitos de entorno

- `SECRET_KEY`
- `DATABASE_URL`
- `FLASK_DEBUG=0`
