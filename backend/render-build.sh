#!/usr/bin/env bash
# exit on error
set -o errexit

# Install dependencies using pip
pip install -r requirements.txt

# Run standard Django commands
python manage.py collectstatic --no-input
python manage.py migrate