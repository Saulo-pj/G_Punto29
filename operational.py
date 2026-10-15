"""Additive administration and synchronization for the existing Flask modules."""
import hashlib
import json
import time

from flask import abort, g, jsonify, render_template, request, session, Response, stream_with_context
from flask_login import current_user, login_required
from sqlalchemy.exc import IntegrityError
from database import db, Rol, Usuario, Sede, Area, AreaSede, AreaSedeRol, PermisoRol, OperacionLocal, EventoSistema

MODULES = ('dashboard', 'inventario', 'movimientos', 'pedidos', 'checklist', 'arqueo', 'mermas', 'incidencias', 'horarios', 'ajustes')


def is_warehouse(sede):
    return bool(sede and sede.nombre_sede.strip().casefold() in {'almacen', 'almacén'})


def register_operations(app, csrf_token):
    @app.get('/api/session/csrf')
    @login_required
    def session_csrf():
        return jsonify(token=csrf_token(), user=current_user.id_usuario)

    @app.before_request
    def reserve_operation():
        if request.method == 'POST':
            g.flash_start = len(session.get('_flashes', []))
        # CSRF has already run. Receipt and business changes commit together.
        if request.method != 'POST' or request.path not in {'/checklist', '/pedidos', '/arqueo'}:
            return
        if not current_user.is_authenticated:
            return
        g.flash_start = len(session.get('_flashes', []))
        operation_id = request.headers.get('X-Operation-ID')
        if not operation_id:
            return
        if len(operation_id) > 80:
            abort(400)
        body = request.get_json(silent=True) if request.is_json else {k: request.form.getlist(k) for k in request.form if k != 'csrf_token'}
        fingerprint = hashlib.sha256(json.dumps([request.full_path, request.headers.get('X-Operation-Date'), body], sort_keys=True).encode()).hexdigest()
        prior = db.session.get(OperacionLocal, operation_id)
        if prior:
            if prior.id_usuario != current_user.id_usuario or prior.huella != fingerprint:
                return jsonify(ok=False, message='La operación cambió. Revisa los datos pendientes.'), 409
            g.replayed = True
            return jsonify(ok=True, duplicate=True) if request.path == '/arqueo' else ('', 204)
        if request.path == '/checklist' and request.form.get('action') == 'qty_set' and 'expected_qty' in request.form:
            from database import DetallePedido
            detail = DetallePedido.query.filter_by(id_detalle=request.form.get('id_detalle', type=int)).with_for_update().first()
            try:
                expected_qty = float(request.form['expected_qty'])
            except ValueError:
                abort(400)
            if detail and abs(float(detail.cantidad_pedida or 0) - expected_qty) > .0001:
                return jsonify(ok=False, message='La cantidad cambió en otro dispositivo. Revisa la lista antes de sincronizar.'), 409
        db.session.add(OperacionLocal(id=operation_id, id_usuario=current_user.id_usuario, huella=fingerprint))
        try:
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            return jsonify(ok=False, message='Operación en curso. Reintenta la sincronización.'), 409

    @app.after_request
    def operation_feedback(response):
        if getattr(g, 'replayed', False):
            return response
        if request.method != 'POST' or request.path not in {'/checklist', '/pedidos', '/arqueo', '/inventario', '/inventario/import', '/admin/ajustes', '/admin/permisos'}:
            return response
        if not current_user.is_authenticated:
            return response
        errors = [message for category, message in session.get('_flashes', [])[getattr(g, 'flash_start', 0):] if category == 'error']
        if errors and request.headers.get('X-Operation-ID'):
            db.session.rollback()
            OperacionLocal.query.filter_by(id=request.headers['X-Operation-ID'], id_usuario=current_user.id_usuario).delete()
            db.session.commit()
            return jsonify(ok=False, message=errors[-1]), 422
        if response.status_code < 400 and not errors:
            module = {'/admin/ajustes': 'ajustes', '/admin/permisos': 'ajustes', '/inventario/import': 'inventario'}.get(request.path, request.path[1:])
            db.session.add(EventoSistema(modulo=module, id_sede=current_user.id_sede, id_usuario=current_user.id_usuario))
            db.session.commit()
        else:
            db.session.rollback()
        return response

    @app.get('/api/events')
    @login_required
    def events():
        user_id = current_user.id_usuario
        raw = request.headers.get('Last-Event-ID', request.args.get('after', ''))
        last = int(raw) if raw.isdigit() else (db.session.query(db.func.max(EventoSistema.id)).scalar() or 0)

        @stream_with_context
        def generate():
            nonlocal last
            yield ': connected\n\n'
            # Bounded streams release workers; EventSource reconnects automatically.
            for _ in range(20):
                db.session.expire_all()
                user = db.session.get(Usuario, user_id)
                if not user:
                    return
                rows = EventoSistema.query.filter(EventoSistema.id > last).order_by(EventoSistema.id).limit(100).all()
                for row in rows:
                    last = row.id
                    if user.can_view(row.modulo) and (row.modulo in {'inventario', 'ajustes'} or user.rol_nombre in {'admin_general', 'admin_almacen', 'personal_prod'} or row.id_sede == user.id_sede):
                        yield f'id: {row.id}\ndata: {json.dumps({"module": row.modulo, "actor": row.id_usuario})}\n\n'
                db.session.remove()
                yield f'id: {last}\n: heartbeat\n\n'
                time.sleep(1)
        return Response(generate(), mimetype='text/event-stream', headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-store'})

    @app.route('/admin/permisos', methods=['GET', 'POST'])
    @login_required
    def permisos():
        if current_user.rol_nombre != 'admin_general':
            abort(403)
        error = None
        if request.method == 'POST':
            action = request.form.get('action')
            name = request.form.get('nombre', '').strip().lower()
            if action == 'role':
                if not name or len(name) > 50 or Rol.query.filter(db.func.lower(Rol.nombre_rol) == name).first():
                    error = 'El nombre de rol está vacío o ya existe.'
                else:
                    db.session.add(Rol(nombre_rol=name))
            elif action in {'area', 'area_roles'}:
                sede = db.session.get(Sede, request.form.get('id_sede', type=int))
                if not sede:
                    abort(400)
                if action == 'area':
                    if not name or len(name) > 50:
                        abort(400)
                    area = Area.query.filter(db.func.lower(Area.nombre_area) == name).first()
                    if not area:
                        area = Area(nombre_area=name)
                        db.session.add(area)
                        db.session.flush()
                    if not db.session.get(AreaSede, (sede.id_sede, area.id_area)):
                        db.session.add(AreaSede(id_sede=sede.id_sede, id_area=area.id_area))
                else:
                    area_id = request.form.get('id_area', type=int)
                    if not db.session.get(AreaSede, (sede.id_sede, area_id)):
                        abort(400)
                    ids = request.form.getlist('roles', type=int)
                    if any(not db.session.get(Rol, rid) for rid in ids):
                        abort(400)
                    AreaSedeRol.query.filter_by(id_sede=sede.id_sede, id_area=area_id).delete()
                    for rid in set(ids):
                        db.session.add(AreaSedeRol(id_sede=sede.id_sede, id_area=area_id, id_rol=rid))
            elif action == 'matrix':
                role = db.session.get(Rol, request.form.get('id_rol', type=int))
                if not role or role.nombre_rol == 'admin_general':
                    abort(400)
                for module in MODULES:
                    read = request.form.get(f'{module}_read') == 'on'
                    write = request.form.get(f'{module}_write') == 'on'
                    permission = db.session.get(PermisoRol, (role.id_rol, module))
                    if not permission:
                        permission = PermisoRol(id_rol=role.id_rol, modulo=module)
                        db.session.add(permission)
                    permission.lectura, permission.escritura = read or write, write
            else:
                abort(400)
            if not error:
                db.session.commit()
        roles = Rol.query.order_by(Rol.nombre_rol).all()
        selected_id = request.values.get('id_rol', type=int)
        selected = db.session.get(Rol, selected_id) if selected_id else None
        if not selected:
            selected = next((r for r in roles if r.nombre_rol != 'admin_general'), roles[0])
        scopes = db.session.query(AreaSede, Sede, Area).join(Sede, Sede.id_sede == AreaSede.id_sede).join(Area, Area.id_area == AreaSede.id_area).all()
        assigned = {(r.id_sede, r.id_area, r.id_rol) for r in AreaSedeRol.query.all()}
        sample = Usuario(id_rol=selected.id_rol)
        # Detached sample evaluates legacy defaults without adding a user to the role.
        from sqlalchemy.orm.attributes import set_committed_value
        set_committed_value(sample, 'rol', selected)
        return render_template('admin/permisos.html', roles=roles, selected=selected, modules=MODULES, sample=sample, sedes=Sede.query.all(), scopes=scopes, assigned=assigned, error=error, saved=request.method == 'POST' and not error)
