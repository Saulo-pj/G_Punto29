from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime
from sqlalchemy import UniqueConstraint

db = SQLAlchemy()


# --- TABLAS MAESTRAS (Configuracion) ---

class Sede(db.Model):
	__tablename__ = 'sedes'
	id_sede = db.Column(db.Integer, primary_key=True)
	nombre_sede = db.Column(db.String(50), nullable=False)  # Almacen, Sede_17, Sede_20


class Rol(db.Model):
	__tablename__ = 'roles'
	id_rol = db.Column(db.Integer, primary_key=True)
	nombre_rol = db.Column(db.String(50), nullable=False)  # admin_general, cocinero, etc.


class Turno(db.Model):
	__tablename__ = 'turnos'
	id_turno = db.Column(db.String(20), primary_key=True)  # Manana, Noche, N/A
	nombre_turno = db.Column(db.String(50), nullable=False)


class Categoria(db.Model):
	__tablename__ = 'categorias'
	id_categoria = db.Column(db.Integer, primary_key=True)
	nombre_categoria = db.Column(db.String(80), unique=True, nullable=False)


class Unidad(db.Model):
	__tablename__ = 'unidades'
	id_unidad = db.Column(db.Integer, primary_key=True)
	nombre_unidad = db.Column(db.String(50), unique=True, nullable=False)


class Area(db.Model):
	__tablename__ = 'areas'
	id_area = db.Column(db.Integer, primary_key=True)
	nombre_area = db.Column(db.String(50), unique=True, nullable=False)


class Subarea(db.Model):
	__tablename__ = 'subareas'
	id_subarea = db.Column(db.Integer, primary_key=True)
	id_area = db.Column(db.Integer, db.ForeignKey('areas.id_area'), nullable=False)
	nombre_subarea = db.Column(db.String(80), nullable=False)

	area = db.relationship('Area', backref='subareas')


# --- USUARIOS Y PERMISOS ---

class Usuario(UserMixin, db.Model):
	__tablename__ = 'usuarios'
	id_usuario = db.Column(db.String(50), primary_key=True)
	username = db.Column(db.String(50), unique=True, nullable=False)
	password_hash = db.Column(db.Text, nullable=False)
	dni = db.Column(db.String(20))
	fecha_nacimiento = db.Column(db.Date)
	email = db.Column(db.String(120))
	telefono = db.Column(db.String(30))
	direccion = db.Column(db.String(180))
	bio = db.Column(db.String(240))
	id_rol = db.Column(db.Integer, db.ForeignKey('roles.id_rol'))
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'))
	id_turno = db.Column(db.String(20), db.ForeignKey('turnos.id_turno'))

	# Relaciones para acceder facil a los nombres
	rol = db.relationship('Rol', backref='usuarios')
	sede = db.relationship('Sede', backref='usuarios')
	turno = db.relationship('Turno', backref='usuarios')

	def get_id(self):
		return str(self.id_usuario)

	@property
	def rol_nombre(self):
		return self.rol.nombre_rol if self.rol else ''

	@property
	def turno_nombre(self):
		return self.turno.nombre_turno if self.turno else ''

	def can_view(self, vista):
		permissions = {
			'admin_general': {'inventario', 'movimientos', 'pedidos', 'checklist', 'arqueo', 'ajustes', 'dashboard'},
			'admin_almacen': {'inventario', 'movimientos', 'pedidos', 'dashboard'},
			'personal_prod': {'inventario', 'movimientos', 'pedidos', 'dashboard'},
			'admin_sala': {'checklist', 'arqueo', 'dashboard'},
			'cocinero': {'checklist', 'dashboard'},
		}
		return vista in permissions.get(self.rol_nombre, set())

	def can_write(self, modulo, action='insert'):
		full = {'insert', 'update', 'delete'}
		write_rules = {
			'admin_general': {
				'inventario': full,
				'movimientos': full,
				'pedidos': full,
				'checklist': full,
				'arqueo': full,
				'ajustes': full,
			},
			'admin_almacen': {
				'inventario': full,
				'movimientos': full,
				'pedidos': full,
			},
			'personal_prod': {
				'movimientos': {'insert'},
				'pedidos': {'insert', 'update'},
			},
			'admin_sala': {
				'checklist': full,
				'arqueo': full,
			},
			'cocinero': {
				'checklist': {'insert'},
			},
		}
		return action in write_rules.get(self.rol_nombre, {}).get(modulo, set())


