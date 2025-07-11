# Use official Node.js image as the base
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies and build app in one layer for better caching
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --progress=false
COPY . .
RUN npm run build

# Production image: only copy built assets and minimal files
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only the necessary files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose port (optional, for clarity)
EXPOSE 3000

CMD ["npx", "next", "start"]