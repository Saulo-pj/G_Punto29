def database_uri(value):
    """Select the PostgreSQL driver installed in requirements.txt."""
    if not value or not value.strip():
        return 'sqlite:///mi_app.db'
    value = value.strip()
    scheme, separator, address = value.partition('://')
    if separator and scheme in {'postgres', 'postgresql', 'postgresql+psycopg2'}:
        return 'postgresql+psycopg://' + address
    return value
