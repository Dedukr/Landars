# Stage 1: Build the Next.js app
FROM node:18-alpine AS build

WORKDIR /frontend

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built static files
COPY --from=build /app/.next /usr/share/nginx/html/.next
COPY --from=build /app/public /usr/share/nginx/html/public
COPY --from=build /app/package.json /usr/share/nginx/html/package.json

# Copy custom Nginx config (create this file as shown below)
COPY ../nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY ../nginx/certs/ /etc/ssl/landarsfood/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
