SmartEats/
├── backend/ # Django Project
└── frontend/ # React Project

1. **Backend Setup**
   -cd backend
   -python manage.py runserver --settings=SmartEats_config.settings.development

2. **Frontend Setup**
   -cd frontend
   -npm install
   -npm run dev

**development.py: Settings for local development (`DEBUG = True`).
**production.py: Settings for live deployment (`DEBUG = False`).
