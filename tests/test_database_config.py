import unittest

from database_config import database_uri


class TestDatabaseConfig(unittest.TestCase):
    def test_postgres_uses_installed_driver_and_preserves_credentials(self):
        address = 'user:p%40ss@postgres.railway.internal:5432/railway?sslmode=require'
        for scheme in ('postgres', 'postgresql', 'postgresql+psycopg2', 'postgresql+psycopg'):
            with self.subTest(scheme=scheme):
                self.assertEqual(database_uri(scheme + '://' + address),
                                 'postgresql+psycopg://' + address)

    def test_local_fallback(self):
        for value in (None, '', '  '):
            self.assertEqual(database_uri(value), 'sqlite:///mi_app.db')

    def test_sqlite_unchanged(self):
        self.assertEqual(database_uri('sqlite:///:memory:'), 'sqlite:///:memory:')

    def test_postgres_engine_loads_driver_without_connecting(self):
        from sqlalchemy import create_engine
        for scheme in ('postgres', 'postgresql', 'postgresql+psycopg2', 'postgresql+psycopg'):
            with self.subTest(scheme=scheme):
                engine = create_engine(database_uri(scheme + '://user:pass@localhost/test'))
                self.assertEqual(engine.dialect.driver, 'psycopg')
                engine.dispose()


class TestHealth(unittest.TestCase):
    def test_health_checks_database_without_login(self):
        from app import app
        response = app.test_client().get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {'ok': True})

    def test_database_failure_returns_503_without_exposing_details(self):
        from unittest.mock import patch
        from app import app, db
        with patch.object(db.session, 'execute', side_effect=RuntimeError('private details')):
            with patch.object(db.session, 'rollback') as rollback:
                response = app.test_client().get('/health')
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json, {'ok': False})
                rollback.assert_called_once()


if __name__ == '__main__':
    unittest.main()
