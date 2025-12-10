# Multi-stage build for smaller production image
FROM python:3.12-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    build-base \
    libffi-dev \
    cairo-dev \
    pango-dev \
    gdk-pixbuf-dev \
    libxml2-dev \
    libxslt-dev \
    glib-dev \
    postgresql-dev

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.12-alpine AS runner

# Install runtime dependencies only
RUN apk add --no-cache \
    cairo \
    pango \
    gdk-pixbuf \
    libxml2 \
    libxslt \
    glib \
    postgresql-libs \
    font-noto \
    font-noto-cjk \
    font-noto-emoji 

# Set working directory
WORKDIR /backend

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY . .

# Copy sequence fix script
# COPY management/fix_identity_columns.py /tmp/fix_identity_columns.py

# Copy migration script
# COPY management/migrate_to_postgres.py /tmp/migrate_to_postgres.py

# Collect static files
RUN python manage.py collectstatic --noinput

# Expose port
EXPOSE 8000

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "4", "--timeout", "120"]