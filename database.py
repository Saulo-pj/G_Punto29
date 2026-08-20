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
	# Monto inicial base esperado por esta sede, definido por Admin General
	monto_inicial_base_esperado = db.Column(db.Float, default=0.0)


class Rol(db.Model):
	__tablename__ = 'roles'
	id_rol = db.Column(db.Integer, primary_key=True)
	nombre_rol = db.Column(db.String(50), nullable=False)  # admin_general, cocinero, etc.


class Turno(db.Model):
	__tablename__ = 'turnos'
	id_turno = db.Column(db.String(20), primary_key=True)  # Manana, Noche, N/A
	nombre_turno = db.Column(db.String(50), nullable=False)


class RecordatorioCierre(db.Model):
	__tablename__ = 'recordatorios_cierre'
	id_recordatorio = db.Column(db.Integer, primary_key=True)
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'), nullable=False)
	id_turno = db.Column(db.String(20), db.ForeignKey('turnos.id_turno'), nullable=False)
	hora_cierre = db.Column(db.String(5), nullable=False, default='23:00')
	activo = db.Column(db.Boolean, default=True)
	actualizado_en = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

	__table_args__ = (UniqueConstraint('id_sede', 'id_turno', name='uq_recordatorio_sede_turno'),)


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
			'admin_general': {'inventario', 'movimientos', 'pedidos', 'checklist', 'arqueo', 'ajustes', 'mermas', 'incidencias', 'horarios', 'dashboard'},
			'admin_almacen': {'inventario', 'movimientos', 'pedidos', 'horarios', 'dashboard'},
			'personal_prod': {'inventario', 'movimientos', 'pedidos', 'dashboard'},
			'admin_sala': {'checklist', 'arqueo', 'mermas', 'incidencias', 'horarios', 'dashboard'},
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
				'mermas': full,
				'incidencias': full,
				'horarios': full,
			},
			'admin_almacen': {
				'inventario': full,
				'movimientos': full,
				'pedidos': full,
				'horarios': {'insert', 'update'},
			},
			'personal_prod': {
				'movimientos': {'insert'},
				'pedidos': {'insert', 'update'},
			},
			'admin_sala': {
				'checklist': full,
				'arqueo': full,
				'mermas': {'insert'},
				'incidencias': {'insert'},
				'horarios': {'insert', 'update'},
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
	costo_unitario = db.Column(db.Float, default=0.0)
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
	efectivo_a_entregar = db.Column(db.Float, default=0.0)
	# Efectivo realmente entregado por el administrador de sede (entrada manual)
	efectivo_entregado = db.Column(db.Float, default=0.0)
	efectivo_dejado_caja_recomendado = db.Column(db.Float, default=0.0)
	efectivo_dejado_caja_real = db.Column(db.Float, default=0.0)
	diferencia_efectivo_dejado = db.Column(db.Float, default=0.0)
	seccion_1_guardada = db.Column(db.Boolean, default=False)
	efectivo_entregado_guardado = db.Column(db.Boolean, default=False)
	efectivo_dejado_guardado = db.Column(db.Boolean, default=False)
	campos_bloqueados_json = db.Column(db.Text, default='[]')
	venta_sistema_guardada = db.Column(db.Boolean, default=False)
	venta_sistema = db.Column(db.Float, default=0.0)
	gastos_json = db.Column(db.Text, default='[]')
	observaciones = db.Column(db.Text)


class ArqueoCajaHistorial(db.Model):
	__tablename__ = 'arqueo_caja_historial'
	id_historial = db.Column(db.Integer, primary_key=True)
	id_arqueo = db.Column(db.Integer, db.ForeignKey('arqueo_caja.id_arqueo'), nullable=False)
	usuario_id = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'))
	accion = db.Column(db.String(50), nullable=False)
	tipo_evento = db.Column(db.String(30), default='GUARDADO_MANUAL')
	campo_o_seccion_afectada = db.Column(db.String(120))
	fecha_hora = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
	valor_anterior = db.Column(db.Text)
	valor_nuevo = db.Column(db.Text)


class Merma(db.Model):
	__tablename__ = 'mermas'
	id_merma = db.Column(db.Integer, primary_key=True)
	fecha = db.Column(db.Date, nullable=False, default=lambda: datetime.utcnow().date())
	mes = db.Column(db.String(7), nullable=False)
	turno = db.Column(db.String(20), nullable=False)
	area = db.Column(db.String(80), nullable=False)
	id_producto = db.Column(db.String(50), db.ForeignKey('productos.id_producto'), nullable=False)
	tipo_merma = db.Column(db.String(80), nullable=False)
	cantidad = db.Column(db.Float, nullable=False)
	unidad = db.Column(db.String(50), nullable=False)
	costo_unitario = db.Column(db.Float, nullable=False, default=0.0)
	costo_total = db.Column(db.Float, nullable=False, default=0.0)
	responsable = db.Column(db.String(100), nullable=False)
	observaciones = db.Column(db.Text)
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'), nullable=False)
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'), nullable=False)
	bloqueada = db.Column(db.Boolean, default=False, nullable=False)
	producto = db.relationship('Producto')
	sede = db.relationship('Sede')


class Incidencia(db.Model):
	__tablename__ = 'incidencias'
	id_incidencia = db.Column(db.Integer, primary_key=True)
	fecha = db.Column(db.Date, nullable=False, default=lambda: datetime.utcnow().date())
	mes = db.Column(db.String(7), nullable=False)
	incidencia = db.Column(db.String(120), nullable=False)
	descripcion = db.Column(db.Text)
	responsable = db.Column(db.String(100), nullable=False)
	encargado = db.Column(db.String(100), nullable=False)
	descuento = db.Column(db.Boolean, default=False, nullable=False)
	monto = db.Column(db.Float, default=0.0, nullable=False)
	proceso = db.Column(db.String(30), default='evaluacion', nullable=False)
	id_sede = db.Column(db.Integer, db.ForeignKey('sedes.id_sede'), nullable=False)
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'), nullable=False)
	bloqueada = db.Column(db.Boolean, default=False, nullable=False)
	sede = db.relationship('Sede')


class CatalogoMerma(db.Model):
	__tablename__ = 'catalogos_merma'
	id_catalogo = db.Column(db.Integer, primary_key=True)
	categoria = db.Column(db.String(30), nullable=False)
	nombre = db.Column(db.String(100), nullable=False)
	activo = db.Column(db.Boolean, default=True, nullable=False)

	__table_args__ = (UniqueConstraint('categoria', 'nombre', name='uq_catalogo_merma_categoria_nombre'),)


class AgendaAuditoria(db.Model):
	__tablename__ = 'agenda_auditoria'
	id_auditoria = db.Column(db.Integer, primary_key=True)
	id_usuario = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'), nullable=False)
	accion = db.Column(db.String(40), nullable=False)
	entidad = db.Column(db.String(40), nullable=False)
	detalle_json = db.Column(db.Text)
	fecha_hora = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

	usuario = db.relationship('Usuario')


class AgendaPersistencia(db.Model):
	__tablename__ = 'agenda_persistencia'
	id_agenda = db.Column(db.Integer, primary_key=True, default=1)
	datos_json = db.Column(db.Text, nullable=False, default='{}')
	actualizado_por = db.Column(db.String(50), db.ForeignKey('usuarios.id_usuario'))
	actualizado_en = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

	usuario = db.relationship('Usuario')
