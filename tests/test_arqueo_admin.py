import json
import os
import re
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from database import db, Rol, Sede, Turno, Usuario, ArqueoCaja


class TestArqueoAdmin(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, DATABASE_URL='sqlite:///:memory:', SECRET_KEY='test-arqueo'):
            from app import create_app
            cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.template = (Path(__file__).resolve().parents[1] / 'templates/dashboard/arqueo_caja.html').read_text(encoding='utf-8')

    def setUp(self):
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            db.session.add_all([
                Rol(id_rol=1, nombre_rol='admin_general'), Rol(id_rol=2, nombre_rol='admin_sala'),
                Sede(id_sede=1, nombre_sede='Almacen'), Sede(id_sede=2, nombre_sede='Restaurante'),
                Turno(id_turno='NA', nombre_turno='N/A'), Turno(id_turno='NOCHE', nombre_turno='Noche'),
            ])
            db.session.flush()
            db.session.add_all([
                Usuario(id_usuario='general', username='general', password_hash='unused', id_rol=1, id_sede=1, id_turno='NA'),
                Usuario(id_usuario='sala', username='sala', password_hash='unused', id_rol=2, id_sede=2, id_turno='NOCHE'),
            ])
            db.session.commit()
        self.general = self.client_for('general')
        self.sala = self.client_for('sala')

    def client_for(self, user):
        client = self.app.test_client()
        with client.session_transaction() as session:
            session.update(_user_id=user, _fresh=True, _csrf_token='test-token', app_date='2026-09-16')
        return client

    def save(self, client, url, fields):
        response = client.post(url, json={'fields': fields, 'event': 'GUARDADO_MANUAL'}, headers={'X-CSRFToken': 'test-token'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['ok'])
        return response.json

    def test_admin_saves_rendered_url_to_same_closure_and_history(self):
        initial = self.save(self.sala, '/arqueo', {
            'monto_inicial': '100', 'pos_tarjetas': '200', 'yape': '30', 'plin': '40',
            'efectivo': '500', 'venta_sistema': '670', 'efectivo_entregado': '400',
            'efectivo_dejado_caja_real': '100', 'observaciones': 'Cierre sala',
            'gastos': [{'id': 'g1', 'tipo': 'Comida', 'nombre': 'Cena', 'monto': '20'}],
        })
        url = '/arqueo?sede=2&turno=NOCHE'
        page = self.general.get(url).get_data(as_text=True)
        # Usar la URL literal que recibe JavaScript: dentro de script NO se decodifica &amp;.
        literal = re.search(r'return fetch\((.+?), \{', page).group(1)
        fetch_url = json.loads(literal) if literal.startswith('"') else literal[1:-1]
        edited = self.save(self.general, fetch_url, {
            'monto_inicial': '90', 'pos_tarjetas': '210', 'yape': '31', 'plin': '41',
            'efectivo': '510', 'venta_sistema': '702', 'efectivo_entregado': '410',
            'efectivo_dejado_caja_real': '95', 'observaciones': '', 'gastos': [],
        })
        with self.app.app_context():
            self.assertEqual(ArqueoCaja.query.count(), 1, 'El administrador creo otro cierre/turno')
            cierre = ArqueoCaja.query.one()
            self.assertEqual((cierre.id_sede, cierre.id_turno, cierre.id_usuario), (2, 'NOCHE', 'sala'))
            for name, value in dict(monto_inicial=90, pos_tarjetas=210, yape=31, plin=41,
                                    efectivo=510, venta_sistema=702, efectivo_entregado=410,
                                    efectivo_dejado_caja_real=95).items():
                self.assertEqual(getattr(cierre, name), value, name)
            self.assertEqual(cierre.observaciones, '')
            self.assertEqual(json.loads(cierre.gastos_json), [])
        self.assertTrue({log['id'] for log in initial['logs']} <= {log['id'] for log in edited['logs']})
        self.assertEqual({log['usuario_id'] for log in edited['logs']}, {'general', 'sala'})
        general_page = self.general.get(url).get_data(as_text=True)
        sala_page = self.sala.get('/arqueo').get_data(as_text=True)
        for page in (general_page, sala_page):
            self.assertRegex(page, r'name="pos_tarjetas" value="210\.00"')
            self.assertRegex(page, r'name="efectivo_dejado_caja_real" value="95\.00"')
        def history(page):
            return re.search(r'<tbody id="historial-auditoria-body">(.*?)</tbody>', page, re.S).group(1)
        self.assertEqual(history(general_page), history(sala_page))
        # Sala conserva sus restricciones incluso despues de la correccion del administrador.
        self.save(self.sala, '/arqueo', {'pos_tarjetas': '999', 'efectivo_dejado_caja_real': '999'})
        with self.app.app_context():
            self.assertEqual(ArqueoCaja.query.one().pos_tarjetas, 210)
            self.assertEqual(ArqueoCaja.query.one().efectivo_dejado_caja_real, 95)

    def run_js(self, script):
        result = subprocess.run(['node', '-'], input=script, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_cash_sections_respect_each_role_at_every_stage(self):
        function = self.template.split('function lockSavedFields(fields) {', 1)[1].split('function updateGastosState', 1)[0]
        self.run_js("""
            const assert = require('node:assert/strict');
            let isAdminGeneral, auditEnabled, efectivoEntregadoGuardado, efectivoDejadoGuardado;
            let ventaSistemaGuardada = false, lockedFields = new Set();
            const delivered = {disabled: false}, left = {disabled: false};
            const list = {querySelectorAll: () => []}, addBtn = {};
            function setFieldLocked(name) { lockedFields.add(name); }
            function section(element) {
                return {closest: () => ({closest: () => null, querySelectorAll: () => [element]})};
            }
            const document = {
                querySelectorAll: () => [],
                querySelector: selector => section(selector.includes('efectivo_entregado') ? delivered : left)
            };
            function lockSavedFields(fields) {""" + function + """
            for (const admin of [false, true]) {
                for (const audit of [false, true]) {
                    for (const given of [false, true]) {
                        for (const closed of [false, true]) {
                            for (const locked of [false, true]) {
                                isAdminGeneral = admin; auditEnabled = audit;
                                efectivoEntregadoGuardado = given; efectivoDejadoGuardado = closed;
                                lockedFields = new Set(locked ? ['efectivo_entregado'] : []);
                                lockSavedFields([]);
                                const state = JSON.stringify({admin, audit, given, closed, locked});
                                assert.equal(delivered.disabled, !admin && (!audit || locked), state);
                                assert.equal(left.disabled, !admin && (!given || closed), state);
                            }
                        }
                    }
                }
            }
        """)

    def test_admin_can_send_empty_observations_without_changing_sala(self):
        function = self.template.split('function collectChangedFields() {', 1)[1].split('function saveChanged', 1)[0]
        self.run_js("""
            const assert = require('node:assert/strict');
            let isAdminGeneral = true;
            const dirtyFields = new Set(['observaciones']);
            const document = {querySelector: () => ({value: '', disabled: false})};
            function collectChangedFields() {""" + function + """
            assert.deepEqual(collectChangedFields(), {observaciones: ''});
            isAdminGeneral = false;
            assert.deepEqual(collectChangedFields(), {});
        """)

    def test_rendered_javascript_syntax_for_both_roles(self):
        for client in (self.general, self.sala):
            page = client.get('/arqueo?sede=2&turno=NOCHE').get_data(as_text=True)
            for script in re.findall(r'<script>(.*?)</script>', page, re.S):
                result = subprocess.run(['node', '--check', '-'], input=script, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
