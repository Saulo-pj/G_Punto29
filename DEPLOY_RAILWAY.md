# Despliegue en Railway

## Requisitos
- Conectar el repositorio a Railway.
- Crear un servicio de PostgreSQL en Railway.
- Definir las variables de entorno.

## Variables de entorno
- `SECRET_KEY`: clave larga y privada.
- `DATABASE_URL`: la entrega Railway Postgres.
- `FLASK_DEBUG=0` en produccion.

## Arranque
- El proyecto usa `Procfile` con:
  - `web: gunicorn app:app`

## Comportamiento al iniciar
- La app crea las tablas si la base esta vacia.
- La app siembra los datos esenciales iniciales cuando encuentra la base vacia.
- El login usa sesiones persistentes por equipo.

## Archivos que no debes subir
- `.env`
- `.venv/`
- `__pycache__/`
- `cookies.txt`

## Pasos recomendados
1. Subir el proyecto a GitHub.
2. Conectar Railway al repositorio.
3. Agregar PostgreSQL.
4. Copiar `DATABASE_URL` a las variables del servicio web.
5. Definir `SECRET_KEY`.
6. Desplegar.
