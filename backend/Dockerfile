# Use the official Python image as a base image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /backend

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Django application code to the container
COPY . .

RUN python manage.py collectstatic --noinput

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000"]