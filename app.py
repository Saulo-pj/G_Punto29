import os
import importlib
import json
from io import BytesIO
from datetime import datetime, timedelta
from collections import defaultdict
from flask import Flask, flash, redirect, render_template, request, send_file, send_from_directory, url_for, session
from flask_login import LoginManager, current_user, login_required, login_user, logout_user
from dotenv import load_dotenv
from sqlalchemy import or_
from sqlalchemy import inspect, text
from werkzeug.security import check_password_hash, generate_password_hash

from database import (
	ArqueoCaja,
	ChecklistPedido,
	PlantillaChecklistItem,
	Area,
	Categoria,
	DetallePedido,
	InventarioSede,
	MovimientoInventario,
	Producto,
	Rol,
	Sede,
	Unidad,
	Subarea,
	Turno,
	Usuario,
	db,
)

load_dotenv()  # Carga variables desde .env en local

login_manager = LoginManager()
login_manager.login_view = 'login'

DEFAULT_AREAS = {
	'cocina': ['cocina_caliente', 'cocina_fria', 'lavadero', 'mise_en_place'],
	'sala': ['sala'],
}


def _slugify(value):
	return (value or '').strip().lower().replace(' ', '_')


def _get_area_names():
	return [area.nombre_area for area in Area.query.order_by(Area.nombre_area).all()]


def _get_subareas_for_area(area_name):
	area_norm = _slugify(area_name)
	area = Area.query.filter(db.func.lower(Area.nombre_area) == area_norm).first()
	if not area:
		return DEFAULT_AREAS.get(area_norm, [])
	return [subarea.nombre_subarea for subarea in Subarea.query.filter_by(id_area=area.id_area).order_by(Subarea.nombre_subarea).all()]


def _normalize_area(value):
	area_norm = _slugify(value)
	area = Area.query.filter(db.func.lower(Area.nombre_area) == area_norm).first()
	return area.nombre_area if area else ''


def _normalize_subarea(area, subarea):
	area_name = _normalize_area(area)
	if not area_name:
		return ''
	options = _get_subareas_for_area(area_name)
	if not options:
		options = DEFAULT_AREAS.get(_slugify(area_name), [])
	sub = _slugify(subarea)
	return sub if sub in {_slugify(option) for option in options} else (options[0] if options else '')


def _get_operation_date(now=None):
	now = now or datetime.now()
	if now.hour < 4:
		return now - timedelta(days=1)
	return now


def _get_selected_app_date():
	selected_date = session.get('app_date', '').strip()
	if not selected_date:
		operation_date = _get_operation_date().date()
		session['app_date'] = operation_date.strftime('%Y-%m-%d')
		return operation_date
	try:
		return datetime.strptime(selected_date, '%Y-%m-%d').date()
	except ValueError:
		operation_date = _get_operation_date().date()
		session['app_date'] = operation_date.strftime('%Y-%m-%d')
		return operation_date


def _allowed_views(user):
	view_order = [
		('dashboard', 'Inicio'),
		('inventario', 'Inventario'),
		('movimientos', 'Movimientos'),
		('pedidos', 'Pedidos'),
		('checklist', 'Checklist'),
		('arqueo', 'Arqueo Caja'),
		('ajustes', 'Ajustes'),
	]
	allowed = [item for item in view_order if user.can_view(item[0])]
	if user.can_view('inventario'):
		insert_index = 1
		for idx, item in enumerate(allowed):
			if item[0] == 'inventario':
				insert_index = idx + 1
				break
		allowed.insert(insert_index, ('inventario_dashboard', 'Dashboard Inventario'))
	return allowed


def _seed_catalogs():
	if Rol.query.count() == 0:
		for name in ['admin_general', 'admin_almacen', 'personal_prod', 'admin_sala', 'cocinero']:
			db.session.add(Rol(nombre_rol=name))

	if Sede.query.count() == 0:
		db.session.add(Sede(nombre_sede='Almacen'))

	if Turno.query.count() == 0:
		for code, name in [('MANANA', 'Manana'), ('NOCHE', 'Noche'), ('NA', 'N/A')]:
			db.session.add(Turno(id_turno=code, nombre_turno=name))

	if Categoria.query.count() == 0:
		for name in ['Carnes', 'Pollos', 'Condimentos', 'Abarrotes', 'Preparados']:
			db.session.add(Categoria(nombre_categoria=name))
	else:
		legacy_categories = ['Cocina', 'Sala', 'Almacen']
		for legacy in legacy_categories:
			if not Producto.query.filter(Producto.id_area == legacy).first():
				legacy_item = Categoria.query.filter_by(nombre_categoria=legacy).first()
				if legacy_item:
					db.session.delete(legacy_item)
		for name in ['Carnes', 'Pollos', 'Condimentos', 'Abarrotes', 'Preparados']:
			if not Categoria.query.filter(db.func.lower(Categoria.nombre_categoria) == name.lower()).first():
				db.session.add(Categoria(nombre_categoria=name))

	if Unidad.query.count() == 0:
		for name in ['kg', 'Litro', 'unidad']:
			db.session.add(Unidad(nombre_unidad=name))

	if Area.query.count() == 0:
		for name in ['cocina', 'sala']:
			db.session.add(Area(nombre_area=name))

	db.session.flush()
	for area_name, subareas in DEFAULT_AREAS.items():
		area = Area.query.filter(db.func.lower(Area.nombre_area) == area_name).first()
		if area:
			for subarea_name in subareas:
				if not Subarea.query.filter_by(id_area=area.id_area, nombre_subarea=subarea_name).first():
					db.session.add(Subarea(id_area=area.id_area, nombre_subarea=subarea_name))

	db.session.commit()

	admin_role = Rol.query.filter_by(nombre_rol='admin_general').first()
	main_sede = Sede.query.first()
	na_turno = Turno.query.filter_by(id_turno='NA').first()
	admin_user = Usuario.query.filter_by(username='admin').first()
	if not admin_user and admin_role and main_sede and na_turno:
		db.session.add(
			Usuario(
				id_usuario='admin',
				username='admin',
				password_hash=generate_password_hash('admin1234'),
				id_rol=admin_role.id_rol,
				id_sede=main_sede.id_sede,
				id_turno=na_turno.id_turno,
			)
		)
		db.session.commit()


@login_manager.user_loader
def load_user(user_id):
	return db.session.get(Usuario, user_id)


def _forbidden_redirect():
	flash('No tienes permisos para entrar a esta vista.', 'error')
	return redirect(url_for('dashboard'))


def _stats_for_user(user):
	stats = {
		'productos': Producto.query.count(),
		'movimientos': MovimientoInventario.query.count(),
		'pedidos': ChecklistPedido.query.count(),
		'arqueos': ArqueoCaja.query.count(),
	}
	return stats


def _home_alerts_for_user(user, selected_date):
	date_str = selected_date.strftime('%Y-%m-%d')
	alerts = {
		'stock_critico_count': 0,
		'pedidos_pendientes_count': 0,
		'missing_arqueo': False,
		'subtitle': 'Resumen de tareas para hoy segun tu rol.',
		'cards': [],
	}

	stock_query = InventarioSede.query
	if user.rol_nombre != 'admin_general':
		stock_query = stock_query.filter(InventarioSede.id_sede == user.id_sede)
	alerts['stock_critico_count'] = stock_query.filter(
		InventarioSede.punto_minimo > 0,
		InventarioSede.stock_actual <= InventarioSede.punto_minimo,
	).count()

	if user.can_view('pedidos'):
		pedidos_query = ChecklistPedido.query.filter(
			db.func.date(ChecklistPedido.fecha) == date_str,
			ChecklistPedido.estado_general == 'Pendiente',
		)
		if user.rol_nombre not in {'admin_general', 'admin_almacen', 'personal_prod'}:
			pedidos_query = pedidos_query.filter(ChecklistPedido.id_sede == user.id_sede)
		alerts['pedidos_pendientes_count'] = pedidos_query.count()

	if user.can_view('arqueo'):
		arqueo_query = ArqueoCaja.query.filter(ArqueoCaja.fecha == selected_date)
		if user.rol_nombre != 'admin_general':
			arqueo_query = arqueo_query.filter(
				ArqueoCaja.id_sede == user.id_sede,
				ArqueoCaja.id_turno == user.id_turno,
			)
		alerts['missing_arqueo'] = arqueo_query.count() == 0

	role_name = user.rol_nombre

	if role_name == 'admin_general':
		alerts['subtitle'] = 'Vision global: pendientes de todo el equipo.'
		checklists_pendientes = ChecklistPedido.query.filter(
			db.func.date(ChecklistPedido.fecha) == date_str,
			ChecklistPedido.estado_general.in_(['Borrador', 'Pendiente']),
		).count()
		admin_sala_scopes = db.session.query(Usuario.id_sede, Usuario.id_turno).join(
			Rol, Rol.id_rol == Usuario.id_rol
		).filter(
			Rol.nombre_rol == 'admin_sala'
		).distinct().all()
		missing_arqueos_count = 0
		for scope in admin_sala_scopes:
			if ArqueoCaja.query.filter_by(
				fecha=selected_date,
				id_sede=scope.id_sede,
				id_turno=scope.id_turno,
			).first() is None:
				missing_arqueos_count += 1

		alerts['cards'] = [
			{
				'title': 'Stock critico',
				'message': f"Hay {alerts['stock_critico_count']} productos con stock critico.",
				'state': 'warn' if alerts['stock_critico_count'] > 0 else 'ok',
				'link': 'inventario',
			},
			{
				'title': 'Pedidos pendientes',
				'message': f"Hay {alerts['pedidos_pendientes_count']} pedidos sin cerrar.",
				'state': 'warn' if alerts['pedidos_pendientes_count'] > 0 else 'ok',
				'link': 'pedidos',
			},
			{
				'title': 'Checklist pendientes',
				'message': f"Hay {checklists_pendientes} checklist en borrador o pendiente.",
				'state': 'warn' if checklists_pendientes > 0 else 'ok',
				'link': 'checklist',
			},
			{
				'title': 'Arqueos faltantes',
				'message': f"Faltan {missing_arqueos_count} arqueos de admin sala por registrar.",
				'state': 'warn' if missing_arqueos_count > 0 else 'ok',
				'link': 'arqueo',
			},
		]
		return alerts

	if role_name == 'cocinero':
		alerts['subtitle'] = 'Tu foco es completar y enviar tu checklist del turno.'
		my_checklist = _checklist_base_query(user, selected_date).order_by(ChecklistPedido.id_pedido.desc()).first()
		checklist_done = bool(my_checklist and my_checklist.estado_general in {'Enviado', 'Finalizado'})
		if my_checklist is None:
			message = 'Aun no creaste tu lista de hoy.'
		elif checklist_done:
			message = f'Tu lista ya fue enviada. Estado: {my_checklist.estado_general}.'
		else:
			message = f"Tu lista aun esta en estado {my_checklist.estado_general}."
		alerts['cards'] = [
			{
				'title': 'Checklist de cocina',
				'message': message,
				'state': 'ok' if checklist_done else 'warn',
				'link': 'checklist',
			}
		]
		return alerts

	if role_name == 'admin_sala':
		alerts['subtitle'] = 'Hoy debes completar checklist y registrar arqueo de caja.'
		my_checklist = _checklist_base_query(user, selected_date).order_by(ChecklistPedido.id_pedido.desc()).first()
		checklist_done = bool(my_checklist and my_checklist.estado_general in {'Enviado', 'Finalizado'})
		if my_checklist is None:
			checklist_message = 'Aun no creaste tu checklist del turno.'
		elif checklist_done:
			checklist_message = 'Checklist completado correctamente.'
		else:
			checklist_message = f"Checklist en progreso ({my_checklist.estado_general})."

		arqueo_done = not alerts['missing_arqueo']
		alerts['cards'] = [
			{
				'title': 'Checklist de sala',
				'message': checklist_message,
				'state': 'ok' if checklist_done else 'warn',
				'link': 'checklist',
			},
			{
				'title': 'Arqueo de caja',
				'message': 'Arqueo registrado para hoy.' if arqueo_done else 'Falta registrar arqueo de caja hoy.',
				'state': 'ok' if arqueo_done else 'warn',
				'link': 'arqueo',
			},
		]
		return alerts

	if role_name == 'personal_prod':
		alerts['subtitle'] = 'Seguimiento de tu lista de pedidos de produccion.'
		my_pedido = ChecklistPedido.query.filter(
			ChecklistPedido.id_usuario == user.id_usuario,
			db.func.date(ChecklistPedido.fecha) == date_str,
		).order_by(ChecklistPedido.id_pedido.desc()).first()
		created = my_pedido is not None
		sent = bool(my_pedido and my_pedido.estado_general in {'Enviado', 'Finalizado'})
		alerts['cards'] = [
			{
				'title': 'Lista creada',
				'message': 'Tu lista de pedidos de hoy ya existe.' if created else 'Todavia no creaste tu lista de pedidos de hoy.',
				'state': 'ok' if created else 'warn',
				'link': 'pedidos',
			},
			{
				'title': 'Lista enviada',
				'message': 'Tu lista ya fue enviada a sede.' if sent else 'Aun no enviaste la lista a sede.',
				'state': 'ok' if sent else 'warn',
				'link': 'pedidos',
			},
		]
		return alerts

	alerts['cards'] = [
		{
			'title': 'Stock bajo',
			'message': f"Hay {alerts['stock_critico_count']} productos con stock critico.",
			'state': 'warn' if alerts['stock_critico_count'] > 0 else 'ok',
			'link': 'inventario',
		},
		{
			'title': 'Pedidos pendientes',
			'message': f"Tienes {alerts['pedidos_pendientes_count']} pedidos por revisar.",
			'state': 'warn' if alerts['pedidos_pendientes_count'] > 0 else 'ok',
			'link': 'pedidos',
		},
	]

	return alerts


