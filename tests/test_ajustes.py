import os
import unittest
from datetime import date
from unittest.mock import patch

from sqlalchemy import text
from werkzeug.security import check_password_hash, generate_password_hash

from database import (
    db, Sede, Rol, Turno, Usuario, Producto, ChecklistPedido, DetallePedido,
    PlantillaChecklistItem, MovimientoInventario, ArqueoCaja, ArqueoCajaHistorial,
    Merma, Incidencia, AgendaAuditoria, AgendaPersistencia,
)


class TestAjustes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # La URL se fija antes de importar app: el modulo inicializa la BD al importar.
        with patch.dict(os.environ, DATABASE_URL='sqlite:///:memory:', SECRET_KEY='test-ajustes'):
            from app import create_app
            cls.app = create_app()
        cls.app.config['TESTING'] = True
        with cls.app.app_context():
            db.session.execute(text('PRAGMA foreign_keys=ON'))
            db.session.commit()

    def setUp(self):
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            db.session.add_all([
                Rol(id_rol=1, nombre_rol='admin_general'),
                Rol(id_rol=2, nombre_rol='admin_sala'),
                Sede(id_sede=1, nombre_sede='Sede real'),
                Sede(id_sede=2, nombre_sede='Otra sede'),
                Turno(id_turno='NA', nombre_turno='N/A'),
                Turno(id_turno='NOCHE', nombre_turno='Noche'),
            ])
            db.session.flush()
            self.password_hash = generate_password_hash('original')
            db.session.add_all([
                Usuario(id_usuario='admin', username='admin', password_hash='unused',
                        id_rol=1, id_sede=1, id_turno='NA'),
                Usuario(id_usuario='empleado', username='empleado', password_hash=self.password_hash,
                        id_rol=2, id_sede=1, id_turno='NA', dni='12345678',
                        fecha_nacimiento=date(1990, 1, 2), email='ejemplo@example.test',
                        telefono='999999999', direccion='Direccion de prueba', bio='Perfil de prueba'),
            ])
            db.session.commit()
        self.client = self.app.test_client()
        with self.client.session_transaction() as session:
            session['_user_id'] = 'admin'
            session['_fresh'] = True
            session['_csrf_token'] = 'test-token'

    def post_update(self, **overrides):
        data = dict(tipo_form='update_usuario', old_id_usuario='empleado',
                    id_usuario='empleado', username='empleado', password='',
                    id_rol='2', id_sede='1', id_turno='NA', csrf_token='test-token')
        data.update(overrides)
        return self.client.post('/admin/ajustes', data=data)

    def test_update_without_changing_id(self):
        response = self.post_update(username='editado', id_rol='1', id_sede='2', id_turno='NOCHE')
        self.assertEqual(response.status_code, 302)
        with self.app.app_context():
            user = db.session.get(Usuario, 'empleado')
            self.assertEqual((user.username, user.id_rol, user.id_sede, user.id_turno),
                             ('editado', 1, 2, 'NOCHE'))
            self.assertEqual(user.password_hash, self.password_hash)

    def test_change_password(self):
        self.post_update(password='nueva-password')
        with self.app.app_context():
            self.assertTrue(check_password_hash(db.session.get(Usuario, 'empleado').password_hash,
                                                'nueva-password'))

    def test_rename_preserves_profile_and_all_foreign_keys(self):
        with self.app.app_context():
            user = db.session.get(Usuario, 'empleado')
            before = {c.name: getattr(user, c.name) for c in Usuario.__table__.columns}
            db.session.add(Producto(id_producto='P1', nombre_producto='Producto'))
            db.session.flush()
            pedido = ChecklistPedido(id_usuario='empleado', id_sede=1, id_turno='NA')
            arqueo = ArqueoCaja(id_usuario='empleado', id_sede=1, id_turno='NA')
            db.session.add_all([pedido, arqueo])
            db.session.flush()
            db.session.add_all([
                DetallePedido(id_pedido=pedido.id_pedido, id_usuario='empleado', id_producto='P1', cantidad_pedida=1),
                PlantillaChecklistItem(id_usuario='empleado', id_sede=1, id_turno='NA', id_producto='P1'),
                MovimientoInventario(id_usuario='empleado', id_sede=1, id_producto='P1', cantidad=1),
                ArqueoCajaHistorial(id_arqueo=arqueo.id_arqueo, usuario_id='empleado', accion='prueba'),
                Merma(id_usuario='empleado', id_sede=1, id_producto='P1', mes='2026-09', turno='NA',
                      area='cocina', tipo_merma='prueba', cantidad=1, unidad='kg', responsable='empleado'),
                Incidencia(id_usuario='empleado', id_sede=1, mes='2026-09', incidencia='prueba',
                           responsable='empleado', encargado='admin'),
                AgendaAuditoria(id_usuario='empleado', accion='prueba', entidad='prueba'),
                AgendaPersistencia(actualizado_por='empleado'),
            ])
            db.session.commit()
        response = self.post_update(id_usuario='nuevo-id')
        self.assertEqual(response.status_code, 302)
        with self.app.app_context():
            self.assertIsNone(db.session.get(Usuario, 'empleado'))
            user = db.session.get(Usuario, 'nuevo-id')
            before['id_usuario'] = 'nuevo-id'
            self.assertEqual({c.name: getattr(user, c.name) for c in Usuario.__table__.columns}, before)
            for table in db.metadata.sorted_tables:
                for fk in table.foreign_keys:
                    if fk.target_fullname == 'usuarios.id_usuario':
                        values = db.session.execute(db.select(fk.parent)).scalars().all()
                        self.assertEqual(values, ['nuevo-id'], table.name)

    def test_rename_current_admin_keeps_session(self):
        self.post_update(old_id_usuario='admin', id_usuario='admin-nuevo', username='admin', id_rol='1')
        with self.client.session_transaction() as session:
            self.assertEqual(session['_user_id'], 'admin-nuevo')
        self.assertEqual(self.client.get('/admin/ajustes').status_code, 200)

    def test_duplicate_id_or_username_does_not_modify_user(self):
        for changes in ({'id_usuario': 'admin'}, {'username': 'ADMIN'}):
            with self.subTest(changes=changes):
                self.assertEqual(self.post_update(**changes).status_code, 302)
                with self.app.app_context():
                    self.assertEqual(db.session.get(Usuario, 'empleado').username, 'empleado')

    def test_invalid_assignments_do_not_modify_user(self):
        for changes in ({'id_rol': ''}, {'id_sede': '999'}, {'id_turno': 'missing'}):
            with self.subTest(changes=changes):
                self.assertEqual(self.post_update(username='editado', **changes).status_code, 302)
                with self.app.app_context():
                    self.assertEqual(db.session.get(Usuario, 'empleado').username, 'empleado')

    def test_failed_rename_rolls_back_every_change(self):
        with self.app.app_context():
            db.session.execute(text("""CREATE TRIGGER reject_user_delete BEFORE DELETE ON usuarios
                BEGIN SELECT RAISE(ABORT, 'forced failure'); END"""))
            db.session.commit()
        with self.assertLogs(self.app.logger, level='ERROR'):
            response = self.post_update(id_usuario='nuevo-id', username='editado')
        self.assertEqual(response.status_code, 302)
        with self.app.app_context():
            self.assertIsNone(db.session.get(Usuario, 'nuevo-id'))
            self.assertEqual(db.session.get(Usuario, 'empleado').username, 'empleado')
        with self.client.session_transaction() as session:
            self.assertFalse(any(category == 'ok' for category, _ in session.get('_flashes', [])))

    def test_repeated_seed_preserves_existing_sedes(self):
        from app import _seed_catalogs
        with self.app.app_context():
            for _ in range(2):
                _seed_catalogs()
            self.assertEqual([s.nombre_sede for s in Sede.query.order_by(Sede.id_sede)],
                             ['Sede real', 'Otra sede'])

    def test_empty_database_seeds_only_almacen(self):
        from app import _seed_catalogs
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            _seed_catalogs()
            _seed_catalogs()
            self.assertEqual([s.nombre_sede for s in Sede.query.all()], ['Almacen'])
            self.assertIsNotNone(Usuario.query.filter_by(username='admin').first())

    def test_edit_form_contains_csrf_token(self):
        from html.parser import HTMLParser

        class Forms(HTMLParser):
            def __init__(self):
                super().__init__()
                self.forms = []
                self.current = None

            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'form':
                    self.current = {}
                elif tag == 'input' and self.current is not None:
                    self.current[attrs.get('name')] = attrs.get('value', '')

            def handle_endtag(self, tag):
                if tag == 'form' and self.current is not None:
                    self.forms.append(self.current)
                    self.current = None

        parser = Forms()
        parser.feed(self.client.get('/admin/ajustes').get_data(as_text=True))
        edits = [f for f in parser.forms if f.get('tipo_form') == 'update_usuario']
        self.assertEqual(len(edits), 2)
        for form in edits:
            self.assertEqual(form.get('csrf_token'), 'test-token')


if __name__ == '__main__':
    unittest.main()
