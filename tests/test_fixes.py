import os
import json
import unittest
import subprocess
from datetime import date
from sqlalchemy.exc import IntegrityError


class TestJsSyntax(unittest.TestCase):
    """Verifica que node --check pase para todos los JS del proyecto."""

    def test_js_syntax_validity(self):
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        failed = []
        for root, dirs, files in os.walk(project_root):
            dirs[:] = [d for d in dirs if d not in ('.venv', 'node_modules', '.git', '__pycache__')]
            for file in files:
                if file.endswith('.js'):
                    path = os.path.join(root, file)
                    res = subprocess.run(['node', '--check', path], capture_output=True, text=True)
                    if res.returncode != 0:
                        failed.append(f"{path}:\n{res.stderr.strip()}")
        self.assertEqual(failed, [], "Archivos JS con error de sintaxis:\n" + "\n---\n".join(failed))


class TestArqueoFixes(unittest.TestCase):
    """Pruebas de lógica de Arqueo de Caja."""

    @classmethod
    def setUpClass(cls):
        os.environ.setdefault('SECRET_KEY', 'test_secret_key_for_unit_testing_12345')
        from app import create_app, db as _db
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        cls.app.config['WTF_CSRF_ENABLED'] = False
        cls.db = _db
        cls.client = cls.app.test_client()
        with cls.app.app_context():
            _db.create_all()
            from database import Rol, Sede, Turno, Usuario

            def get_or_create(model, **kwargs):
                obj = _db.session.get(model, kwargs.get('id_rol') or kwargs.get('id_sede') or kwargs.get('id_turno'))
                if obj is None:
                    obj = model(**kwargs)
                    _db.session.add(obj)
                return obj

            get_or_create(Rol, id_rol=1, nombre_rol='admin_general')
            get_or_create(Rol, id_rol=2, nombre_rol='admin_sala')
            get_or_create(Sede, id_sede=1, nombre_sede='Sede Test', monto_inicial_base_esperado=100.0)
            get_or_create(Turno, id_turno='T1', nombre_turno='Turno Mañana')
            _db.session.flush()

            if not Usuario.query.filter_by(id_usuario='user_sala_1').first():
                _db.session.add(Usuario(
                    id_usuario='user_sala_1', username='sala1',
                    password_hash='dummy', id_rol=2, id_sede=1, id_turno='T1'
                ))
            if not Usuario.query.filter_by(id_usuario='user_admin_1').first():
                _db.session.add(Usuario(
                    id_usuario='user_admin_1', username='admin1',
                    password_hash='dummy', id_rol=1
                ))
            _db.session.commit()

    def setUp(self):
        self.ctx = self.app.app_context()
        self.ctx.push()

    def tearDown(self):
        from database import ArqueoCaja, ArqueoCajaHistorial
        self.db.session.rollback()
        ArqueoCajaHistorial.query.delete()
        ArqueoCaja.query.delete()
        self.db.session.commit()
        self.ctx.pop()

    def _make_cierre(self, user_id='user_sala_1'):
        from database import ArqueoCaja
        today = date.today()
        cierre = ArqueoCaja(id_sede=1, id_turno='T1', id_usuario=user_id, fecha=today)
        self.db.session.add(cierre)
        self.db.session.commit()
        return cierre

    def test_unique_constraint_prevents_duplicate_arqueo(self):
        from database import ArqueoCaja
        today = date.today()
        c1 = ArqueoCaja(id_sede=1, id_turno='T1', id_usuario='user_sala_1', fecha=today)
        self.db.session.add(c1)
        self.db.session.commit()
        c2 = ArqueoCaja(id_sede=1, id_turno='T1', id_usuario='user_sala_1', fecha=today)
        self.db.session.add(c2)
        with self.assertRaises(IntegrityError):
            self.db.session.commit()

    def test_empty_fields_not_locked_for_admin_sala(self):
        from database import Usuario
        from app import _process_arqueo_save
        user = Usuario.query.filter_by(id_usuario='user_sala_1').first()
        cierre = self._make_cierre()
        payload = {'fields': {'monto_inicial': '150.00', 'pos_tarjetas': '80.50', 'yape': '', 'efectivo': None}}
        res = _process_arqueo_save(cierre, payload, is_admin_general=False, current_user=user, target_sede_id=1)
        self.assertTrue(res['ok'])
        self.assertIn('monto_inicial', res['locked_fields'])
        self.assertIn('pos_tarjetas', res['locked_fields'])
        self.assertNotIn('yape', res['locked_fields'])
        self.assertNotIn('efectivo', res['locked_fields'])

    def test_admin_sala_cannot_modify_locked_field(self):
        from database import Usuario
        from app import _process_arqueo_save
        user = Usuario.query.filter_by(id_usuario='user_sala_1').first()
        cierre = self._make_cierre()
        _process_arqueo_save(cierre, {'fields': {'pos_tarjetas': '80.50'}}, False, user, 1)
        original = cierre.pos_tarjetas
        _process_arqueo_save(cierre, {'fields': {'pos_tarjetas': '999.00'}}, False, user, 1)
        self.assertEqual(cierre.pos_tarjetas, original, "Admin Sala no debería poder modificar campo bloqueado")

    def test_admin_sala_propina_only_increases(self):
        from database import Usuario
        from app import _process_arqueo_save
        user = Usuario.query.filter_by(id_usuario='user_sala_1').first()
        cierre = self._make_cierre()
        payload1 = {'fields': {'gastos': [
            {'id': 'g1', 'tipo': 'Propina', 'nombre': 'Propina', 'monto': '10.00'}
        ]}}
        _process_arqueo_save(cierre, payload1, False, user, 1)
        gastos = json.loads(cierre.gastos_json)
        self.assertEqual(gastos[0]['monto'], 10.0)

        # Intento de disminuir propina: debe ignorarse
        payload_down = {'fields': {'gastos': [
            {'id': 'g1', 'tipo': 'Propina', 'nombre': 'Propina', 'monto': '5.00', 'bloqueado': True}
        ]}}
        _process_arqueo_save(cierre, payload_down, False, user, 1)
        gastos_after = json.loads(cierre.gastos_json)
        self.assertEqual(gastos_after[0]['monto'], 10.0, "La propina no debe poder disminuirse")

        # Aumento válido de propina
        payload_up = {'fields': {'gastos': [
            {'id': 'g1', 'tipo': 'Propina', 'nombre': 'Propina', 'monto': '18.50', 'bloqueado': True}
        ]}}
        _process_arqueo_save(cierre, payload_up, False, user, 1)
        gastos_increased = json.loads(cierre.gastos_json)
        self.assertEqual(gastos_increased[0]['monto'], 18.50)

    def test_admin_general_full_edit_and_gasto_deletion(self):
        from database import Usuario, ArqueoCaja
        from app import _process_arqueo_save
        admin_user = Usuario.query.filter_by(id_usuario='user_admin_1').first()
        cierre = ArqueoCaja(
            id_sede=1, id_turno='T1', id_usuario=admin_user.id_usuario, fecha=date.today(),
            pos_tarjetas=50.0,
            campos_bloqueados_json=json.dumps(['pos_tarjetas']),
            gastos_json=json.dumps([
                {'id': 'gasto-1', 'tipo': 'Comida', 'nombre': 'Almuerzo', 'monto': 25.0, 'bloqueado': True},
                {'id': 'gasto-2', 'tipo': 'Propina', 'nombre': 'Propina', 'monto': 10.0, 'bloqueado': True}
            ])
        )
        self.db.session.add(cierre)
        self.db.session.commit()

        # Admin General cambia pos_tarjetas y borra gasto-1
        payload = {'fields': {
            'pos_tarjetas': '120.00',
            'gastos': [{'id': 'gasto-2', 'tipo': 'Propina', 'nombre': 'Propina', 'monto': '5.00'}]
        }}
        res = _process_arqueo_save(cierre, payload, is_admin_general=True, current_user=admin_user, target_sede_id=1)
        self.assertTrue(res['ok'])
        self.assertEqual(cierre.pos_tarjetas, 120.0)
        gastos = json.loads(cierre.gastos_json)
        self.assertEqual(len(gastos), 1)
        self.assertEqual(gastos[0]['id'], 'gasto-2')
        self.assertEqual(gastos[0]['monto'], 5.0)

    def test_csrf_blocks_unauthenticated_mutation(self):
        """POST sin token CSRF a ruta protegida debe retornar 302 (redir. al login) o 403."""
        # Sin sesión activa, Flask-Login redirige al login (302) antes de que CSRF actúe.
        res = self.client.post('/arqueo', data={'monto_inicial': '100'})
        self.assertIn(res.status_code, (302, 403), "Se esperaba 302 (redirección al login) o 403 (CSRF denegado)")

        # Con sesión activa pero sin token CSRF, el middleware debe devolver 403
        with self.client.session_transaction() as sess:
            sess['_user_id'] = 'user_sala_1'
            sess['_fresh'] = True
            sess['_csrf_token'] = 'test_token_xyz'

        res_with_session = self.client.post('/arqueo', data={'monto_inicial': '100'})
        # Sin token CSRF en los datos, debe retornar 403 o redireccionar al login
        self.assertIn(res_with_session.status_code, (302, 403), "Se esperaba 302 o 403 para POST sin token CSRF con sesión activa")


if __name__ == '__main__':
    unittest.main(verbosity=2)