def _inventory_dashboard_metrics(user, selected_date):
	base_inv = db.session.query(Producto, InventarioSede, Sede).join(
		InventarioSede,
		Producto.id_producto == InventarioSede.id_producto,
	).outerjoin(
		Sede,
		Sede.id_sede == InventarioSede.id_sede,
	)
	if user.rol_nombre != 'admin_general':
		base_inv = base_inv.filter(InventarioSede.id_sede == user.id_sede)

	inventory_rows = base_inv.order_by(Producto.nombre_producto.asc()).all()
	por_acabarse = []
	acabados = []
	abastecidos = 0

	for producto, inv, sede in inventory_rows:
		stock = _safe_float(inv.stock_actual, 0.0)
		minimo = _safe_float(inv.punto_minimo, 0.0)
		if stock <= 0:
			acabados.append((producto, inv, sede))
		elif minimo > 0 and stock <= minimo:
			por_acabarse.append((producto, inv, sede))
		else:
			abastecidos += 1

	period_start = selected_date - timedelta(days=29)
	salidas_query = db.session.query(
		MovimientoInventario.id_producto,
		Producto.nombre_producto,
		db.func.sum(MovimientoInventario.cantidad).label('total_salida'),
	).join(
		Producto,
		Producto.id_producto == MovimientoInventario.id_producto,
	).filter(
		db.func.upper(MovimientoInventario.tipo) == 'SALIDA',
		db.func.date(MovimientoInventario.fecha) >= period_start.strftime('%Y-%m-%d'),
		db.func.date(MovimientoInventario.fecha) <= selected_date.strftime('%Y-%m-%d'),
	)
	if user.rol_nombre != 'admin_general':
		salidas_query = salidas_query.filter(MovimientoInventario.id_sede == user.id_sede)

	top_salidas = salidas_query.group_by(
		MovimientoInventario.id_producto,
		Producto.nombre_producto,
	).order_by(text('total_salida DESC')).limit(8).all()

	return {
		'kpis': {
			'total_items': len(inventory_rows),
			'por_acabarse': len(por_acabarse),
			'acabados': len(acabados),
			'abastecidos': abastecidos,
		},
		'top_salidas': top_salidas,
		'por_acabarse': por_acabarse[:30],
		'acabados': acabados[:30],
		'chart_top_salidas': {
			'labels': [row.nombre_producto or row.id_producto for row in top_salidas],
			'values': [round(_safe_float(row.total_salida, 0.0), 2) for row in top_salidas],
		},
		'chart_stock': {
			'labels': ['Abastecidos', 'Por acabarse', 'Acabados'],
			'values': [abastecidos, len(por_acabarse), len(acabados)],
		},
	}


def _inventory_query_for_user(user, q='', categoria='', subarea='', unidad='', area=''):
	query = db.session.query(Producto, InventarioSede, Sede).outerjoin(
		InventarioSede,
		Producto.id_producto == InventarioSede.id_producto,
	).outerjoin(Sede, Sede.id_sede == InventarioSede.id_sede)

	if user.rol_nombre != 'admin_general':
		query = query.filter(InventarioSede.id_sede == user.id_sede)

	if q:
		like_q = f"%{q}%"
		query = query.filter(
			or_(
				Producto.id_producto.ilike(like_q),
				Producto.nombre_producto.ilike(like_q),
				Producto.id_area.ilike(like_q),
				Producto.area.ilike(like_q),
				Producto.subarea.ilike(like_q),
			)
		)

	if categoria:
		query = query.filter(Producto.id_area == categoria)

	if area:
		query = query.filter(Producto.area == _normalize_area(area))

	if subarea:
		query = query.filter(Producto.subarea == subarea)

	if unidad:
		query = query.filter(Producto.unidad == unidad)

	return query.order_by(Producto.nombre_producto.asc())


def _safe_float(value, default=0.0):
	try:
		return float(value)
	except (TypeError, ValueError):
		return default


def _parse_gastos_from_form(form_data):
	nombres = form_data.getlist('gasto_nombre[]')
	montos = form_data.getlist('gasto_monto[]')
	gastos = []
	for nombre, monto_raw in zip(nombres, montos):
		nombre_limpio = (nombre or '').strip()
		monto = _safe_float(monto_raw, 0.0)
		if not nombre_limpio and monto <= 0:
			continue
		if monto < 0:
			monto = 0.0
		gastos.append({'nombre': nombre_limpio or 'Gasto', 'monto': monto})
	return gastos


def _calc_cierre_operativo(monto_inicial, pos_tarjetas, yape, plin, efectivo, venta_sistema, gastos):
	total_ingresos = pos_tarjetas + yape + plin + efectivo
	gastos_totales = sum(_safe_float(item.get('monto'), 0.0) for item in (gastos or []))
	subtotal = total_ingresos + gastos_totales
	diferencia = (subtotal - monto_inicial) - venta_sistema
	estado_diferencia = 'Cuadre exacto'
	if diferencia > 0:
		estado_diferencia = 'Sobrante'
	elif diferencia < 0:
		estado_diferencia = 'Faltante'
	return {
		'total_ingresos': total_ingresos,
		'gastos_totales': gastos_totales,
		'subtotal': subtotal,
		'diferencia': diferencia,
		'estado_diferencia': estado_diferencia,
	}


def _normalize_header(text):
	if text is None:
		return ''
	return str(text).strip().lower().replace(' ', '_')


def _checklist_base_query(user, selected_date=None):
	if not user.id_sede or not user.id_turno:
		return ChecklistPedido.query.filter(text('1=0'))
	query = ChecklistPedido.query.filter(
		ChecklistPedido.id_sede == user.id_sede,
		ChecklistPedido.id_turno == user.id_turno,
	)
	if selected_date is not None:
		query = query.filter(db.func.date(ChecklistPedido.fecha) == selected_date.strftime('%Y-%m-%d'))
	return query


def _get_active_checklist(user, selected_date=None):
	return _checklist_base_query(user, selected_date).filter(
		ChecklistPedido.estado_general.in_(['Borrador', 'Pendiente', 'Enviado'])
	).order_by(ChecklistPedido.id_pedido.desc()).first()


def _get_visible_checklist(user, selected_date=None):
	active = _get_active_checklist(user, selected_date)
	if active:
		return active
	return _checklist_base_query(user, selected_date).order_by(ChecklistPedido.id_pedido.desc()).first()


def _get_checklist_items(pedido, user=None, include_all=False, target_user_id='', target_area=''):
	if not pedido:
		return []
	query = db.session.query(DetallePedido, Producto).join(
		Producto, Producto.id_producto == DetallePedido.id_producto
	).filter(
		DetallePedido.id_pedido == pedido.id_pedido
	)
	if not include_all and user is not None:
		effective_user_id = target_user_id or user.id_usuario
		query = query.filter(
			or_(
				DetallePedido.id_usuario == effective_user_id,
				DetallePedido.id_usuario.is_(None),
			)
		)
	if include_all and target_user_id:
		query = query.filter(DetallePedido.id_usuario == target_user_id)
	if include_all and target_area:
		query = query.filter(db.func.lower(Producto.area) == target_area.lower())
	return query.order_by(Producto.nombre_producto.asc()).all()


def _get_checklist_catalog(user, q=''):
	query = Producto.query.filter(or_(Producto.estado.is_(None), Producto.estado == '', Producto.estado == 'Activo'))
	if q:
		like_q = f"%{q}%"
		query = query.filter(
			or_(
				Producto.nombre_producto.ilike(like_q),
				Producto.id_producto.ilike(like_q),
				Producto.id_area.ilike(like_q),
				Producto.area.ilike(like_q),
				Producto.subarea.ilike(like_q),
			)
		)

	preferred_area = _preferred_area_for_user(user)
	productos = query.all()
	if not preferred_area:
		return sorted(productos, key=lambda p: (p.nombre_producto or '').lower())
	return sorted(
		productos,
		key=lambda p: (0 if (p.area or '').lower() == preferred_area else 1, (p.nombre_producto or '').lower()),
	)


def _preferred_area_for_user(user):
	return _preferred_area_for_role_name(user.rol_nombre)


def _preferred_area_for_role_name(role_name):
	if role_name == 'cocinero':
		return 'cocina'
	if role_name == 'admin_sala':
		return 'sala'
	return ''


def _checklist_scope_users(user):
	allowed_roles = {'cocinero', 'admin_sala'}
	preferred_area = _preferred_area_for_user(user)
	users = Usuario.query.join(Rol, Rol.id_rol == Usuario.id_rol).filter(
		Usuario.id_sede == user.id_sede,
		Usuario.id_turno == user.id_turno,
		Rol.nombre_rol.in_(allowed_roles),
	).all()
	if preferred_area:
		users = [scope_user for scope_user in users if _preferred_area_for_user(scope_user) == preferred_area]
	if not users:
		return [user]
	return users


def _template_scope_query(user):
	return PlantillaChecklistItem.query.filter_by(
		id_usuario=user.id_usuario,
		id_sede=user.id_sede,
		id_turno=user.id_turno,
		area=_preferred_area_for_user(user),
	)


def _get_template_product_ids(user):
	return _get_template_product_ids_for_user(user, user.id_usuario)


def _get_template_product_ids_for_user(user, target_user_id):
	target_user_id = (target_user_id or '').strip()
	if not target_user_id:
		return set()
	return {
		id_producto
		for (id_producto,) in PlantillaChecklistItem.query.join(
			Producto, Producto.id_producto == PlantillaChecklistItem.id_producto
		).filter(
			PlantillaChecklistItem.id_usuario == target_user_id,
			PlantillaChecklistItem.id_sede == user.id_sede,
			PlantillaChecklistItem.id_turno == user.id_turno,
			PlantillaChecklistItem.area == _preferred_area_for_user(user),
		).filter(
			or_(Producto.estado.is_(None), Producto.estado == '', Producto.estado == 'Activo')
		).with_entities(PlantillaChecklistItem.id_producto).all()
	}


def _sync_checklist_items_with_template(checklist, template_product_ids, user_id):
	if not checklist or checklist.estado_general not in {'Borrador', 'Pendiente'}:
		return

	user_id = (user_id or '').strip()
	if not user_id:
		return

	existing_items = DetallePedido.query.filter(
		DetallePedido.id_pedido == checklist.id_pedido,
		DetallePedido.id_usuario == user_id,
	).all()

	existing_by_product = {item.id_producto: item for item in existing_items}
	for id_producto in template_product_ids:
		if id_producto in existing_by_product:
			continue
		db.session.add(
			DetallePedido(
				id_pedido=checklist.id_pedido,
				id_usuario=user_id,
				id_producto=id_producto,
				cantidad_pedida=0.0,
				estado_sede='Pendiente',
			)
		)

	for item in existing_items:
		if item.id_producto in template_product_ids:
			continue
		if item.estado_sede == 'Recibido' or _safe_float(item.cantidad_entregada, 0.0) > 0:
			continue
		db.session.delete(item)


def _sync_open_checklists_with_template(user, selected_date):
	template_product_ids = _get_template_product_ids(user)

	open_checklists = ChecklistPedido.query.filter(
		ChecklistPedido.id_sede == user.id_sede,
		ChecklistPedido.id_turno == user.id_turno,
		db.func.date(ChecklistPedido.fecha) >= selected_date.strftime('%Y-%m-%d'),
		ChecklistPedido.estado_general.in_(['Borrador', 'Pendiente']),
	).order_by(ChecklistPedido.fecha.asc(), ChecklistPedido.id_pedido.asc()).all()

	for checklist in open_checklists:
		_sync_checklist_items_with_template(checklist, template_product_ids, user.id_usuario)


def _build_checklist_from_template_if_needed(user, selected_date):
	today = datetime.now().date()
	if selected_date < today:
		return None

	template_product_ids = _get_template_product_ids(user)
	if not template_product_ids:
		return None

	current = _checklist_base_query(user, selected_date).filter(
		ChecklistPedido.estado_general.in_(['Borrador', 'Pendiente'])
	).order_by(ChecklistPedido.id_pedido.desc()).first()
	if current:
		_sync_checklist_items_with_template(current, template_product_ids, user.id_usuario)
		return current

	checklist = ChecklistPedido(
		id_sede=user.id_sede,
		id_turno=user.id_turno,
		id_usuario=user.id_usuario,
		fecha=datetime.combine(selected_date, datetime.min.time()),
		estado_general='Borrador',
	)
	db.session.add(checklist)
	db.session.flush()
	for id_producto in sorted(template_product_ids):
		db.session.add(
			DetallePedido(
				id_pedido=checklist.id_pedido,
				id_usuario=user.id_usuario,
				id_producto=id_producto,
				cantidad_pedida=0.0,
				estado_sede='Pendiente',
			)
		)
	return checklist


def _complete_checklist_if_all_received(pedido):
	if not pedido or pedido.estado_general != 'Enviado':
		return
	pending = DetallePedido.query.filter(
		DetallePedido.id_pedido == pedido.id_pedido,
		DetallePedido.cantidad_entregada > 0,
		DetallePedido.estado_sede != 'Recibido',
	).count()
	if pending == 0:
		pedido.estado_general = 'Finalizado'