# --- INVENTARIO Y PRODUCTOS ---

class Producto(db.Model):
	__tablename__ = 'productos'
	id_producto = db.Column(db.String(50), primary_key=True)
	nombre_producto = db.Column(db.String(100), nullable=False)
	id_area = db.Column(db.String(50))  # Categoria de producto: Carnes, Pollos, Condimentos, etc.
	area = db.Column(db.String(20))  # Cocina o Sala
	subarea = db.Column(db.String(50))
	unidad = db.Column(db.String(50))
	estado = db.Column(db.String(20), default='Activo')


class InventarioSede(db.Model):
	__tablename__ = 'inventario_sedes'
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'), primary_key=True)
	id_producto = db.Column(db.String(50), db.ForeignKey('productos.id_producto'), primary_key=True)
	stock_actual = db.Column(db.Float, default=0.0)
	punto_minimo = db.Column(db.Float, default=0.0)

	__table_args__ = (
		UniqueConstraint('id_sede', 'id_producto', name='uq_inventario_sede_producto'),
	)


# --- OPERACIONES (Checklist, Pedidos, Movimientos, Caja) ---

class ChecklistPedido(db.Model):
	__tablename__ = 'checklist_pedidos'
	id_pedido = db.Column(db.Integer, primary_key=True)
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'))
	id_turno = db.Column(db.String(20), db.ForeignKey('turnos.id_turno'))
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'))
	fecha = db.Column(db.DateTime, default=datetime.utcnow)
	estado_general = db.Column(db.String(20), default='Pendiente')  # Pendiente, Enviado, Recibido


class DetallePedido(db.Model):
	__tablename__ = 'detalle_pedido'
	id_detalle = db.Column(db.Integer, primary_key=True)
	id_pedido = db.Column(db.Integer, db.ForeignKey('checklist_pedidos.id_pedido'))
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'))
	id_producto = db.Column(db.String(50), db.ForeignKey('productos.id_producto'))
	cantidad_pedida = db.Column(db.Float, nullable=False)
	cantidad_entregada = db.Column(db.Float, default=0.0)
	estado_sede = db.Column(db.String(20), default='Pendiente')


class PlantillaChecklistItem(db.Model):
	__tablename__ = 'plantilla_checklist_items'
	id_item = db.Column(db.Integer, primary_key=True)
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'), nullable=False)
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'), nullable=False)
	id_turno = db.Column(db.String(20), db.ForeignKey('turnos.id_turno'), nullable=False)
	area = db.Column(db.String(20), nullable=False, default='')
	id_producto = db.Column(db.String(50), db.ForeignKey('productos.id_producto'), nullable=False)
	creado_en = db.Column(db.DateTime, default=datetime.utcnow)

	__table_args__ = (
		UniqueConstraint('id_usuario', 'id_sede', 'id_turno', 'area', 'id_producto', name='uq_plantilla_checklist_scope_producto'),
	)


class MovimientoInventario(db.Model):
	__tablename__ = 'movimientos'
	id_movimiento = db.Column(db.Integer, primary_key=True)
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'))
	id_producto = db.Column(db.String(50), db.ForeignKey('productos.id_producto'))
	cantidad = db.Column(db.Float, nullable=False)
	tipo = db.Column(db.String(20))  # ENTRADA / SALIDA
	motivo = db.Column(db.String(100))  # Envio a Sede 17, Ajuste Almacen
	fecha = db.Column(db.DateTime, default=datetime.utcnow)
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'))


class ArqueoCaja(db.Model):
	__tablename__ = 'arqueo_caja'
	id_arqueo = db.Column(db.Integer, primary_key=True)
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'))
	id_turno = db.Column(db.String(20), db.ForeignKey('turnos.id_turno'))
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'))
	fecha = db.Column(db.Date, default=lambda: datetime.utcnow().date())
	monto_inicial = db.Column(db.Float, default=0.0)
	monto_final = db.Column(db.Float, default=0.0)
	pos_tarjetas = db.Column(db.Float, default=0.0)
	yape = db.Column(db.Float, default=0.0)
	plin = db.Column(db.Float, default=0.0)
	efectivo = db.Column(db.Float, default=0.0)
	venta_sistema = db.Column(db.Float, default=0.0)
	gastos_json = db.Column(db.Text, default='[]')
	observaciones = db.Column(db.Text)
