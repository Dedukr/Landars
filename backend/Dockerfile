# Use the official Python image as a base image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /backend

# Install system dependencies for WeasyPrint
RUN apt-get update && \
    apt-get install -y \
        build-essential \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libgdk-pixbuf-2.0-0 \
        libffi-dev \
        libcairo2 \
        libpq-dev \
        libxml2 \
        libxslt1.1 \
        libglib2.0-0 \
        fonts-liberation \
        fonts-cantarell \
        fonts-dejavu \
        && apt-get clean \
        && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Django application code to the container
COPY . .

RUN python manage.py collectstatic --noinput

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "2", "--timeout", "120"]