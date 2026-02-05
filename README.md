SmartEats/<br>
├── backend/ # Django Project<br>
└── frontend/ # React Project<br>

1. **Backend Setup**<br>
   -cd backend <br>
   -python manage.py runserver --settings=SmartEats_config.settings.development <br>

2. **Frontend Setup**<br>
   -cd frontend<br>
   -npm install<br>
   -npm run dev<br>

**development.py: Settings for local development (`DEBUG = True`).<br>
**production.py: Settings for live deployment (`DEBUG = False`).<br>
