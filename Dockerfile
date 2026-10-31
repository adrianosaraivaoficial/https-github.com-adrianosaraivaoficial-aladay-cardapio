# Multi-stage Dockerfile for Hostinger VPS with Easypanel
# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* bun.lock* ./

# Install all dependencies (including devDependencies needed for vite build)
RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Build Vite frontend to /app/dist
RUN npm run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files and install only production dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy compiled frontend from builder
COPY --from=builder /app/dist ./dist

# Copy backend server and essential source files
COPY --chown=node:node server.ts ./
COPY --chown=node:node src ./src
COPY --chown=node:node database ./database
COPY --chown=node:node tsconfig.json ./

# Ensure non-root ownership and drop privileges
RUN chown -R node:node /app
USER node

# Expose default Easypanel port
EXPOSE 3000

# Healthcheck for Easypanel / Traefik
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health || exit 1

# Start full-stack server
CMD ["npm", "start"]
