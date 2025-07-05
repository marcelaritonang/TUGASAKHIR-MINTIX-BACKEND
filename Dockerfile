FROM node:18-alpine

WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm install bs58 --save && \
    npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p public/uploads logs temp && \
    chmod 755 public/uploads

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Health check for Railway monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-5000}/health || exit 1

# Railway provides dynamic PORT
EXPOSE ${PORT:-5000}

# Use npm start (same as your existing)
CMD ["npm", "start"]