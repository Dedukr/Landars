# Use official Node.js image as the base
FROM node:20-alpine AS builder
WORKDIR /app

# Accept build arguments for URL configuration
ARG NEXT_PUBLIC_API_BASE_URL
ARG URL_BASE
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV URL_BASE=$URL_BASE
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Install dependencies and build app in one layer for better caching
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --progress=false
COPY . .
# Clear Next.js cache to prevent stale Server Action errors
RUN rm -rf .next
RUN npm run build

# Production image: use standalone output for minimal size
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build output (includes only necessary files)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Change ownership to non-root user
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

CMD ["node", "server.js"]