def _ensure_inventory_schema(app):
	inspector = inspect(db.engine)
	columns = {column['name'] for column in inspector.get_columns('productos')}
	if 'unidad' not in columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE productos ADD COLUMN unidad VARCHAR(50)'))
	if 'area' not in columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE productos ADD COLUMN area VARCHAR(20)'))

	detalle_columns = {column['name'] for column in inspector.get_columns('detalle_pedido')}
	if 'id_usuario' not in detalle_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE detalle_pedido ADD COLUMN id_usuario VARCHAR(50)'))

	arqueo_columns = {column['name'] for column in inspector.get_columns('arqueo_caja')}
	if 'pos_tarjetas' not in arqueo_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE arqueo_caja ADD COLUMN pos_tarjetas FLOAT DEFAULT 0'))
	if 'yape' not in arqueo_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE arqueo_caja ADD COLUMN yape FLOAT DEFAULT 0'))
	if 'plin' not in arqueo_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE arqueo_caja ADD COLUMN plin FLOAT DEFAULT 0'))
	if 'efectivo' not in arqueo_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE arqueo_caja ADD COLUMN efectivo FLOAT DEFAULT 0'))
	if 'venta_sistema' not in arqueo_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE arqueo_caja ADD COLUMN venta_sistema FLOAT DEFAULT 0'))
	if 'gastos_json' not in arqueo_columns:
		with db.engine.begin() as connection:
			connection.execute(text("ALTER TABLE arqueo_caja ADD COLUMN gastos_json TEXT DEFAULT '[]'"))

	usuario_columns = {column['name'] for column in inspector.get_columns('usuarios')}
	if 'dni' not in usuario_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE usuarios ADD COLUMN dni VARCHAR(20)'))
	if 'fecha_nacimiento' not in usuario_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE usuarios ADD COLUMN fecha_nacimiento DATE'))
	if 'email' not in usuario_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE usuarios ADD COLUMN email VARCHAR(120)'))
	if 'telefono' not in usuario_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(30)'))
	if 'direccion' not in usuario_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE usuarios ADD COLUMN direccion VARCHAR(180)'))
	if 'bio' not in usuario_columns:
		with db.engine.begin() as connection:
			connection.execute(text('ALTER TABLE usuarios ADD COLUMN bio VARCHAR(240)'))

	with db.engine.begin() as connection:
		connection.execute(
			text(
				"""
				UPDATE detalle_pedido
				SET id_usuario = (
					SELECT checklist_pedidos.id_usuario
					FROM checklist_pedidos
					WHERE checklist_pedidos.id_pedido = detalle_pedido.id_pedido
				)
				WHERE id_usuario IS NULL
				"""
			)
		)

	if app.config['SQLALCHEMY_DATABASE_URI'].startswith('sqlite'):
		with db.engine.begin() as connection:
			connection.execute(text("UPDATE productos SET unidad = COALESCE(unidad, 'unidad') WHERE unidad IS NULL OR unidad = ''"))
			connection.execute(text("UPDATE productos SET area = COALESCE(NULLIF(area, ''), 'cocina')"))
			connection.execute(text("UPDATE productos SET subarea = 'cocina_caliente' WHERE area = 'cocina' AND (subarea IS NULL OR subarea = '')"))
			connection.execute(text("UPDATE productos SET subarea = 'sala' WHERE area = 'sala' AND (subarea IS NULL OR subarea = '')"))
			connection.execute(text("UPDATE arqueo_caja SET gastos_json = '[]' WHERE gastos_json IS NULL OR gastos_json = ''"))


