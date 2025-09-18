# Multi-stage build for smaller production image
FROM python:3.10-alpine AS builder

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
FROM python:3.10-alpine AS runner

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
    font-noto-emoji \
    wget

# Create non-root user
RUN addgroup -g 1001 django && \
    adduser -D -u 1001 -G django django

# Set working directory
WORKDIR /backend

# Copy Python packages from builder
COPY --from=builder /root/.local /home/django/.local
ENV PATH=/home/django/.local/bin:$PATH

# Copy application code
COPY . .

# Create database directory and set permissions
RUN mkdir -p /backend/db && \
    chown -R django:django /backend && \
    chmod -R 755 /backend/db

# Change ownership to non-root user
USER django

# Collect static files
RUN python manage.py collectstatic --noinput

# Expose port
EXPOSE 8000

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "4", "--timeout", "120"]