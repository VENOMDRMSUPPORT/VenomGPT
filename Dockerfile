# Dockerfile for VenomGPT
# This image runs both the API server and the frontend IDE

FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy all source files
COPY . .

# Build the project
ENV PORT=5174
ENV BASE_PATH=/
RUN pnpm run build

# Expose ports
EXPOSE 3001 5173

# Create startup script
RUN echo '#!/bin/sh' > /app/start-docker.sh && \
    echo 'echo "Starting VenomGPT..."' >> /app/start-docker.sh && \
    echo 'export API_PORT=${API_PORT:-3001}' >> /app/start-docker.sh && \
    echo 'export IDE_PORT=${IDE_PORT:-5173}' >> /app/start-docker.sh && \
    echo 'export BASE_PATH=${BASE_PATH:-/}' >> /app/start-docker.sh && \
    echo 'export VITE_API_PORT=${VITE_API_PORT:-3001}' >> /app/start-docker.sh && \
    echo 'echo "API: http://localhost:$API_PORT"' >> /app/start-docker.sh && \
    echo 'echo "IDE: http://localhost:$IDE_PORT"' >> /app/start-docker.sh && \
    echo 'PORT=$API_PORT BASE_PATH=$BASE_PATH VITE_API_PORT=$VITE_API_PORT pnpm run dev' >> /app/start-docker.sh && \
    chmod +x /app/start-docker.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3001/api/workspace || exit 1

# Start the application
CMD ["/app/start-docker.sh"]
