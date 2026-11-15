"""
Settings for the daily static-data ETL job (GitHub Actions).

Uses a throwaway SQLite database: state is rebuilt from the exported JSON in
frontend/public/data via `import_static`, so nothing needs to be persisted
between runs except those JSON files.
"""
import os

from .base import *  # noqa: F401,F403

DEBUG = False
ALLOWED_HOSTS = ["localhost"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("ETL_DB_PATH", "/tmp/smarteats-etl.sqlite3"),
    }
}
