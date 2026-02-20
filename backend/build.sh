#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

python manage.py migrate --settings=SmartEats_config.settings.production
python manage.py collectstatic --no-input --settings=SmartEats_config.settings.production

# Create tester superuser if it doesn't already exist
python manage.py shell --settings=SmartEats_config.settings.production -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='tester').exists():
    User.objects.create_superuser('tester', '', 'uiuc12345')
    print('Created superuser: tester')
else:
    print('Superuser tester already exists')
"