def create_app():
	app = Flask(__name__)

	# Render puede entregar postgres://; SQLAlchemy espera postgresql://
	database_url = os.environ.get('DATABASE_URL')
	if database_url and database_url.startswith('postgres://'):
		database_url = database_url.replace('postgres://', 'postgresql://', 1)

	# Fallback local para desarrollo cuando no existe DATABASE_URL
	app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///mi_app.db'
	app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
	app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'una_clave_muy_secreta')
	app.config['REMEMBER_COOKIE_DURATION'] = timedelta(days=90)
	app.config['REMEMBER_COOKIE_REFRESH_EACH_REQUEST'] = True
	app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=90)
	app.config['SESSION_COOKIE_HTTPONLY'] = True
	app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

	db.init_app(app)
	login_manager.init_app(app)

	with app.app_context():
		db.create_all()
		_ensure_inventory_schema(app)
		_seed_catalogs()
		print('Base de datos vinculada y tablas creadas.')

	@app.route('/')
	def index():
		if current_user.is_authenticated:
			return redirect(url_for('dashboard'))
		return redirect(url_for('login'))

	@app.route('/set-app-date', methods=['POST'])
	@login_required
	def set_app_date():
		selected_date = request.form.get('app_date', '').strip()
		try:
			datetime.strptime(selected_date, '%Y-%m-%d')
		except ValueError:
			flash('Fecha invalida.', 'error')
			return redirect(request.referrer or url_for('dashboard'))

		session['app_date'] = selected_date
		return redirect(request.referrer or url_for('dashboard'))

	@app.route('/login', methods=['GET', 'POST'])
	def login():
		if current_user.is_authenticated:
			return redirect(url_for('dashboard'))

		if request.method == 'POST':
			username = request.form.get('username', '').strip()
			password = request.form.get('password', '')
			user = Usuario.query.filter_by(username=username).first()

			is_valid = False
			if user:
				is_valid = check_password_hash(user.password_hash, password) or user.password_hash == password

			if is_valid:
				session.permanent = True
				login_user(user, remember=True)
				return redirect(url_for('dashboard'))

			flash('Usuario o contrasena invalidos.', 'error')

		return render_template('login.html')

	@app.route('/logout')
	@login_required
	def logout():
		session.pop('app_date', None)
		logout_user()
		return redirect(url_for('login'))

	@app.route('/dashboard')
	@login_required
	def dashboard():
		selected_date = _get_selected_app_date()
		return render_template(
			'dashboard/home.html',
			allowed_views=_allowed_views(current_user),
			stats=_stats_for_user(current_user),
			alerts=_home_alerts_for_user(current_user, selected_date),
		)

	@app.route('/inventario/dashboard')
	@login_required
	def inventario_dashboard():
		if not current_user.can_view('inventario'):
			return _forbidden_redirect()
		selected_date = _get_selected_app_date()
		metrics = _inventory_dashboard_metrics(current_user, selected_date)
		return render_template(
			'dashboard/inventario_dashboard.html',
			allowed_views=_allowed_views(current_user),
			selected_date=selected_date,
			metrics=metrics,
		)

	@app.route('/perfil', methods=['GET', 'POST'])
	@login_required
	def perfil():
		if request.method == 'POST':
			current_user.dni = request.form.get('dni', '').strip() or None
			current_user.email = request.form.get('email', '').strip() or None
			current_user.telefono = request.form.get('telefono', '').strip() or None
			current_user.direccion = request.form.get('direccion', '').strip() or None
			current_user.bio = request.form.get('bio', '').strip() or None

			fecha_nacimiento_raw = request.form.get('fecha_nacimiento', '').strip()
			if fecha_nacimiento_raw:
				try:
					current_user.fecha_nacimiento = datetime.strptime(fecha_nacimiento_raw, '%Y-%m-%d').date()
				except ValueError:
					flash('Fecha de nacimiento invalida.', 'error')
					return redirect(url_for('perfil'))
			else:
				current_user.fecha_nacimiento = None

			password_actual = request.form.get('password_actual', '')
			nueva_password = request.form.get('nueva_password', '')
			confirm_password = request.form.get('confirm_password', '')
			if password_actual or nueva_password or confirm_password:
				password_ok = check_password_hash(current_user.password_hash, password_actual) or current_user.password_hash == password_actual
				if not password_ok:
					flash('La contraseña actual no coincide.', 'error')
					return redirect(url_for('perfil'))
				if not nueva_password:
					flash('Debes ingresar una nueva contraseña.', 'error')
					return redirect(url_for('perfil'))
				if nueva_password != confirm_password:
					flash('La confirmación de contraseña no coincide.', 'error')
					return redirect(url_for('perfil'))
				current_user.password_hash = generate_password_hash(nueva_password)

			db.session.commit()
			flash('Perfil actualizado correctamente.', 'ok')
			return redirect(url_for('perfil'))

		return render_template(
			'perfil.html',
			allowed_views=_allowed_views(current_user),
		)

	@app.route('/inventario', methods=['GET', 'POST'])
	@login_required
	def inventario():
		if not current_user.can_view('inventario'):
			return _forbidden_redirect()

		if request.method == 'POST':
			if not current_user.can_write('inventario', 'update'):
				return _forbidden_redirect()

			action = request.form.get('action', 'update_row')
			id_producto = request.form.get('id_producto', '').strip()
			target_sede = current_user.id_sede if current_user.rol_nombre != 'admin_general' else int(request.form.get('id_sede', current_user.id_sede))

			if action == 'upsert_product':
				if not id_producto:
					flash('ID de producto requerido.', 'error')
					return redirect(url_for('inventario'))

				producto = Producto.query.filter_by(id_producto=id_producto).first()
				if not producto:
					producto = Producto(id_producto=id_producto)
					db.session.add(producto)

				producto.nombre_producto = request.form.get('nombre_producto', '').strip()
				producto.id_area = request.form.get('id_area', '').strip()
				producto.area = _normalize_area(request.form.get('area', '')) or 'cocina'
				producto.subarea = _normalize_subarea(producto.area, request.form.get('subarea', ''))
				producto.unidad = request.form.get('unidad', '').strip()
				producto.estado = request.form.get('estado', 'Activo').strip() or 'Activo'

				row = InventarioSede.query.filter_by(id_sede=target_sede, id_producto=id_producto).first()
				if not row:
					row = InventarioSede(id_sede=target_sede, id_producto=id_producto)
					db.session.add(row)

				row.stock_actual = _safe_float(request.form.get('stock_actual'), row.stock_actual or 0.0)
				row.punto_minimo = _safe_float(request.form.get('punto_minimo'), row.punto_minimo or 0.0)
				db.session.commit()
				flash('Producto guardado en inventario.', 'ok')

			elif action == 'delete_product':
				row = InventarioSede.query.filter_by(id_sede=target_sede, id_producto=id_producto).first()
				if row:
					db.session.delete(row)
					if InventarioSede.query.filter_by(id_producto=id_producto).count() == 1:
						PlantillaChecklistItem.query.filter_by(id_producto=id_producto).delete(synchronize_session=False)
						DetallePedido.query.filter_by(id_producto=id_producto).delete(synchronize_session=False)
						producto = Producto.query.filter_by(id_producto=id_producto).first()
						if producto:
							db.session.delete(producto)
					db.session.commit()
					flash('Producto eliminado del inventario.', 'ok')
				else:
					flash('No se encontro el producto en esa sede.', 'error')

			elif action == 'create_category':
				nombre_categoria = request.form.get('nombre_categoria', '').strip()
				if nombre_categoria and not Categoria.query.filter(db.func.lower(Categoria.nombre_categoria) == nombre_categoria.lower()).first():
					db.session.add(Categoria(nombre_categoria=nombre_categoria))
					db.session.commit()
					flash('Categoria creada.', 'ok')
				else:
					flash('La categoria ya existe o esta vacia.', 'error')

			elif action == 'delete_category':
				nombre_categoria = request.form.get('nombre_categoria', '').strip()
				if nombre_categoria and not Producto.query.filter(Producto.id_area == nombre_categoria).first():
					categoria = Categoria.query.filter_by(nombre_categoria=nombre_categoria).first()
					if categoria:
						db.session.delete(categoria)
						db.session.commit()
						flash('Categoria eliminada.', 'ok')
				else:
					flash('No se puede eliminar una categoria con productos asociados.', 'error')

			elif action == 'create_unit':
				nombre_unidad = request.form.get('nombre_unidad', '').strip()
				if nombre_unidad and not Unidad.query.filter(db.func.lower(Unidad.nombre_unidad) == nombre_unidad.lower()).first():
					db.session.add(Unidad(nombre_unidad=nombre_unidad))
					db.session.commit()
					flash('Unidad creada.', 'ok')
				else:
					flash('La unidad ya existe o esta vacia.', 'error')

			elif action == 'create_area':
				nombre_area = request.form.get('nombre_area', '').strip()
				if nombre_area and not Area.query.filter(db.func.lower(Area.nombre_area) == nombre_area.lower()).first():
					db.session.add(Area(nombre_area=nombre_area))
					db.session.commit()
					flash('Area creada.', 'ok')
				else:
					flash('El area ya existe o esta vacia.', 'error')

			elif action == 'create_subarea':
				nombre_area = request.form.get('area_padre', '').strip()
				nombre_subarea = request.form.get('nombre_subarea', '').strip()
				area_obj = Area.query.filter(db.func.lower(Area.nombre_area) == nombre_area.lower()).first()
				if not area_obj:
					flash('Debes crear el area primero.', 'error')
				elif nombre_subarea and not Subarea.query.filter_by(id_area=area_obj.id_area, nombre_subarea=_slugify(nombre_subarea)).first():
					db.session.add(Subarea(id_area=area_obj.id_area, nombre_subarea=_slugify(nombre_subarea)))
					db.session.commit()
					flash('Subarea creada.', 'ok')
				else:
					flash('La subarea ya existe o esta vacia.', 'error')

			elif action == 'delete_unit':
				nombre_unidad = request.form.get('nombre_unidad', '').strip()
				if nombre_unidad and not Producto.query.filter(Producto.unidad == nombre_unidad).first():
					unidad = Unidad.query.filter_by(nombre_unidad=nombre_unidad).first()
					if unidad:
						db.session.delete(unidad)
						db.session.commit()
						flash('Unidad eliminada.', 'ok')
				else:
					flash('No se puede eliminar una unidad en uso.', 'error')

			else:
				row = InventarioSede.query.filter_by(
					id_sede=target_sede,
					id_producto=id_producto,
				).first()
				if row:
					row.stock_actual = _safe_float(request.form.get('stock_actual'), row.stock_actual)
					row.punto_minimo = _safe_float(request.form.get('punto_minimo'), row.punto_minimo)
					db.session.commit()
					flash('Inventario actualizado.', 'ok')

		q = request.args.get('q', '').strip()
		categoria = request.args.get('categoria', '').strip()
		area = _normalize_area(request.args.get('area', '').strip())
		subarea = request.args.get('subarea', '').strip()
		unidad = request.args.get('unidad', '').strip()

		inventario_rows = _inventory_query_for_user(current_user, q=q, categoria=categoria, subarea=subarea, unidad=unidad, area=area).all()
		categorias = Categoria.query.order_by(Categoria.nombre_categoria).all()
		unidades = Unidad.query.order_by(Unidad.nombre_unidad).all()
		areas = Area.query.order_by(Area.nombre_area).all()
		category_counts = {
			categoria_row.nombre_categoria: Producto.query.filter(Producto.id_area == categoria_row.nombre_categoria).count()
			for categoria_row in categorias
		}
		unit_counts = {
			unidad_row.nombre_unidad: Producto.query.filter(Producto.unidad == unidad_row.nombre_unidad).count()
			for unidad_row in unidades
		}
		subareas = _get_subareas_for_area(area or 'cocina')
		return render_template(
			'dashboard/inventario.html',
			allowed_views=_allowed_views(current_user),
			inventario_rows=inventario_rows,
			productos=Producto.query.order_by(Producto.nombre_producto).all(),
			categorias=categorias,
			unidades=unidades,
			areas=areas,
			category_counts=category_counts,
			unit_counts=unit_counts,
			subareas=subareas,
			selected_q=q,
			selected_categoria=categoria,
			selected_area=area,
			selected_subarea=subarea,
			selected_unidad=unidad,
			areas_subareas={area.nombre_area: _get_subareas_for_area(area.nombre_area) for area in areas},
			can_edit=current_user.can_write('inventario', 'update'),
		)

	@app.route('/inventario/export')
	@login_required
	def inventario_export():
		if not current_user.can_view('inventario'):
			return _forbidden_redirect()

		q = request.args.get('q', '').strip()
		categoria = request.args.get('categoria', '').strip()
		area = _normalize_area(request.args.get('area', '').strip())
		subarea = request.args.get('subarea', '').strip()
		unidad = request.args.get('unidad', '').strip()
		rows = _inventory_query_for_user(current_user, q=q, categoria=categoria, subarea=subarea, unidad=unidad, area=area).all()
		openpyxl = importlib.import_module('openpyxl')

		wb = openpyxl.Workbook()
		ws = wb.active
		ws.title = 'Inventario'
		ws.append(['ID', 'Producto', 'Categoria', 'Area', 'Subarea', 'Unidad', 'Punto minimo', 'Stock central', 'Estado', 'Sede'])
		for producto, inv, sede in rows:
			ws.append([
				producto.id_producto,
				producto.nombre_producto,
				producto.id_area,
				producto.area,
				producto.subarea,
				producto.unidad or 'unidad',
				inv.punto_minimo if inv else 0,
				inv.stock_actual if inv else 0,
				producto.estado,
				sede.nombre_sede if sede else '',
			])

		output = BytesIO()
		wb.save(output)
		output.seek(0)
		stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
		return send_file(
			output,
			as_attachment=True,
			download_name=f'inventario_{stamp}.xlsx',
			mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		)

	@app.route('/inventario/import', methods=['POST'])
	@login_required
	def inventario_import():
		if not current_user.can_write('inventario', 'update'):
			return _forbidden_redirect()

		file = request.files.get('excel_file')
		if not file or not file.filename.lower().endswith('.xlsx'):
			flash('Sube un archivo .xlsx valido.', 'error')
			return redirect(url_for('inventario'))

		try:
			openpyxl = importlib.import_module('openpyxl')
			wb = openpyxl.load_workbook(file)
		except ModuleNotFoundError:
			flash('No se encontro openpyxl en el entorno. Instala dependencias y vuelve a intentar.', 'error')
			return redirect(url_for('inventario'))
		except Exception as exc:
			flash(f'No se pudo leer el archivo Excel: {exc}', 'error')
			return redirect(url_for('inventario'))

		ws = wb.active
		rows = ws.iter_rows(values_only=True)
		headers = next(rows, None)
		if not headers:
			flash('El archivo no tiene encabezados.', 'error')
			return redirect(url_for('inventario'))

		header_map = {_normalize_header(name): idx for idx, name in enumerate(headers)}
		aliases = {
			'id': ['id', 'id_producto', 'codigo'],
			'producto': ['producto', 'nombre', 'nombre_producto'],
			'categoria': ['categoria', 'id_area'],
			'area': ['area'],
			'subarea': ['subarea', 'sub_area'],
			'unidad': ['unidad', 'unidad_medida'],
			'punto_minimo': ['punto_minimo', 'punto_min', 'minimo'],
			'stock_central': ['stock_central', 'stock_actual', 'stock'],
			'estado': ['estado'],
			'sede': ['sede', 'sede_nombre', 'nombre_sede'],
		}

		def idx(key):
			for alias in aliases[key]:
				if alias in header_map:
					return header_map[alias]
			return None

		def cell_value(row_values, column_idx):
			if column_idx is None or column_idx >= len(row_values):
				return None
			return row_values[column_idx]

		def ensure_categoria(nombre_categoria):
			nombre_categoria = (nombre_categoria or '').strip()
			if not nombre_categoria:
				return ''
			categoria = Categoria.query.filter(db.func.lower(Categoria.nombre_categoria) == nombre_categoria.lower()).first()
			if categoria:
				return categoria.nombre_categoria
			db.session.add(Categoria(nombre_categoria=nombre_categoria))
			return nombre_categoria

		def ensure_unidad(nombre_unidad):
			nombre_unidad = (nombre_unidad or '').strip()
			if not nombre_unidad:
				return ''
			unidad = Unidad.query.filter(db.func.lower(Unidad.nombre_unidad) == nombre_unidad.lower()).first()
			if unidad:
				return unidad.nombre_unidad
			db.session.add(Unidad(nombre_unidad=nombre_unidad))
			return nombre_unidad

		def ensure_area(nombre_area):
			nombre_area = _slugify(nombre_area)
			if not nombre_area:
				return ''
			area = Area.query.filter(db.func.lower(Area.nombre_area) == nombre_area).first()
			if area:
				return area.nombre_area
			db.session.add(Area(nombre_area=nombre_area))
			db.session.flush()
			return nombre_area

		def ensure_subarea(nombre_area, nombre_subarea):
			nombre_subarea = _slugify(nombre_subarea)
			if not nombre_subarea or not nombre_area:
				return ''
			area = Area.query.filter(db.func.lower(Area.nombre_area) == _slugify(nombre_area)).first()
			if not area:
				return ''
			exists = Subarea.query.filter_by(id_area=area.id_area, nombre_subarea=nombre_subarea).first()
			if not exists:
				db.session.add(Subarea(id_area=area.id_area, nombre_subarea=nombre_subarea))
			return nombre_subarea

		def ensure_sede(nombre_sede):
			nombre_sede = (nombre_sede or '').strip()
			if not nombre_sede:
				return None
			sede = Sede.query.filter(db.func.lower(Sede.nombre_sede) == nombre_sede.lower()).first()
			if sede:
				return sede
			sede = Sede(nombre_sede=nombre_sede)
			db.session.add(sede)
			db.session.flush()
			return sede

		id_idx = idx('id')
		name_idx = idx('producto')
		if id_idx is None or name_idx is None:
			flash('El Excel debe incluir columnas ID y Producto.', 'error')
			return redirect(url_for('inventario'))

		cat_idx = idx('categoria')
		area_idx = idx('area')
		sub_idx = idx('subarea')
		unit_idx = idx('unidad')
		min_idx = idx('punto_minimo')
		stock_idx = idx('stock_central')
		estado_idx = idx('estado')
		sede_idx = idx('sede')

		processed = 0
		deleted = 0
		errors = []
		imported_pairs = set()
		sedes_objetivo = set()

		try:
			for row_number, row in enumerate(rows, start=2):
				id_producto = str(cell_value(row, id_idx)).strip() if cell_value(row, id_idx) is not None else ''
				nombre_producto = str(cell_value(row, name_idx)).strip() if cell_value(row, name_idx) is not None else ''

				# Ignora filas completamente vacias
				if not id_producto and not nombre_producto:
					continue

				if not id_producto or not nombre_producto:
					errors.append(f'Fila {row_number}: ID y Producto son obligatorios.')
					continue

				sede_nombre = ''
				if sede_idx is not None and cell_value(row, sede_idx) is not None:
					sede_nombre = str(cell_value(row, sede_idx)).strip()

				if current_user.rol_nombre == 'admin_general':
					target_sede_obj = ensure_sede(sede_nombre) if sede_nombre else current_user.sede
					if not target_sede_obj:
						errors.append(f'Fila {row_number}: no se pudo resolver la sede.')
						continue
				else:
					target_sede_obj = current_user.sede

				sedes_objetivo.add(target_sede_obj.id_sede)

				categoria_val = str(cell_value(row, cat_idx)).strip() if cat_idx is not None and cell_value(row, cat_idx) is not None else ''
				if categoria_val:
					categoria_val = ensure_categoria(categoria_val)

				area_val_raw = str(cell_value(row, area_idx)).strip() if area_idx is not None and cell_value(row, area_idx) is not None else ''
				area_val = ensure_area(area_val_raw or 'cocina')

				subarea_val_raw = str(cell_value(row, sub_idx)).strip() if sub_idx is not None and cell_value(row, sub_idx) is not None else ''
				subarea_val = ensure_subarea(area_val, subarea_val_raw) if subarea_val_raw else ''

				unidad_val = str(cell_value(row, unit_idx)).strip() if unit_idx is not None and cell_value(row, unit_idx) is not None else ''
				if unidad_val:
					unidad_val = ensure_unidad(unidad_val)

				estado_val = str(cell_value(row, estado_idx)).strip() if estado_idx is not None and cell_value(row, estado_idx) is not None else 'Activo'
				estado_val = estado_val or 'Activo'

				producto = Producto.query.filter_by(id_producto=id_producto).first()
				if not producto:
					producto = Producto(id_producto=id_producto)
					db.session.add(producto)

				producto.nombre_producto = nombre_producto
				producto.id_area = categoria_val or producto.id_area or ''
				producto.area = area_val or 'cocina'
				if subarea_val:
					producto.subarea = subarea_val
				else:
					producto.subarea = _normalize_subarea(producto.area, producto.subarea)
				producto.unidad = unidad_val or producto.unidad or 'unidad'
				producto.estado = estado_val

				inv = InventarioSede.query.filter_by(id_sede=target_sede_obj.id_sede, id_producto=id_producto).first()
				if not inv:
					inv = InventarioSede(id_sede=target_sede_obj.id_sede, id_producto=id_producto)
					db.session.add(inv)

				if min_idx is not None:
					inv.punto_minimo = _safe_float(cell_value(row, min_idx), inv.punto_minimo or 0.0)
				if stock_idx is not None:
					inv.stock_actual = _safe_float(cell_value(row, stock_idx), inv.stock_actual or 0.0)

				imported_pairs.add((target_sede_obj.id_sede, id_producto))
				processed += 1

			if errors:
				db.session.rollback()
				preview = '; '.join(errors[:5])
				remaining = len(errors) - 5
				if remaining > 0:
					preview += f'; y {remaining} error(es) mas'
				flash(f'No se subio el Excel. Motivos: {preview}', 'error')
				return redirect(url_for('inventario'))

			if not sedes_objetivo:
				sedes_objetivo.add(current_user.id_sede)

			existing_rows = InventarioSede.query.filter(InventarioSede.id_sede.in_(list(sedes_objetivo))).all()
			for inv_row in existing_rows:
				key = (inv_row.id_sede, inv_row.id_producto)
				if key not in imported_pairs:
					db.session.delete(inv_row)
					deleted += 1

			# Limpia productos huerfanos que ya no tienen inventario en ninguna sede.
			for producto in Producto.query.all():
				if InventarioSede.query.filter_by(id_producto=producto.id_producto).first() is None:
					db.session.delete(producto)

			db.session.commit()
		except Exception as exc:
			db.session.rollback()
			flash(f'No se pudo subir el Excel: {exc}', 'error')
			return redirect(url_for('inventario'))

		flash(
			f'Importacion OK. Filas sincronizadas: {processed}. Registros eliminados por sincronizacion: {deleted}.',
			'ok',
		)
		return redirect(url_for('inventario'))

	@app.route('/movimientos', methods=['GET', 'POST'])
	@login_required
	def movimientos():
		if not current_user.can_view('movimientos'):
			return _forbidden_redirect()

		if request.method == 'POST':
			if not current_user.can_write('movimientos', 'insert'):
				return _forbidden_redirect()

			motivo = request.form.get('motivo', '').strip()
			motivo_nuevo = request.form.get('motivo_nuevo', '').strip()
			if motivo == 'OTRO':
				motivo = motivo_nuevo
			elif motivo == '':
				motivo = motivo_nuevo

			if not motivo:
				flash('Debes seleccionar o escribir un motivo.', 'error')
				return redirect(url_for('movimientos'))

			db.session.add(
				MovimientoInventario(
					id_sede=current_user.id_sede,
					id_producto=request.form.get('id_producto'),
					cantidad=float(request.form.get('cantidad', 0)),
					tipo=request.form.get('tipo', 'ENTRADA'),
					motivo=motivo,
					id_usuario=current_user.id_usuario,
				)
			)
			db.session.commit()
			flash('Movimiento registrado.', 'ok')

		q = request.args.get('q', '').strip()
		fecha_desde = request.args.get('fecha_desde', '').strip()
		fecha_hasta = request.args.get('fecha_hasta', '').strip()
		tipo = request.args.get('tipo', '').strip()
		categoria = request.args.get('categoria', '').strip()
		usuario_id = request.args.get('usuario_id', '').strip()

		movs_query = (
			db.session.query(MovimientoInventario, Usuario, Producto)
			.outerjoin(Usuario, Usuario.id_usuario == MovimientoInventario.id_usuario)
			.outerjoin(Producto, Producto.id_producto == MovimientoInventario.id_producto)
		)

		if current_user.rol_nombre != 'admin_general':
			movs_query = movs_query.filter(MovimientoInventario.id_sede == current_user.id_sede)

		if fecha_desde:
			movs_query = movs_query.filter(db.func.date(MovimientoInventario.fecha) >= fecha_desde)
		if fecha_hasta:
			movs_query = movs_query.filter(db.func.date(MovimientoInventario.fecha) <= fecha_hasta)
		if tipo:
			movs_query = movs_query.filter(MovimientoInventario.tipo == tipo)
		if categoria:
			movs_query = movs_query.filter(Producto.id_area == categoria)
		if usuario_id:
			movs_query = movs_query.filter(MovimientoInventario.id_usuario == usuario_id)
		if q:
			like_q = f"%{q}%"
			movs_query = movs_query.filter(
				or_(
					MovimientoInventario.id_producto.ilike(like_q),
					Producto.nombre_producto.ilike(like_q),
					Producto.id_area.ilike(like_q),
					MovimientoInventario.motivo.ilike(like_q),
					MovimientoInventario.tipo.ilike(like_q),
					Usuario.username.ilike(like_q),
				)
			)

		movs = movs_query.order_by(MovimientoInventario.id_movimiento.desc()).limit(300).all()

		usuarios_query = db.session.query(Usuario.id_usuario, Usuario.username).join(
			MovimientoInventario, MovimientoInventario.id_usuario == Usuario.id_usuario
		).distinct()
		if current_user.rol_nombre != 'admin_general':
			usuarios_query = usuarios_query.filter(MovimientoInventario.id_sede == current_user.id_sede)
		usuarios_filtro = usuarios_query.order_by(Usuario.username.asc()).all()
		categorias_filtro = [
			categoria.nombre_categoria
			for categoria in Categoria.query.order_by(Categoria.nombre_categoria.asc()).all()
		]
		categorias_extra = [
			row[0]
			for row in db.session.query(Producto.id_area)
				.filter(Producto.id_area.isnot(None), Producto.id_area != '')
				.distinct()
				.order_by(Producto.id_area.asc())
				.all()
			if row[0] not in categorias_filtro
		]
		categorias_filtro.extend(categorias_extra)

		return render_template(
			'dashboard/movimientos.html',
			allowed_views=_allowed_views(current_user),
			movimientos=movs,
			productos=Producto.query.order_by(Producto.nombre_producto).all(),
			categorias_filtro=categorias_filtro,
			usuarios_filtro=usuarios_filtro,
			selected_q=q,
			selected_fecha_desde=fecha_desde,
			selected_fecha_hasta=fecha_hasta,
			selected_tipo=tipo,
			selected_categoria=categoria,
			selected_usuario_id=usuario_id,
			can_insert=current_user.can_write('movimientos', 'insert'),
		)

	@app.route('/pedidos', methods=['GET', 'POST'])
	@login_required
	def pedidos():
		if not current_user.can_view('pedidos'):
			return _forbidden_redirect()
		selected_date = _get_selected_app_date()
		can_update = current_user.can_write('pedidos', 'update')
		can_delete_requested = current_user.rol_nombre in {'admin_general', 'admin_almacen'}

		pedido_id_raw = request.args.get('pedido_id', '').strip()
		pedido_id = int(pedido_id_raw) if pedido_id_raw.isdigit() else None
		is_async_request = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

		def _pedidos_post_response(target_pedido_id=None):
			if is_async_request:
				return ('', 204)
			return redirect(
				url_for(
					'pedidos',
					pedido_id=target_pedido_id if target_pedido_id else pedido_id,
					scroll_y=form_scroll if form_scroll else None,
				)
			)

		if request.method == 'POST':
			action = request.form.get('action', '').strip()
			form_scroll = request.form.get('scroll_y', '').strip()
			if action == 'mark_sent':
				if not can_update:
					return _forbidden_redirect()
				pedido = ChecklistPedido.query.get(request.form.get('id_pedido'))
				if pedido and pedido.estado_general in {'Pendiente', 'Borrador'}:
					total = DetallePedido.query.filter(
						DetallePedido.id_pedido == pedido.id_pedido,
						DetallePedido.cantidad_pedida > 0,
					).count()
					if total == 0:
						flash('El pedido no tiene lineas para enviar.', 'error')
					else:
						pedido.estado_general = 'Enviado'
						db.session.commit()
						flash('Pedido enviado a sede. Cocina confirmara solo las lineas enviadas.', 'ok')
				else:
					flash('No se pudo actualizar el pedido.', 'error')
				return _pedidos_post_response(pedido.id_pedido if pedido else pedido_id)
			elif action == 'save_dispatch_line':
				if not can_update:
					return _forbidden_redirect()
				detalle = DetallePedido.query.get(request.form.get('id_detalle'))
				if not detalle:
					flash('Linea no encontrada.', 'error')
					return _pedidos_post_response(request.form.get('pedido_id'))

				cantidad = _safe_float(request.form.get('cantidad_entregada'), detalle.cantidad_pedida or 0.0)
				cantidad = max(cantidad, 0.0)
				checked = request.form.get('enviar_linea') == 'on'
				if checked and cantidad <= 0:
					cantidad = max(detalle.cantidad_pedida or 0.0, 1.0)

				detalle.cantidad_entregada = cantidad if checked else 0.0
				if detalle.estado_sede != 'Recibido':
					detalle.estado_sede = 'Pendiente'
				db.session.commit()
				return _pedidos_post_response(request.form.get('pedido_id'))
			elif action == 'delete_requested_order':
				if not can_delete_requested:
					return _forbidden_redirect()
				pedido = ChecklistPedido.query.get(request.form.get('id_pedido'))
				if not pedido:
					flash('Pedido no encontrado.', 'error')
					return _pedidos_post_response(pedido_id)

				deleted_sede_id = pedido.id_sede
				deleted_turno_id = pedido.id_turno
				DetallePedido.query.filter_by(id_pedido=pedido.id_pedido).delete(synchronize_session=False)
				db.session.delete(pedido)

				# Si ya no quedan pedidos cerrados para ese alcance y fecha,
				# vuelve a crear lista editable desde las plantillas de cada usuario.
				scope_users = Usuario.query.join(Rol, Rol.id_rol == Usuario.id_rol).filter(
					Usuario.id_sede == deleted_sede_id,
					Usuario.id_turno == deleted_turno_id,
					Rol.nombre_rol.in_(['cocinero', 'admin_sala']),
				).all()
				for scope_user in scope_users:
					_build_checklist_from_template_if_needed(scope_user, selected_date)

				db.session.commit()
				flash('Pedido eliminado correctamente. Cocina puede volver a generar su lista.', 'ok')
				return _pedidos_post_response(None)
			else:
				if not current_user.can_write('pedidos', 'insert'):
					return _forbidden_redirect()

				pedido = ChecklistPedido(
					id_sede=current_user.id_sede,
					id_turno=current_user.id_turno,
					id_usuario=current_user.id_usuario,
					estado_general='Pendiente',
				)
				db.session.add(pedido)
				db.session.flush()

				db.session.add(
					DetallePedido(
						id_pedido=pedido.id_pedido,
						id_usuario=current_user.id_usuario,
						id_producto=request.form.get('id_producto'),
						cantidad_pedida=float(request.form.get('cantidad_pedida', 0)),
					)
				)
				db.session.commit()
				flash('Pedido creado.', 'ok')
				if is_async_request:
					return ('', 204)
				return redirect(url_for('pedidos', pedido_id=pedido.id_pedido))

		pedidos_query = db.session.query(ChecklistPedido, Sede, Turno).outerjoin(
			Sede, Sede.id_sede == ChecklistPedido.id_sede
		).outerjoin(
			Turno, Turno.id_turno == ChecklistPedido.id_turno
		)
		pedidos_query = pedidos_query.filter(db.func.date(ChecklistPedido.fecha) == selected_date)
		if current_user.rol_nombre not in {'admin_general', 'admin_almacen', 'personal_prod'}:
			pedidos_query = pedidos_query.filter(ChecklistPedido.id_sede == current_user.id_sede)
		pedidos_query = pedidos_query.order_by(ChecklistPedido.id_pedido.desc())
		pedido_rows = pedidos_query.limit(80).all()

		if pedido_id is None and pedido_rows:
			pedido_id = pedido_rows[0][0].id_pedido

		selected_pedido = None
		selected_items = []
		if pedido_id is not None:
			selected_pedido = ChecklistPedido.query.get(pedido_id)
			if selected_pedido:
				selected_items_query = db.session.query(DetallePedido, Producto).join(
					Producto, Producto.id_producto == DetallePedido.id_producto
				).filter(
					DetallePedido.id_pedido == selected_pedido.id_pedido,
					DetallePedido.cantidad_pedida > 0,
				)
				if current_user.rol_nombre not in {'admin_general', 'admin_almacen', 'personal_prod'}:
					selected_items_query = selected_items_query.filter(
						or_(
							DetallePedido.id_usuario == current_user.id_usuario,
							DetallePedido.id_usuario.is_(None),
						)
					)
				selected_items = selected_items_query.order_by(Producto.nombre_producto.asc()).all()

		pedido_area_map = {}
		for pedido_obj, _, _ in pedido_rows:
			areas = db.session.query(Producto.area).join(
				DetallePedido, DetallePedido.id_producto == Producto.id_producto
			).filter(
				DetallePedido.id_pedido == pedido_obj.id_pedido
			).distinct().all()
			area_labels = [(_normalize_area(area_name) or area_name or '').title() for (area_name,) in areas if area_name]
			pedido_area_map[pedido_obj.id_pedido] = ', '.join(area_labels) if area_labels else '-'

		return render_template(
			'dashboard/pedidos.html',
			allowed_views=_allowed_views(current_user),
			pedido_rows=pedido_rows,
			selected_pedido=selected_pedido,
			selected_items=selected_items,
			pedido_area_map=pedido_area_map,
			productos=Producto.query.order_by(Producto.nombre_producto).all(),
			can_insert=current_user.can_write('pedidos', 'insert'),
			can_update=can_update,
			can_delete_requested=can_delete_requested,
		)

	@app.route('/checklist', methods=['GET', 'POST'])
	@login_required
	def checklist():
		if not current_user.can_view('checklist'):
			return _forbidden_redirect()
		selected_date = _get_selected_app_date()
		is_admin_general = current_user.rol_nombre == 'admin_general'
		selected_pedido_raw = request.args.get('pedido_id', '').strip()
		selected_pedido_id = int(selected_pedido_raw) if selected_pedido_raw.isdigit() else None
		checklist_selector_options = []
		selected_filter_turno = request.args.get('f_turno', '').strip()
		selected_filter_sede = request.args.get('f_sede', '').strip()
		selected_filter_area = request.args.get('f_area', '').strip().lower()
		selected_filter_user = request.args.get('f_user', '').strip()
		is_async_request = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
		admin_turno_options = []
		admin_sede_options = []
		admin_area_options = []
		admin_user_options = []
		checklist_user_options = []

		if not is_admin_general:
			seeded_checklist = _build_checklist_from_template_if_needed(current_user, selected_date)
			if seeded_checklist is not None:
				db.session.commit()
			scope_users = _checklist_scope_users(current_user)
			checklist_user_options = [
				{'id': scope_user.id_usuario, 'label': scope_user.username}
				for scope_user in sorted(scope_users, key=lambda item: (item.username or '').lower())
			]
			allowed_user_ids = {option['id'] for option in checklist_user_options}
			if not selected_filter_user or selected_filter_user not in allowed_user_ids:
				selected_filter_user = current_user.id_usuario

		active_checklist = None
		visible_checklist = None
		if is_admin_general:
			admin_rows = db.session.query(ChecklistPedido, Sede, Turno, Usuario).outerjoin(
				Sede, Sede.id_sede == ChecklistPedido.id_sede
			).outerjoin(
				Turno, Turno.id_turno == ChecklistPedido.id_turno
			).outerjoin(
				Usuario, Usuario.id_usuario == ChecklistPedido.id_usuario
			).filter(
				db.func.date(ChecklistPedido.fecha) == selected_date.strftime('%Y-%m-%d')
			).order_by(ChecklistPedido.id_pedido.desc()).limit(200).all()

			turno_map = {}
			for _, _, turno, _ in admin_rows:
				if turno:
					turno_map[turno.id_turno] = turno.nombre_turno
			admin_turno_options = [
				{'id': turno_id, 'label': f"{turno_label} ({turno_id})"}
				for turno_id, turno_label in sorted(turno_map.items(), key=lambda item: (item[1] or '', item[0] or ''))
			]
			if not selected_filter_turno and admin_turno_options:
				selected_filter_turno = admin_turno_options[0]['id']

			rows_by_turno = [row for row in admin_rows if not selected_filter_turno or (row[2] and row[2].id_turno == selected_filter_turno)]

			sede_map = {}
			for _, sede, _, _ in rows_by_turno:
				if sede:
					sede_map[sede.id_sede] = sede.nombre_sede
			admin_sede_options = [
				{'id': str(sede_id), 'label': sede_name}
				for sede_id, sede_name in sorted(sede_map.items(), key=lambda item: (item[1] or '', item[0]))
			]
			if not selected_filter_sede and admin_sede_options:
				selected_filter_sede = admin_sede_options[0]['id']

			rows_by_sede = [
				row for row in rows_by_turno
				if not selected_filter_sede or (row[1] and str(row[1].id_sede) == selected_filter_sede)
			]
			pedido_ids_by_sede = [pedido.id_pedido for pedido, _, _, _ in rows_by_sede]

			for pedido, sede, turno, usuario in rows_by_sede:
				checklist_selector_options.append({
					'id_pedido': pedido.id_pedido,
					'label': f"#{pedido.id_pedido} | {usuario.username if usuario else '-'} | {sede.nombre_sede if sede else '-'} | {turno.nombre_turno if turno else '-'} | {pedido.estado_general}",
				})

			if selected_pedido_id and selected_pedido_id in pedido_ids_by_sede:
				visible_checklist = ChecklistPedido.query.get(selected_pedido_id)
			elif rows_by_sede:
				visible_checklist = rows_by_sede[0][0]
				selected_pedido_id = visible_checklist.id_pedido
			else:
				selected_pedido_id = None

			if pedido_ids_by_sede:
				area_rows = db.session.query(Producto.area).join(
					DetallePedido, DetallePedido.id_producto == Producto.id_producto
				).filter(
					DetallePedido.id_pedido.in_(pedido_ids_by_sede)
				).distinct().all()
				area_values = [(_slugify(area_name) if area_name else '') for (area_name,) in area_rows if area_name]
				admin_area_options = [
					{'id': area_value, 'label': area_value.replace('_', ' ').title()}
					for area_value in sorted(set(area_values))
				]
				if selected_filter_area and selected_filter_area not in {option['id'] for option in admin_area_options}:
					selected_filter_area = ''
				if not selected_filter_area and admin_area_options:
					selected_filter_area = admin_area_options[0]['id']

				user_query = db.session.query(Usuario.id_usuario, Usuario.username).join(
					DetallePedido, DetallePedido.id_usuario == Usuario.id_usuario
				).join(
					Producto, Producto.id_producto == DetallePedido.id_producto
				).filter(
					DetallePedido.id_pedido.in_(pedido_ids_by_sede)
				)
				if selected_filter_area:
					user_query = user_query.filter(db.func.lower(Producto.area) == selected_filter_area)
				user_rows = user_query.distinct().all()
				admin_user_options = [
					{'id': user_id, 'label': username}
					for user_id, username in sorted(user_rows, key=lambda item: (item[1] or '').lower())
				]
				if selected_filter_user and selected_filter_user not in {option['id'] for option in admin_user_options}:
					selected_filter_user = ''
				if not selected_filter_user and admin_user_options:
					selected_filter_user = admin_user_options[0]['id']

			if visible_checklist and visible_checklist.estado_general in {'Borrador', 'Pendiente', 'Enviado'}:
				active_checklist = visible_checklist
		else:
			active_checklist = _get_active_checklist(current_user, selected_date)
			visible_checklist = active_checklist or _get_visible_checklist(current_user, selected_date)

		if request.method == 'POST':
			action = request.form.get('action', '').strip()
			if not current_user.can_write('checklist', 'insert'):
				return _forbidden_redirect()

			is_viewing_other_user = bool(
				not is_admin_general and selected_filter_user and selected_filter_user != current_user.id_usuario
			)
			if is_viewing_other_user and action in {
				'add_item', 'remove_selected', 'qty_plus', 'qty_minus', 'qty_clear', 'qty_set', 'remove_item', 'send_list', 'confirm_item'
			}:
				flash('Solo puedes editar tu propia lista. La vista de otro usuario es solo lectura.', 'error')
				db.session.rollback()
				return redirect(
					url_for(
						'checklist',
						tab=request.form.get('next_tab', request.args.get('tab', 'view')).strip() or 'view',
						q=request.form.get('q', request.args.get('q', '')).strip(),
						f_user=selected_filter_user or None,
					)
				)

			def _get_target_detail():
				detail_query = DetallePedido.query.filter_by(
					id_detalle=request.form.get('id_detalle', '').strip(),
					id_pedido=active_checklist.id_pedido if active_checklist else None,
				)
				if is_admin_general and selected_filter_user:
					detail_query = detail_query.filter_by(id_usuario=selected_filter_user)
				else:
					detail_query = detail_query.filter_by(id_usuario=current_user.id_usuario)
				return detail_query.first()

			if action == 'add_item':
				id_producto = request.form.get('id_producto', '').strip()
				if not id_producto:
					flash('Producto invalido.', 'error')
				elif is_admin_general and active_checklist and selected_filter_user:
					exists = DetallePedido.query.filter_by(
						id_pedido=active_checklist.id_pedido,
						id_usuario=selected_filter_user,
						id_producto=id_producto,
					).first()
					if exists:
						flash('Ese producto ya esta en la lista de ese usuario.', 'ok')
					else:
						db.session.add(
							DetallePedido(
								id_pedido=active_checklist.id_pedido,
								id_usuario=selected_filter_user,
								id_producto=id_producto,
								cantidad_pedida=0.0,
								estado_sede='Pendiente',
							)
						)
						flash('Producto agregado a la lista del usuario seleccionado.', 'ok')
				else:
					exists = _template_scope_query(current_user).filter_by(id_producto=id_producto).first()
					if exists:
						flash('Ese producto ya esta en tu plantilla.', 'ok')
					else:
						db.session.add(
							PlantillaChecklistItem(
								id_usuario=current_user.id_usuario,
								id_sede=current_user.id_sede,
								id_turno=current_user.id_turno,
								area=_preferred_area_for_user(current_user),
								id_producto=id_producto,
							)
						)
						flash('Producto agregado a tu plantilla personal.', 'ok')
				if not is_admin_general:
					_build_checklist_from_template_if_needed(current_user, selected_date)
					_sync_open_checklists_with_template(current_user, selected_date)

			elif action == 'remove_selected':
				id_producto = request.form.get('id_producto', '').strip()
				if not id_producto:
					flash('Producto invalido.', 'error')
				elif is_admin_general and active_checklist and selected_filter_user:
					item = DetallePedido.query.filter_by(
						id_pedido=active_checklist.id_pedido,
						id_usuario=selected_filter_user,
						id_producto=id_producto,
					).first()
					if item:
						db.session.delete(item)
						flash('Producto quitado de la lista del usuario seleccionado.', 'ok')
				else:
					removed_count = _template_scope_query(current_user).filter_by(id_producto=id_producto).delete(synchronize_session=False)
					if removed_count:
						flash('Producto quitado de tu plantilla personal.', 'ok')
					if not is_admin_general:
						_build_checklist_from_template_if_needed(current_user, selected_date)
						_sync_open_checklists_with_template(current_user, selected_date)

			elif action == 'qty_plus':
				if not active_checklist or active_checklist.estado_general not in {'Borrador', 'Pendiente'}:
					flash('La lista ya fue enviada.', 'error')
				else:
					detalle = _get_target_detail()
					if detalle:
						detalle.cantidad_pedida = max((detalle.cantidad_pedida or 0.0) + 1.0, 0.0)

			elif action == 'qty_minus':
				if not active_checklist or active_checklist.estado_general not in {'Borrador', 'Pendiente'}:
					flash('La lista ya fue enviada.', 'error')
				else:
					detalle = _get_target_detail()
					if detalle:
						actual = max(_safe_float(detalle.cantidad_pedida, 0.0), 0.0)
						if actual > 1.0:
							detalle.cantidad_pedida = actual - 1.0

			elif action == 'qty_clear':
				if not active_checklist or active_checklist.estado_general not in {'Borrador', 'Pendiente'}:
					flash('La lista ya fue enviada.', 'error')
				else:
					detalle = _get_target_detail()
					if detalle:
						detalle.cantidad_pedida = 0.0

			elif action == 'qty_set':
				if not active_checklist or active_checklist.estado_general not in {'Borrador', 'Pendiente'}:
					flash('La lista ya fue enviada.', 'error')
				else:
					detalle = _get_target_detail()
					if detalle:
						cantidad = max(_safe_float(request.form.get('cantidad_pedida'), detalle.cantidad_pedida or 0.0), 0.0)
						detalle.cantidad_pedida = cantidad

			elif action == 'remove_item':
				if not active_checklist or active_checklist.estado_general not in {'Borrador', 'Pendiente'}:
					flash('La lista ya fue enviada.', 'error')
				else:
					detalle = _get_target_detail()
					if detalle:
						db.session.delete(detalle)
						flash('Producto quitado de la lista.', 'ok')

			elif action == 'send_list':
				if not active_checklist:
					flash('No hay lista para enviar.', 'error')
				elif active_checklist.estado_general != 'Borrador':
					flash('La lista ya fue enviada.', 'error')
				elif DetallePedido.query.filter(
					DetallePedido.id_pedido == active_checklist.id_pedido,
					DetallePedido.cantidad_pedida > 0,
				).count() == 0:
					flash('Agrega productos antes de enviar.', 'error')
				else:
					active_checklist.estado_general = 'Pendiente'
					flash('Lista enviada. Esperando a almacén.', 'ok')

			elif action == 'confirm_item':
				if not active_checklist or active_checklist.estado_general != 'Enviado':
					flash('Aun no puedes confirmar recepción.', 'error')
				else:
					detalle = _get_target_detail()
					if detalle and (detalle.cantidad_entregada or 0) <= 0:
						flash('Ese item no fue enviado por almacén.', 'error')
					elif detalle and detalle.estado_sede != 'Recibido':
						detalle.estado_sede = 'Recibido'
						_complete_checklist_if_all_received(active_checklist)
						flash('Item recibido confirmado.', 'ok')

			db.session.commit()
			scroll_y = request.form.get('scroll_y', '').strip()
			if is_async_request:
				return ('', 204)
			return redirect(
				url_for(
					'checklist',
					tab=request.form.get('next_tab', request.args.get('tab', 'view')).strip() or 'view',
					q=request.form.get('q', request.args.get('q', '')).strip(),
					scroll_y=scroll_y if scroll_y else None,
					pedido_id=request.form.get('pedido_id', str(active_checklist.id_pedido if active_checklist else '')).strip() if is_admin_general else None,
					f_turno=request.form.get('f_turno', selected_filter_turno).strip() if is_admin_general else None,
					f_sede=request.form.get('f_sede', selected_filter_sede).strip() if is_admin_general else None,
					f_area=request.form.get('f_area', selected_filter_area).strip() if is_admin_general else None,
					f_user=request.form.get('f_user', selected_filter_user).strip() or None,
				)
			)

		if not is_admin_general:
			active_checklist = _get_active_checklist(current_user, selected_date)
			visible_checklist = active_checklist or _get_visible_checklist(current_user, selected_date)

		checklist_items = _get_checklist_items(
			visible_checklist,
			include_all=is_admin_general,
			user=current_user,
			target_user_id=selected_filter_user if (is_admin_general or selected_filter_user) else '',
			target_area=selected_filter_area if is_admin_general else '',
		)
		active_items = _get_checklist_items(
			active_checklist,
			include_all=is_admin_general,
			user=current_user,
			target_user_id=selected_filter_user if (is_admin_general or selected_filter_user) else '',
			target_area=selected_filter_area if is_admin_general else '',
		)
		active_positive_items = [row for row in active_items if _safe_float(row[0].cantidad_pedida, 0.0) > 0]
		visible_positive_items = [row for row in checklist_items if _safe_float(row[0].cantidad_pedida, 0.0) > 0]
		if is_admin_general and active_checklist and selected_filter_user:
			selected_product_ids = {
				row.id_producto
				for row in DetallePedido.query.filter_by(
					id_pedido=active_checklist.id_pedido,
					id_usuario=selected_filter_user,
				).all()
			}
		elif not is_admin_general and selected_filter_user and selected_filter_user != current_user.id_usuario:
			selected_product_ids = _get_template_product_ids_for_user(current_user, selected_filter_user)
		else:
			selected_product_ids = _get_template_product_ids(current_user)
		can_edit_selected_user = is_admin_general or not selected_filter_user or selected_filter_user == current_user.id_usuario
		selected_q = request.args.get('q', '').strip()
		catalog_products = _get_checklist_catalog(current_user, selected_q)
		all_catalog_products = _get_checklist_catalog(current_user, '')
		active_tab = request.args.get('tab', 'view').strip().lower() or 'view'
		if active_tab not in {'view', 'list', 'edit'}:
			active_tab = 'view'
		return render_template(
			'dashboard/checklist.html',
			allowed_views=_allowed_views(current_user),
			current_checklist=visible_checklist,
			active_checklist=active_checklist,
			checklist_items=checklist_items,
			active_items=active_items,
			active_positive_items=active_positive_items,
			visible_positive_items=visible_positive_items,
			selected_product_ids=selected_product_ids,
			catalog_products=catalog_products,
			all_catalog_products=all_catalog_products,
			active_tab=active_tab,
			selected_q=selected_q,
			is_admin_general=is_admin_general,
			checklist_selector_options=checklist_selector_options,
			selected_pedido_id=selected_pedido_id,
			selected_filter_turno=selected_filter_turno,
			selected_filter_sede=selected_filter_sede,
			selected_filter_area=selected_filter_area,
			selected_filter_user=selected_filter_user,
			admin_turno_options=admin_turno_options,
			admin_sede_options=admin_sede_options,
			admin_area_options=admin_area_options,
			admin_user_options=admin_user_options,
			checklist_user_options=checklist_user_options,
			can_edit_selected_user=can_edit_selected_user,
			can_insert=current_user.can_write('checklist', 'insert'),
		)

	@app.route('/manifest.webmanifest')
	def manifest():
		response = send_from_directory(app.static_folder, 'manifest.webmanifest')
		response.headers['Content-Type'] = 'application/manifest+json'
		response.headers['Cache-Control'] = 'no-cache'
		return response

	@app.route('/service-worker.js')
	def service_worker():
		response = send_from_directory(app.static_folder, 'js/service-worker.js')
		response.headers['Content-Type'] = 'application/javascript'
		response.headers['Service-Worker-Allowed'] = '/'
		response.headers['Cache-Control'] = 'no-cache'
		return response

	@app.route('/arqueo', methods=['GET', 'POST'])
	@login_required
	def arqueo():
		if not current_user.can_view('arqueo'):
			return _forbidden_redirect()
		selected_date = _get_selected_app_date()
		is_admin_general = current_user.rol_nombre == 'admin_general'

		f_sede = request.args.get('sede', '').strip()
		f_turno = request.args.get('turno', '').strip()

		target_sede_id = current_user.id_sede
		target_turno_id = current_user.id_turno
		if is_admin_general:
			if f_sede.isdigit():
				target_sede_id = int(f_sede)
			if f_turno:
				target_turno_id = f_turno

		if not target_sede_id or not target_turno_id:
			flash('No se puede abrir arqueo sin sede y turno definidos.', 'error')
			return redirect(url_for('dashboard'))

		cierre_query = ArqueoCaja.query.filter(
			ArqueoCaja.id_sede == target_sede_id,
			ArqueoCaja.id_turno == target_turno_id,
			ArqueoCaja.fecha == selected_date,
		)
		cierre = cierre_query.order_by(ArqueoCaja.id_arqueo.desc()).first()

		if request.method == 'POST':
			if not current_user.can_write('arqueo', 'update') and not current_user.can_write('arqueo', 'insert'):
				return _forbidden_redirect()

			monto_inicial = _safe_float(request.form.get('monto_inicial'), 0.0)
			pos_tarjetas = _safe_float(request.form.get('pos_tarjetas'), 0.0)
			yape = _safe_float(request.form.get('yape'), 0.0)
			plin = _safe_float(request.form.get('plin'), 0.0)
			efectivo = _safe_float(request.form.get('efectivo'), 0.0)
			venta_sistema = _safe_float(request.form.get('venta_sistema'), 0.0)
			gastos = _parse_gastos_from_form(request.form)
			resumen = _calc_cierre_operativo(
				monto_inicial,
				pos_tarjetas,
				yape,
				plin,
				efectivo,
				venta_sistema,
				gastos,
			)

			if cierre is None:
				cierre = ArqueoCaja(
					id_sede=target_sede_id,
					id_turno=target_turno_id,
					id_usuario=current_user.id_usuario,
					fecha=selected_date,
				)
				db.session.add(cierre)

			cierre.id_usuario = current_user.id_usuario
			cierre.monto_inicial = monto_inicial
			cierre.pos_tarjetas = pos_tarjetas
			cierre.yape = yape
			cierre.plin = plin
			cierre.efectivo = efectivo
			cierre.venta_sistema = venta_sistema
			cierre.gastos_json = json.dumps(gastos, ensure_ascii=True)
			cierre.monto_final = resumen['subtotal']
			cierre.observaciones = request.form.get('observaciones', '').strip()

			db.session.commit()
			flash('Cierre de caja guardado para esta sede y turno.', 'ok')
			if is_admin_general:
				return redirect(url_for('arqueo', sede=target_sede_id, turno=target_turno_id))
			return redirect(url_for('arqueo'))

		if cierre and cierre.gastos_json:
			try:
				gastos_actuales = json.loads(cierre.gastos_json)
			except (TypeError, ValueError):
				gastos_actuales = []
		else:
			gastos_actuales = []

		monto_inicial = _safe_float(cierre.monto_inicial if cierre else 0.0, 0.0)
		pos_tarjetas = _safe_float(cierre.pos_tarjetas if cierre else 0.0, 0.0)
		yape = _safe_float(cierre.yape if cierre else 0.0, 0.0)
		plin = _safe_float(cierre.plin if cierre else 0.0, 0.0)
		efectivo = _safe_float(cierre.efectivo if cierre else 0.0, 0.0)
		venta_sistema = _safe_float(cierre.venta_sistema if cierre else 0.0, 0.0)
		resumen = _calc_cierre_operativo(
			monto_inicial,
			pos_tarjetas,
			yape,
			plin,
			efectivo,
			venta_sistema,
			gastos_actuales,
		)

		historial_query = ArqueoCaja.query.filter(
			ArqueoCaja.fecha == selected_date,
			ArqueoCaja.id_sede == target_sede_id,
			ArqueoCaja.id_turno == target_turno_id,
		)
		if not is_admin_general:
			historial_query = historial_query.filter(
				ArqueoCaja.id_sede == current_user.id_sede,
				ArqueoCaja.id_turno == current_user.id_turno,
			)
		historial_cierres = historial_query.order_by(ArqueoCaja.id_arqueo.desc()).limit(20).all()

		sedes_disponibles = []
		turnos_disponibles = []
		if is_admin_general:
			sedes_disponibles = Sede.query.order_by(Sede.nombre_sede.asc()).all()
			turnos_disponibles = Turno.query.order_by(Turno.nombre_turno.asc()).all()

		return render_template(
			'dashboard/arqueo_caja.html',
			allowed_views=_allowed_views(current_user),
			cierre=cierre,
			gastos_actuales=gastos_actuales,
			resumen=resumen,
			historial_cierres=historial_cierres,
			target_sede_id=target_sede_id,
			target_turno_id=target_turno_id,
			sedes_disponibles=sedes_disponibles,
			turnos_disponibles=turnos_disponibles,
			is_admin_general=is_admin_general,
			can_insert=current_user.can_write('arqueo', 'insert'),
			can_update=current_user.can_write('arqueo', 'update'),
		)

	@app.route('/arqueo/dashboard', methods=['GET'])
	@login_required
	def arqueo_dashboard():
		if not current_user.can_view('arqueo'):
			return _forbidden_redirect()

		selected_date = _get_selected_app_date()
		is_admin_general = current_user.rol_nombre == 'admin_general'

		rows_query = db.session.query(ArqueoCaja, Sede, Turno).outerjoin(
			Sede, Sede.id_sede == ArqueoCaja.id_sede
		).outerjoin(
			Turno, Turno.id_turno == ArqueoCaja.id_turno
		).filter(
			ArqueoCaja.fecha == selected_date
		)
		if not is_admin_general:
			rows_query = rows_query.filter(
				ArqueoCaja.id_sede == current_user.id_sede,
				ArqueoCaja.id_turno == current_user.id_turno,
			)
		rows = rows_query.order_by(ArqueoCaja.id_arqueo.desc()).all()

		rows_stats = []
		for arqueo, sede, turno in rows:
			monto_inicial = _safe_float(arqueo.monto_inicial, 0.0)
			venta_sistema = _safe_float(arqueo.venta_sistema, 0.0)
			subtotal = _safe_float(arqueo.monto_final, 0.0)
			total_ingresos = (
				_safe_float(arqueo.pos_tarjetas, 0.0)
				+ _safe_float(arqueo.yape, 0.0)
				+ _safe_float(arqueo.plin, 0.0)
				+ _safe_float(arqueo.efectivo, 0.0)
			)
			gastos_totales = subtotal - total_ingresos
			diferencia = (subtotal - monto_inicial) - venta_sistema
			estado = 'Cuadre exacto'
			if diferencia > 0:
				estado = 'Sobrante'
			elif diferencia < 0:
				estado = 'Faltante'
			rows_stats.append({
				'arqueo': arqueo,
				'sede': sede,
				'turno': turno,
				'total_ingresos': total_ingresos,
				'gastos_totales': gastos_totales,
				'subtotal': subtotal,
				'diferencia': diferencia,
				'estado': estado,
			})

		summary = {
			'cierres': len(rows_stats),
			'total_venta_sistema': sum(_safe_float(item['arqueo'].venta_sistema, 0.0) for item in rows_stats),
			'total_ingresos': sum(item['total_ingresos'] for item in rows_stats),
			'total_diferencia': sum(item['diferencia'] for item in rows_stats),
			'sobrantes': sum(1 for item in rows_stats if item['diferencia'] > 0),
			'faltantes': sum(1 for item in rows_stats if item['diferencia'] < 0),
			'cuadrados': sum(1 for item in rows_stats if item['diferencia'] == 0),
		}

		comparacion = None
		if is_admin_general:
			if len(rows_stats) >= 2:
				reference = rows_stats[0]
				target = rows_stats[1]
				comparacion = {
					'reference': reference,
					'target': target,
					'gap_diferencia': reference['diferencia'] - target['diferencia'],
					'gap_venta_sistema': _safe_float(reference['arqueo'].venta_sistema, 0.0) - _safe_float(target['arqueo'].venta_sistema, 0.0),
				}
		else:
			mine = rows_stats[0] if rows_stats else None
			other_row = db.session.query(ArqueoCaja, Sede, Turno).outerjoin(
				Sede, Sede.id_sede == ArqueoCaja.id_sede
			).outerjoin(
				Turno, Turno.id_turno == ArqueoCaja.id_turno
			).filter(
				ArqueoCaja.fecha == selected_date,
				or_(ArqueoCaja.id_sede != current_user.id_sede, ArqueoCaja.id_turno != current_user.id_turno),
			).order_by(ArqueoCaja.id_arqueo.desc()).first()
			if mine and other_row:
				other_arqueo, other_sede, other_turno = other_row
				other_subtotal = _safe_float(other_arqueo.monto_final, 0.0)
				other_diferencia = (other_subtotal - _safe_float(other_arqueo.monto_inicial, 0.0)) - _safe_float(other_arqueo.venta_sistema, 0.0)
				comparacion = {
					'reference': mine,
					'target': {
						'arqueo': other_arqueo,
						'sede': other_sede,
						'turno': other_turno,
						'diferencia': other_diferencia,
					},
					'gap_diferencia': mine['diferencia'] - other_diferencia,
					'gap_venta_sistema': _safe_float(mine['arqueo'].venta_sistema, 0.0) - _safe_float(other_arqueo.venta_sistema, 0.0),
				}

		sede_rollup = {}
		sede_turno_rollup = {}
		for item in rows_stats:
			sede_label = item['sede'].nombre_sede if item['sede'] else f"Sede {item['arqueo'].id_sede}"
			turno_label = item['turno'].nombre_turno if item['turno'] else str(item['arqueo'].id_turno)
			key_sede_turno = f"{sede_label} - {turno_label}"
			if sede_label not in sede_rollup:
				sede_rollup[sede_label] = {
					'venta': 0.0,
					'ingresos': 0.0,
					'pos': 0.0,
					'digital': 0.0,
					'efectivo': 0.0,
					'diferencia': 0.0,
				}
			if key_sede_turno not in sede_turno_rollup:
				sede_turno_rollup[key_sede_turno] = {
					'venta': 0.0,
					'ingresos': 0.0,
					'pos': 0.0,
					'digital': 0.0,
					'efectivo': 0.0,
					'diferencia': 0.0,
				}
			sede_rollup[sede_label]['venta'] += _safe_float(item['arqueo'].venta_sistema, 0.0)
			sede_rollup[sede_label]['ingresos'] += _safe_float(item['total_ingresos'], 0.0)
			sede_rollup[sede_label]['pos'] += _safe_float(item['arqueo'].pos_tarjetas, 0.0)
			sede_rollup[sede_label]['digital'] += _safe_float(item['arqueo'].yape, 0.0) + _safe_float(item['arqueo'].plin, 0.0)
			sede_rollup[sede_label]['efectivo'] += _safe_float(item['arqueo'].efectivo, 0.0)
			sede_rollup[sede_label]['diferencia'] += _safe_float(item['diferencia'], 0.0)

			sede_turno_rollup[key_sede_turno]['venta'] += _safe_float(item['arqueo'].venta_sistema, 0.0)
			sede_turno_rollup[key_sede_turno]['ingresos'] += _safe_float(item['total_ingresos'], 0.0)
			sede_turno_rollup[key_sede_turno]['pos'] += _safe_float(item['arqueo'].pos_tarjetas, 0.0)
			sede_turno_rollup[key_sede_turno]['digital'] += _safe_float(item['arqueo'].yape, 0.0) + _safe_float(item['arqueo'].plin, 0.0)
			sede_turno_rollup[key_sede_turno]['efectivo'] += _safe_float(item['arqueo'].efectivo, 0.0)
			sede_turno_rollup[key_sede_turno]['diferencia'] += _safe_float(item['diferencia'], 0.0)

		bar_labels = sorted(sede_turno_rollup.keys())
		chart_bar = {
			'labels': bar_labels,
			'venta_sistema': [round(sede_turno_rollup[label]['venta'], 2) for label in bar_labels],
			'recaudacion_real': [round(sede_turno_rollup[label]['ingresos'], 2) for label in bar_labels],
		}

		total_pos = sum(sede_rollup[label]['pos'] for label in bar_labels)
		total_digital = sum(sede_rollup[label]['digital'] for label in bar_labels)
		total_efectivo = sum(sede_rollup[label]['efectivo'] for label in bar_labels)
		chart_pie = {
			'labels': ['POS', 'Yape/Plin', 'Efectivo'],
			'values': [round(total_pos, 2), round(total_digital, 2), round(total_efectivo, 2)],
		}

		trend_start = selected_date - timedelta(days=6)
		trend_labels = [
			(trend_start + timedelta(days=i)).strftime('%d/%m')
			for i in range(7)
		]
		trend_lookup = [
			(trend_start + timedelta(days=i)).strftime('%Y-%m-%d')
			for i in range(7)
		]

		trend_query = db.session.query(ArqueoCaja, Sede).outerjoin(
			Sede, Sede.id_sede == ArqueoCaja.id_sede
		).filter(
			ArqueoCaja.fecha >= trend_start,
			ArqueoCaja.fecha <= selected_date,
		)
		if not is_admin_general:
			trend_query = trend_query.filter(
				ArqueoCaja.id_sede == current_user.id_sede,
				ArqueoCaja.id_turno == current_user.id_turno,
			)
		trend_rows = trend_query.all()

		trend_sede_data = defaultdict(lambda: defaultdict(float))
		for arqueo, sede in trend_rows:
			fecha_key = arqueo.fecha.strftime('%Y-%m-%d') if arqueo.fecha else ''
			sede_label = sede.nombre_sede if sede else f"Sede {arqueo.id_sede}"
			total_ing = (
				_safe_float(arqueo.pos_tarjetas, 0.0)
				+ _safe_float(arqueo.yape, 0.0)
				+ _safe_float(arqueo.plin, 0.0)
				+ _safe_float(arqueo.efectivo, 0.0)
			)
			gastos = _safe_float(arqueo.monto_final, 0.0) - total_ing
			trend_sede_data[sede_label][fecha_key] += gastos

		palette = ['#E6C682', '#4A4A4A', '#2D2D2D', '#B98E38', '#7A7A7A']
		chart_trend = {
			'labels': trend_labels,
			'datasets': [],
		}
		for idx, sede_label in enumerate(sorted(trend_sede_data.keys())):
			chart_trend['datasets'].append({
				'label': sede_label,
				'data': [round(trend_sede_data[sede_label].get(day_key, 0.0), 2) for day_key in trend_lookup],
				'borderColor': palette[idx % len(palette)],
				'backgroundColor': palette[idx % len(palette)],
				'tension': 0.25,
				'fill': False,
			})

		benchmark_labels = bar_labels
		benchmark_values = []
		for label in benchmark_labels:
			venta = sede_turno_rollup[label]['venta']
			diferencia = sede_turno_rollup[label]['diferencia']
			operativo = venta + diferencia
			indice = (operativo / venta * 100.0) if venta > 0 else 0.0
			benchmark_values.append(round(indice, 2))
		chart_benchmark = {
			'labels': benchmark_labels,
			'values': benchmark_values,
		}

		comparacion_turnos = []
		sede_items = defaultdict(list)
		for item in rows_stats:
			sede_label = item['sede'].nombre_sede if item['sede'] else f"Sede {item['arqueo'].id_sede}"
			sede_items[sede_label].append(item)

		for sede_label, items in sorted(sede_items.items(), key=lambda entry: entry[0]):
			if len(items) < 2:
				continue
			ordered = sorted(items, key=lambda row: ((row['turno'].nombre_turno if row['turno'] else ''), row['arqueo'].id_turno or ''))
			reference = ordered[0]
			target = ordered[1]
			comparacion_turnos.append({
				'sede': sede_label,
				'reference_turno': reference['turno'].nombre_turno if reference['turno'] else str(reference['arqueo'].id_turno),
				'target_turno': target['turno'].nombre_turno if target['turno'] else str(target['arqueo'].id_turno),
				'reference_diferencia': reference['diferencia'],
				'target_diferencia': target['diferencia'],
				'gap_diferencia': reference['diferencia'] - target['diferencia'],
				'reference_venta': _safe_float(reference['arqueo'].venta_sistema, 0.0),
				'target_venta': _safe_float(target['arqueo'].venta_sistema, 0.0),
				'gap_venta': _safe_float(reference['arqueo'].venta_sistema, 0.0) - _safe_float(target['arqueo'].venta_sistema, 0.0),
			})

		week_start = selected_date - timedelta(days=selected_date.weekday())
		month_start = selected_date.replace(day=1)

		period_query = ArqueoCaja.query.filter(ArqueoCaja.fecha >= month_start, ArqueoCaja.fecha <= selected_date)
		if not is_admin_general:
			period_query = period_query.filter(
				ArqueoCaja.id_sede == current_user.id_sede,
				ArqueoCaja.id_turno == current_user.id_turno,
			)
		period_rows = period_query.all()

		week_ganancia = 0.0
		week_gastos = 0.0
		month_ganancia = 0.0
		month_gastos = 0.0

		for arqueo in period_rows:
			total_ingresos_item = (
				_safe_float(arqueo.pos_tarjetas, 0.0)
				+ _safe_float(arqueo.yape, 0.0)
				+ _safe_float(arqueo.plin, 0.0)
				+ _safe_float(arqueo.efectivo, 0.0)
			)
			gastos_item = _safe_float(arqueo.monto_final, 0.0) - total_ingresos_item
			ganancia_item = _safe_float(arqueo.monto_final, 0.0) - _safe_float(arqueo.monto_inicial, 0.0)

			if arqueo.fecha and arqueo.fecha >= week_start:
				week_ganancia += ganancia_item
				week_gastos += gastos_item

			month_ganancia += ganancia_item
			month_gastos += gastos_item

		chart_ganancia_gastos = {
			'labels': ['Semana actual', 'Mes actual'],
			'ganancia': [round(week_ganancia, 2), round(month_ganancia, 2)],
			'gastos': [round(week_gastos, 2), round(month_gastos, 2)],
		}

		return render_template(
			'dashboard/arqueo_dashboard.html',
			allowed_views=_allowed_views(current_user),
			selected_date=selected_date,
			is_admin_general=is_admin_general,
			rows_stats=rows_stats,
			summary=summary,
			comparacion=comparacion,
			chart_bar=chart_bar,
			chart_pie=chart_pie,
			chart_trend=chart_trend,
			chart_benchmark=chart_benchmark,
			chart_ganancia_gastos=chart_ganancia_gastos,
			comparacion_turnos=comparacion_turnos,
		)

	@app.route('/admin/ajustes', methods=['GET', 'POST'])
	@login_required
	def ajustes():
		if not current_user.can_view('ajustes'):
			return _forbidden_redirect()

		if request.method == 'POST':
			if not current_user.can_write('ajustes', 'insert'):
				return _forbidden_redirect()

			tipo_form = request.form.get('tipo_form')
			if tipo_form == 'sede':
				nombre_sede = request.form.get('nombre_sede', '').strip()
				if not nombre_sede:
					flash('Nombre de sede requerido.', 'error')
					return redirect(url_for('ajustes'))
				db.session.add(Sede(nombre_sede=nombre_sede))
			elif tipo_form == 'usuario':
				new_id = request.form.get('id_usuario', '').strip()
				new_username = request.form.get('username', '').strip()
				if not new_id or not new_username:
					flash('ID y username son obligatorios.', 'error')
					return redirect(url_for('ajustes'))
				if Usuario.query.filter_by(id_usuario=new_id).first():
					flash('El ID de usuario ya existe.', 'error')
					return redirect(url_for('ajustes'))
				if Usuario.query.filter(db.func.lower(Usuario.username) == new_username.lower()).first():
					flash('El username ya existe.', 'error')
					return redirect(url_for('ajustes'))
				db.session.add(
					Usuario(
						id_usuario=new_id,
						username=new_username,
						password_hash=generate_password_hash(request.form.get('password', '123456')),
						id_rol=int(request.form.get('id_rol')),
						id_sede=int(request.form.get('id_sede')),
						id_turno=request.form.get('id_turno'),
					)
				)
			elif tipo_form == 'update_usuario':
				old_id = request.form.get('old_id_usuario', '').strip()
				new_id = request.form.get('id_usuario', '').strip()
				new_username = request.form.get('username', '').strip()
				new_password = request.form.get('password', '')

				if not old_id or not new_id or not new_username:
					flash('ID actual, nuevo ID y username son obligatorios.', 'error')
					return redirect(url_for('ajustes'))

				usuario = Usuario.query.filter_by(id_usuario=old_id).first()
				if not usuario:
					flash('No se encontro el usuario a actualizar.', 'error')
					return redirect(url_for('ajustes'))

				id_in_use = Usuario.query.filter(Usuario.id_usuario == new_id, Usuario.id_usuario != old_id).first()
				if id_in_use:
					flash('El nuevo ID ya esta en uso.', 'error')
					return redirect(url_for('ajustes'))

				username_in_use = Usuario.query.filter(
					db.func.lower(Usuario.username) == new_username.lower(),
					Usuario.id_usuario != old_id,
				).first()
				if username_in_use:
					flash('El username ya esta en uso.', 'error')
					return redirect(url_for('ajustes'))

				if new_id != old_id:
					replacement = Usuario(
						id_usuario=new_id,
						username=new_username,
						password_hash=generate_password_hash(new_password) if new_password else usuario.password_hash,
						id_rol=usuario.id_rol,
						id_sede=usuario.id_sede,
						id_turno=usuario.id_turno,
					)
					db.session.add(replacement)
					db.session.flush()

					ChecklistPedido.query.filter_by(id_usuario=old_id).update({'id_usuario': new_id})
					MovimientoInventario.query.filter_by(id_usuario=old_id).update({'id_usuario': new_id})
					ArqueoCaja.query.filter_by(id_usuario=old_id).update({'id_usuario': new_id})
					PlantillaChecklistItem.query.filter_by(id_usuario=old_id).update({'id_usuario': new_id})
					DetallePedido.query.filter_by(id_usuario=old_id).update({'id_usuario': new_id})

					db.session.delete(usuario)
				else:
					usuario.username = new_username
					if new_password:
						usuario.password_hash = generate_password_hash(new_password)

				flash('Usuario actualizado correctamente.', 'ok')
				db.session.commit()
				return redirect(url_for('ajustes'))
			elif tipo_form == 'delete_usuario':
				user_id = request.form.get('id_usuario', '').strip()
				if not user_id:
					flash('Usuario invalido.', 'error')
					return redirect(url_for('ajustes'))
				if user_id == current_user.id_usuario:
					flash('No puedes eliminar tu propio usuario mientras estas logueado.', 'error')
					return redirect(url_for('ajustes'))

				usuario = Usuario.query.filter_by(id_usuario=user_id).first()
				if not usuario:
					flash('No se encontro el usuario.', 'error')
					return redirect(url_for('ajustes'))

				ChecklistPedido.query.filter_by(id_usuario=user_id).update({'id_usuario': None})
				MovimientoInventario.query.filter_by(id_usuario=user_id).update({'id_usuario': None})
				ArqueoCaja.query.filter_by(id_usuario=user_id).update({'id_usuario': None})
				PlantillaChecklistItem.query.filter_by(id_usuario=user_id).delete()
				DetallePedido.query.filter_by(id_usuario=user_id).update({'id_usuario': None})
				db.session.delete(usuario)
				db.session.commit()
				flash('Usuario eliminado correctamente.', 'ok')
				return redirect(url_for('ajustes'))

			db.session.commit()
			flash('Configuracion guardada.', 'ok')

		return render_template(
			'admin/ajustes.html',
			allowed_views=_allowed_views(current_user),
			sedes=Sede.query.order_by(Sede.nombre_sede).all(),
			roles=Rol.query.order_by(Rol.nombre_rol).all(),
			turnos=Turno.query.order_by(Turno.nombre_turno).all(),
			usuarios=Usuario.query.order_by(Usuario.username).limit(20).all(),
		)

	@app.context_processor
	def inject_globals():
		selected_date = session.get('app_date', '').strip()
		if not selected_date:
			app_date = _get_operation_date()
			selected_date = app_date.strftime('%Y-%m-%d')
			session['app_date'] = selected_date
		else:
			try:
				app_date = datetime.strptime(selected_date, '%Y-%m-%d')
			except ValueError:
				app_date = _get_operation_date()
				selected_date = app_date.strftime('%Y-%m-%d')
				session['app_date'] = selected_date
		return {
			'today_text': app_date.strftime('%d/%m/%Y'),
			'today_value': selected_date,
			'current_date_obj': app_date.date(),
		}

	return app


app = create_app()


if __name__ == '__main__':
	app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), debug=os.environ.get('FLASK_DEBUG', '0') == '1')
