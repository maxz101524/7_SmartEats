import os
import dj_database_url
from .base import *

DEBUG = False

ALLOWED_HOSTS = [
    os.environ.get('RENDER_EXTERNAL_HOSTNAME', ''),
    'localhost',
    '127.0.0.1',
]

DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MIDDLEWARE.insert(
    MIDDLEWARE.index('django.middleware.security.SecurityMiddleware') + 1,
    'whitenoise.middleware.WhiteNoiseMiddleware',
)

STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

FRONTEND_URL = os.environ.get('FRONTEND_URL', '')
CORS_ALLOWED_ORIGINS = [
    origin for origin in [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://vega.github.io",
        "https://smarteats7.vercel.app",
        FRONTEND_URL,
    ] if origin
]
CSRF_TRUSTED_ORIGINS = [
    origin for origin in [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        FRONTEND_URL,
    ] if origin
]