import os
import unittest
import subprocess
from pathlib import Path
from datetime import datetime
from unittest.mock import patch

from sqlalchemy import Integer, event
from sqlalchemy.orm import Session
from sqlalchemy.sql import visitors
from sqlalchemy.sql.elements import BinaryExpression, BindParameter


class TestPostgresFormIds(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, DATABASE_URL='sqlite:///:memory:', SECRET_KEY='test-form-ids'):
            from app import create_app
            cls.app = create_app()
        cls.app.config['TESTING'] = True

    def setUp(self):
        from app import db, _seed_catalogs
        from database import Rol, Sede, Usuario, Producto, ChecklistPedido, DetallePedido, InventarioSede
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            _seed_catalogs()
            sede = Sede.query.first()
            self.sede_id = sede.id_sede
            role = Rol.query.filter_by(nombre_rol='admin_sala').one()
            db.session.add(Usuario(id_usuario='sala', username='sala', password_hash='unused',
                                   id_rol=role.id_rol, id_sede=sede.id_sede, id_turno='MANANA'))
            db.session.add(Producto(id_producto='BOLSA', nombre_producto='Bolsa', area='sala',
                                    unidad='unidad', estado='Activo'))
            db.session.flush()
            db.session.add(InventarioSede(id_sede=sede.id_sede, id_producto='BOLSA', stock_actual=20))
            db.session.add(ChecklistPedido(id_pedido=42, id_sede=sede.id_sede, id_turno='MANANA',
                                           id_usuario='sala', fecha=datetime(2026, 10, 12, 12),
                                           estado_general='Borrador'))
            db.session.flush()
            db.session.add(DetallePedido(id_detalle=777, id_pedido=42, id_usuario='sala',
                                         id_producto='BOLSA', cantidad_pedida=0, cantidad_entregada=0))
            db.session.commit()
        self.client = self.app.test_client()
        self.login('sala')
        event.listen(Session, 'do_orm_execute', self.reject_integer_text_comparisons)
        self.addCleanup(event.remove, Session, 'do_orm_execute', self.reject_integer_text_comparisons)

    @staticmethod
    def reject_integer_text_comparisons(state):
        # SQLite accepts integer = text; PostgreSQL with psycopg 3 rejects it.
        # Inspect actual route queries so SQLite cannot hide this regression.
        for expression in visitors.iterate(state.statement):
            if isinstance(expression, BinaryExpression):
                for column, bound in ((expression.left, expression.right),
                                      (expression.right, expression.left)):
                    if isinstance(column.type, Integer) and isinstance(bound, BindParameter):
                        if isinstance(bound.value, str):
                            raise AssertionError(f'Integer compared with text: {expression}')

    def login(self, user):
        with self.client.session_transaction() as session:
            session['_user_id'] = user
            session['_fresh'] = True
            session['_csrf_token'] = 'token'
            session['app_date'] = '2026-10-12'

    def post(self, route, action, **values):
        return self.client.post(route, data=dict(csrf_token='token', action=action, **values),
                                headers={'X-Requested-With': 'XMLHttpRequest'})

    def detail_quantity(self):
        from app import db
        from database import DetallePedido
        with self.app.app_context():
            return db.session.get(DetallePedido, 777).cantidad_pedida

    def test_checklist_quantity_actions_persist(self):
        for action, extra, expected in (
            ('qty_plus', {}, 1), ('qty_plus', {}, 2), ('qty_minus', {}, 1),
            ('qty_set', {'cantidad_pedida': '5'}, 5), ('qty_clear', {}, 0),
        ):
            with self.subTest(action=action, expected=expected):
                response = self.post('/checklist', action, id_detalle='777', **extra)
                self.assertEqual(response.status_code, 204)
                self.assertEqual(self.detail_quantity(), expected)

    def test_invalid_ids_return_400_without_modifying_quantity(self):
        for value in ('', 'abc', '1.5', '-1', '0', '2147483648', '999999999999999999999'):
            with self.subTest(value=value):
                response = self.post('/checklist', 'qty_plus', id_detalle=value)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(self.detail_quantity(), 0)

    def test_other_user_detail_cannot_be_modified(self):
        from app import db
        from database import DetallePedido
        with self.app.app_context():
            db.session.add(DetallePedido(id_detalle=778, id_pedido=42, id_usuario='admin',
                                         id_producto='BOLSA', cantidad_pedida=3))
            db.session.commit()
        self.assertEqual(self.post('/checklist', 'qty_plus', id_detalle='778').status_code, 204)
        with self.app.app_context():
            self.assertEqual(db.session.get(DetallePedido, 778).cantidad_pedida, 3)

    def test_checklist_remove_uses_integer_id(self):
        from app import db
        from database import DetallePedido
        self.assertEqual(self.post('/checklist', 'remove_item', id_detalle='777').status_code, 204)
        with self.app.app_context():
            self.assertIsNone(db.session.get(DetallePedido, 777))

    def test_dispatch_and_reception_persist_inventory(self):
        from app import db
        from database import DetallePedido, InventarioSede
        self.assertEqual(self.post('/checklist', 'qty_set', id_detalle='777', cantidad_pedida='2').status_code, 204)
        self.login('admin')
        response = self.post('/pedidos', 'save_dispatch_line', id_detalle='777', pedido_id='42',
                             cantidad_entregada='2', enviar_linea='on')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.post('/pedidos', 'mark_sent', id_pedido='42').status_code, 204)
        self.login('sala')
        self.assertEqual(self.post('/checklist', 'confirm_item', id_detalle='777').status_code, 204)
        with self.app.app_context():
            self.assertEqual(db.session.get(DetallePedido, 777).estado_sede, 'Recibido')
            self.assertEqual(db.session.get(InventarioSede, (self.sede_id, 'BOLSA')).stock_actual, 20)

    def test_delete_requested_order_uses_integer_id(self):
        from app import db
        from database import ChecklistPedido
        self.login('admin')
        self.assertEqual(self.post('/pedidos', 'delete_requested_order', id_pedido='42').status_code, 204)
        with self.app.app_context():
            self.assertIsNone(db.session.get(ChecklistPedido, 42))

    def test_pedidos_rejects_malformed_ids(self):
        self.login('admin')
        for action, field in (('mark_sent', 'id_pedido'), ('save_dispatch_line', 'id_detalle'),
                              ('delete_requested_order', 'id_pedido')):
            with self.subTest(action=action):
                self.assertEqual(self.post('/pedidos', action, **{field: 'invalid'}).status_code, 400)

    def test_client_does_not_replay_failed_post_or_accept_login_redirect(self):
        result = subprocess.run(['node', str(Path(__file__).with_name('checklist_save_test.js'))],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
