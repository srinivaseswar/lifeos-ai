# Production Dockerfile for LifeOS AI
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package configurations
COPY backend/package.json ./backend/

# Install production dependencies
WORKDIR /app/backend
RUN pnpm install --prod

# Copy application source code
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Expose server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

WORKDIR /app/backend
CMD ["node", "server.js"]
