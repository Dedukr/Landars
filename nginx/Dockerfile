# # -------- Stage 1: Build React App --------
# FROM node:18-alpine AS build-stage

# # Set working directory for frontend build
# WORKDIR /frontend

# # Copy only package.json and package-lock.json first for dependency installation
# COPY ../frontend/package*.json ./
# RUN npm install

# # Copy frontend source code into the container
# COPY ../frontend/ ./


# RUN npm run build  
# -------- Stage 2: Serve with NGINX --------
FROM nginx:alpine

# Copy Nginx configuration
COPY ./nginx.conf /etc/nginx/conf.d/default.conf 

# Create SSL directory and copy certificates
RUN mkdir -p /etc/ssl/landarsfood
COPY ./certs/ /etc/ssl/landarsfood/

# Copy the built frontend files from the build stage
# COPY --from=build-stage /frontend/build/ /var/www/frontend/
