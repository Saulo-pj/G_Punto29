import io
import os
import unittest
from datetime import datetime
from unittest.mock import patch
from database import (db, Rol, Sede, Turno, Usuario, Producto, InventarioSede,
                      ChecklistPedido, DetallePedido, PermisoRol, OperacionLocal, AreaSede, AreaSedeRol)


class OperationalRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, DATABASE_URL='sqlite:///:memory:', SECRET_KEY='operational-tests'):
            from app import create_app
            cls.app = create_app()
        cls.app.config['TESTING'] = True

    def setUp(self):
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            db.session.add_all([Rol(id_rol=1, nombre_rol='admin_general'), Rol(id_rol=2, nombre_rol='cocinero'), Rol(id_rol=3, nombre_rol='admin_almacen'), Sede(id_sede=1, nombre_sede='Almacén'), Sede(id_sede=2, nombre_sede='Restaurante'), Turno(id_turno='NA', nombre_turno='N/A')])
            db.session.flush()
            db.session.add_all([Usuario(id_usuario='general', username='general', password_hash='x', id_rol=1, id_sede=1, id_turno='NA'), Usuario(id_usuario='chef', username='chef', password_hash='x', id_rol=2, id_sede=2, id_turno='NA'), Usuario(id_usuario='warehouse', username='warehouse', password_hash='x', id_rol=3, id_sede=1, id_turno='NA'), Producto(id_producto='P1', nombre_producto='Arroz', unidad='kg', area='cocina', id_area='Abarrotes'), Producto(id_producto='P2', nombre_producto='Zanahoria', unidad='kg', area='cocina', id_area='Verduras')])
            db.session.flush()
            db.session.add_all([InventarioSede(id_sede=1, id_producto='P1', stock_actual=20), InventarioSede(id_sede=2, id_producto='P1', stock_actual=3), ChecklistPedido(id_pedido=1, id_sede=2, id_turno='NA', id_usuario='chef', fecha=datetime(2026,10,15), estado_general='Finalizado')])
            db.session.flush()
            db.session.add(DetallePedido(id_detalle=1, id_pedido=1, id_usuario='chef', id_producto='P1', cantidad_pedida=2, cantidad_entregada=2))
            db.session.commit()
        self.general, self.chef, self.warehouse = [self.client(owner) for owner in ('general','chef','warehouse')]

    def client(self, owner):
        client = self.app.test_client()
        with client.session_transaction() as session:
            session.update(_user_id=owner, _fresh=True, _csrf_token='token', app_date='2026-10-15')
        return client

    def post(self, client, url, data, operation=None):
        headers = {'X-CSRFToken':'token', 'X-Requested-With':'XMLHttpRequest'}
        if operation: headers['X-Operation-ID'] = operation
        return client.post(url, data=data, headers=headers)

    def test_final_checklist_admin_edit_and_idempotent_retry(self):
        page = self.general.get('/checklist?pedido_id=1&tab=list').get_data(as_text=True)
        self.assertIn('qty-counter-form', page)
        data = dict(action='qty_set', id_detalle='1', pedido_id='1', cantidad_pedida='7', expected_qty='2')
        self.assertEqual(self.post(self.general, '/checklist?pedido_id=1', data, 'one').status_code, 204)
        self.assertEqual(self.post(self.general, '/checklist?pedido_id=1', data, 'one').status_code, 204)
        with self.app.app_context():
            self.assertEqual(db.session.get(DetallePedido,1).cantidad_pedida, 7)
            self.assertEqual(db.session.get(ChecklistPedido,1).estado_general,'Finalizado')
            self.assertEqual(OperacionLocal.query.count(),1)

    def test_conflicting_quantity_stops_sync_without_receipt(self):
        data = dict(action='qty_set', id_detalle='1', pedido_id='1', cantidad_pedida='7', expected_qty='5')
        self.assertEqual(self.post(self.general,'/checklist?pedido_id=1',data,'conflict').status_code,409)
        with self.app.app_context():
            self.assertEqual(db.session.get(DetallePedido,1).cantidad_pedida,2)
            self.assertEqual(OperacionLocal.query.count(),0)

    def test_csrf_is_required_for_upload_and_session_refresh(self):
        self.assertEqual(self.chef.get('/api/session/csrf').json,dict(token='token',user='chef'))
        invalid = self.chef.post('/checklist', data={'action':'import_template', 'template_file':(io.BytesIO(b'[]'),'template.json')}, headers={'X-Requested-With':'XMLHttpRequest'})
        self.assertEqual(invalid.status_code,403)
        valid = self.chef.post('/checklist', data={'action':'import_template', 'csrf_token':'token', 'template_file':(io.BytesIO(b'["P1"]'),'template.json')})
        self.assertEqual(valid.status_code,302)
        self.assertIn('name="csrf_token"',self.chef.get('/checklist?tab=edit').get_data(as_text=True))

    def test_inventory_rows_are_scoped_and_catalog_keeps_site_stock(self):
        from app import _inventory_query_for_user, _get_checklist_catalog
        with self.app.test_request_context('/inventario'):
            user = db.session.get(Usuario,'warehouse')
            self.assertEqual(len(_inventory_query_for_user(user).all()),1)
            self.assertEqual({p.id_producto for p in _get_checklist_catalog(user)}, {'P1','P2'})
        data=dict(action='upsert_product',id_producto='P1',nombre_producto='Arroz integral', unidad='kg',area='cocina',id_area='Abarrotes',stock_actual='25',id_sede='1')
        self.assertEqual(self.post(self.warehouse,'/inventario',data).status_code,200)
        with self.app.app_context():
            self.assertEqual(db.session.get(Producto,'P1').nombre_producto,'Arroz integral')
            self.assertEqual(db.session.get(InventarioSede,(2,'P1')).stock_actual,3)
            self.assertIsNotNone(db.session.get(InventarioSede,(2,'P2')))

    def test_retiring_product_preserves_history_and_removes_catalog(self):
        self.post(self.warehouse,'/inventario',dict(action='delete_product',id_producto='P1'))
        from app import _get_checklist_catalog
        with self.app.app_context():
            self.assertEqual(db.session.get(Producto,'P1').estado,'Inactivo')
            self.assertIsNotNone(db.session.get(DetallePedido,1))
            self.assertEqual(db.session.get(InventarioSede,(2,'P1')).stock_actual,3)
            self.assertNotIn('P1',{p.id_producto for p in _get_checklist_catalog(db.session.get(Usuario,'chef'))})

    def test_general_admin_is_the_only_warehouse_cash_exception(self):
        self.assertEqual(self.general.get('/arqueo?sede=1&turno=NA').status_code,200)
        self.assertEqual(self.general.get('/arqueo?sede=2&turno=NA').status_code,200)
        saved = self.general.post('/arqueo?sede=1&turno=NA', json={'fields': {'monto_inicial': '100'}}, headers={'X-CSRFToken': 'token'})
        self.assertEqual(saved.status_code,200)
        self.assertTrue(saved.json['ok'])
        with self.app.app_context():
            db.session.add(PermisoRol(id_rol=3, modulo='arqueo', lectura=True, escritura=True))
            db.session.commit()
            self.assertFalse(db.session.get(Usuario,'warehouse').can_view('arqueo'))
        self.assertNotEqual(self.warehouse.get('/arqueo').status_code,200)

    def test_permission_matrix_and_area_assignment(self):
        self.assertEqual(self.general.get('/admin/permisos').status_code,200)
        self.assertEqual(self.post(self.general,'/admin/permisos',dict(action='role',nombre='Supervisor')).status_code,200)
        with self.app.app_context(): role_id = Rol.query.filter_by(nombre_rol='supervisor').one().id_rol
        self.assertEqual(self.post(self.general,'/admin/permisos',dict(action='matrix',id_rol=str(role_id),checklist_write='on')).status_code,200)
        self.post(self.general,'/admin/permisos',dict(action='area',id_sede='2',nombre='Preparación'))
        with self.app.app_context():
            area_id=AreaSede.query.one().id_area
            permission=db.session.get(PermisoRol,(role_id,'checklist'))
            self.assertTrue(permission.lectura and permission.escritura)
        self.post(self.general,'/admin/permisos',dict(action='area_roles',id_sede='2',id_area=str(area_id),roles=[str(role_id)]))
        with self.app.app_context(): self.assertIsNotNone(db.session.get(AreaSedeRol,(2,area_id,role_id)))
        self.assertEqual(self.chef.get('/admin/permisos').status_code,403)

    def test_print_selected_items_and_request_metadata(self):
        response=self.warehouse.get('/pedidos/1/imprimir?selected=1')
        self.assertEqual(response.status_code,200)
        page=response.get_data(as_text=True)
        self.assertIn('Arroz',page)
        self.assertIn('cocinero',page)
        self.assertIn('Destino: Cocina',page)

    def test_inventory_query_budget_is_independent_of_catalog_sizes(self):
        from database import Categoria, Unidad
        from sqlalchemy import event
        with self.app.app_context():
            db.session.add_all([Categoria(nombre_categoria=f'C{i}') for i in range(80)])
            db.session.add_all([Unidad(nombre_unidad=f'U{i}') for i in range(80)])
            db.session.commit()
            engine = db.engine
        statements = []
        def capture(conn, cursor, sql, params, context, many):
            statements.append(sql.lower())
        event.listen(engine, 'before_cursor_execute', capture)
        try:
            response = self.warehouse.get('/inventario')
            self.assertEqual(response.status_code, 200)
            self.assertLess(response.data.count(b'<option'), 400, 'Hidden editors must not duplicate entire catalogs')
        finally:
            event.remove(engine, 'before_cursor_execute', capture)
        self.assertLessEqual(len(statements), 15)
        self.assertFalse(any(sql.lstrip().startswith(('insert', 'update', 'delete')) for sql in statements))

    def test_quantity_taps_do_not_load_catalog_or_templates(self):
        from sqlalchemy import event
        with self.app.app_context(): engine = db.engine
        statements = []
        def capture(conn, cursor, sql, params, context, many): statements.append(sql.lower())
        event.listen(engine, 'before_cursor_execute', capture)
        try:
            response = self.post(self.general, '/checklist?pedido_id=1', dict(action='qty_set', id_detalle='1', cantidad_pedida='5'), 'fast-write')
        finally:
            event.remove(engine, 'before_cursor_execute', capture)
        self.assertEqual(response.status_code, 204)
        self.assertLessEqual(len(statements), 12)
        self.assertFalse(any('plantilla_checklist' in sql or 'categorias' in sql for sql in statements))

    def test_sse_releases_worker_and_keeps_cursor_and_scope(self):
        from database import EventoSistema
        with self.app.app_context():
            db.session.add_all([EventoSistema(modulo='checklist',id_sede=2,id_usuario='general',origen='other-device'), EventoSistema(modulo='checklist',id_sede=1,id_usuario='general',origen='private-device')])
            db.session.commit()
        response = self.chef.get('/api/events?after=0')
        self.assertEqual(response.status_code,200)
        self.assertIsNotNone(response.content_length, 'SSE must be a finite, already-built response')
        text = response.get_data(as_text=True)
        self.assertIn('other-device',text)
        self.assertNotIn('private-device',text)
        self.assertIn('event: cursor',text)

    def test_static_assets_do_not_authenticate_or_query_database(self):
        from sqlalchemy import event
        with self.app.app_context(): engine = db.engine
        statements=[]
        def capture(*args): statements.append(args[2])
        event.listen(engine,'before_cursor_execute',capture)
        try: response=self.warehouse.get('/static/js/local-first.js')
        finally: event.remove(engine,'before_cursor_execute',capture)
        self.assertEqual(response.status_code,200)
        self.assertEqual(statements,[])
        self.assertIn('public', response.headers['Cache-Control'])
        response.close()

    def test_movimientos_with_existing_rows_for_every_authorized_role(self):
        from database import MovimientoInventario
        with self.app.app_context():
            db.session.add_all([
                Rol(id_rol=4,nombre_rol='personal_prod'),
                Usuario(id_usuario='production',username='production',password_hash='x',id_rol=4,id_sede=1,id_turno='NA'),
                MovimientoInventario(id_sede=1,id_producto='P1',id_usuario='warehouse',cantidad=1,tipo='ENTRADA',motivo='Prueba de acceso',fecha=datetime(2026,10,15,17,30)),
                MovimientoInventario(id_sede=2,id_producto='P1',id_usuario='chef',cantidad=1,tipo='ENTRADA',motivo='Otra sede',fecha=datetime(2026,10,15,17,30)),
            ])
            db.session.commit()
        for owner in ('general','warehouse','production'):
            with self.subTest(role=owner):
                response=self.client(owner).get('/movimientos')
                self.assertEqual(response.status_code,200)
                text=response.get_data(as_text=True)
                self.assertIn('15/10/2026 12:30',text)
                self.assertIn('Prueba de acceso',text)
                if owner != 'general': self.assertNotIn('Otra sede',text)
