# Nginx Dockerfile for reverse proxy
FROM nginx:stable-alpine

# Replace default process config (workers, timeouts) and site config.
# Drop 10-listen-on-ipv6-by-default.sh: with a custom conf.d file it still runs
# `apk manifest nginx` and can hang for minutes, so nginx never binds 80/443.
# IPv6 listen directives live in nginx.conf instead.
RUN rm /etc/nginx/conf.d/default.conf \
    && rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
    && rm -f /docker-entrypoint.d/30-tune-worker-processes.sh
COPY nginx.conf.main /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create SSL certificate directory (certificates will be mounted at runtime)
RUN mkdir -p /etc/ssl/landarsfood

# Create log directories
RUN mkdir -p /var/log/nginx

# Expose ports
EXPOSE 80 443

# Health check: HTTP 200 from nginx itself (must not 301 to HTTPS or proxy Django).
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --tries=1 -O /dev/null --header=Host:localhost http://127.0.0.1/nginx-health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
