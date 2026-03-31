# Multi-stage build for smaller production image
FROM python:3.12-alpine AS builder

# Install build dependencies
# Note: In multi-platform builds (especially arm64 emulation), package triggers may fail
# even though packages install successfully. We handle this by verifying installation.
RUN set -euo pipefail; \
    # Install packages (allow non-zero exit due to trigger failures in emulation)
    apk add --no-cache \
    build-base \
    libffi-dev \
    cairo-dev \
    pango-dev \
    gdk-pixbuf-dev \
    libxml2-dev \
    libxslt-dev \
    glib-dev \
    postgresql-dev || \
    # If installation failed, verify packages are actually installed
    ( \
    echo "Warning: Package installation reported errors (likely trigger failures in emulation)" >&2; \
    # Verify critical build dependencies are present
    apk info -e build-base > /dev/null 2>&1 && \
    apk info -e libffi-dev > /dev/null 2>&1 && \
    apk info -e postgresql-dev > /dev/null 2>&1 && \
    command -v gcc > /dev/null && \
    echo "Packages verified: installation successful despite trigger errors" \
    ) || \
    ( \
    echo "ERROR: Critical build packages failed to install" >&2; \
    echo "Missing packages:" >&2; \
    apk info -e build-base > /dev/null 2>&1 || echo "  - build-base" >&2; \
    apk info -e libffi-dev > /dev/null 2>&1 || echo "  - libffi-dev" >&2; \
    apk info -e postgresql-dev > /dev/null 2>&1 || echo "  - postgresql-dev" >&2; \
    command -v gcc > /dev/null || echo "  - gcc (build-base)" >&2; \
    exit 1 \
    ); \
    echo "✓ Build dependencies installed and verified"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.12-alpine AS runner

# Install runtime dependencies only
# Note: In multi-platform builds (especially arm64 emulation), package triggers may fail
# even though packages install successfully. We handle this by verifying installation.
RUN set -euo pipefail; \
    # Install packages (allow non-zero exit due to trigger failures in emulation)
    apk add --no-cache \
    cairo \
    pango \
    gdk-pixbuf \
    libxml2 \
    libxslt \
    glib \
    postgresql-libs \
    font-noto \
    font-noto-cjk \
    font-noto-emoji || \
    # If installation failed, verify packages are actually installed
    ( \
    echo "Warning: Package installation reported errors (likely trigger failures in emulation)" >&2; \
    # Verify critical runtime dependencies are present
    apk info -e postgresql-libs > /dev/null 2>&1 && \
    apk info -e cairo > /dev/null 2>&1 && \
    apk info -e pango > /dev/null 2>&1 && \
    command -v python3 > /dev/null && \
    echo "Packages verified: installation successful despite trigger errors" \
    ) || \
    ( \
    echo "ERROR: Critical packages failed to install" >&2; \
    echo "Missing packages:" >&2; \
    apk info -e postgresql-libs > /dev/null 2>&1 || echo "  - postgresql-libs" >&2; \
    apk info -e cairo > /dev/null 2>&1 || echo "  - cairo" >&2; \
    apk info -e pango > /dev/null 2>&1 || echo "  - pango" >&2; \
    command -v python3 > /dev/null || echo "  - python3" >&2; \
    exit 1 \
    ); \
    echo "✓ Runtime dependencies installed and verified" 

# Set working directory
WORKDIR /backend

# Wheelhouse in a path readable by the non-root runtime user (not /root/.local).
COPY --from=builder /root/.local /opt/py
ENV PATH=/opt/py/bin:$PATH
# pip --user layout: /opt/py/lib/python3.12/site-packages (image Python must see it).
ENV PYTHONPATH=/opt/py/lib/python3.12/site-packages

# Copy application code
COPY . .

# Collect static files (image build only; still runs as root before USER below).
RUN python manage.py collectstatic --noinput

# Run Gunicorn/Celery as non-root — avoids Celery's "superuser privileges" warning.
RUN addgroup -g 1000 django && \
    adduser -D -u 1000 -G django django && \
    chown -R django:django /backend /opt/py

USER django

# Expose port
EXPOSE 8000

CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "4", "--timeout", "300", "--max-requests", "1000", "--max-requests-jitter", "100"]