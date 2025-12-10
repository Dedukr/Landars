# Nginx Dockerfile for reverse proxy
FROM nginx:stable-alpine

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create SSL certificate directory (certificates will be mounted at runtime)
RUN mkdir -p /etc/ssl/landarsfood

# Create log directories
RUN mkdir -p /var/log/nginx

# Expose ports
EXPOSE 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
