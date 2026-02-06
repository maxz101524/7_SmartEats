SmartEats/ <br>
├── backend/<br>
│ ├── docs/<br>
│  
│  
│  
│  
│
└── frontend/<br>
├── docs/<br>

You can find full setup for each frontend and backend in docs

1. **Backend Setup**<br>
   -pip install django-cors-headers (if you haven't yet installed) <br>
   -cd backend <br>
   -python manage.py runserver --settings=SmartEats_config.settings.development <br>

2. **Frontend Setup**<br>
   -open new terminal
   -cd frontend<br>
   -npm install<br>
   -npm run dev<br>

**development.py: Settings for local development (`DEBUG = True`).<br>
**production.py: Settings for live deployment (`DEBUG = False`).<br>
