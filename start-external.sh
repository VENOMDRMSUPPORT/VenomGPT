#!/bin/bash
# Startup script for external platforms (GitHub Codespaces, Gitpod, etc.)
# This script handles environment setup and starts both API and IDE services

set -e

echo "🚀 Starting VenomGPT on external platform..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if .env exists, if not create from example
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        print_warning "Please edit .env and add your ZAI_API_KEY"
    else
        print_error ".env.example not found. Please create .env manually."
        exit 1
    fi
fi

# Load environment variables
print_info "Loading environment variables..."
export $(grep -v '^#' .env | xargs)

# Set default values if not in .env
export API_PORT=${API_PORT:-3001}
export IDE_PORT=${IDE_PORT:-5173}
export SANDBOX_PORT=${SANDBOX_PORT:-5174}
export BASE_PATH=${BASE_PATH:-/}
export VITE_API_PORT=${VITE_API_PORT:-3001}
export NODE_ENV=${NODE_ENV:-development}

print_info "Configuration:"
echo "  API Port: $API_PORT"
echo "  IDE Port: $IDE_PORT"
echo "  Sandbox Port: $SANDBOX_PORT"
echo "  Base Path: $BASE_PATH"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    print_info "Installing pnpm..."
    npm install -g pnpm
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_info "Installing dependencies..."
    pnpm install
fi

# Build the project
print_info "Building project..."
PORT=$SANDBOX_PORT BASE_PATH=$BASE_PATH pnpm run build

# Start services
print_info "Starting services..."
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  VenomGPT is starting..."
echo "═══════════════════════════════════════════════════════════════"
echo ""
print_info "API Server will be available at: http://localhost:$API_PORT"
print_info "IDE will be available at: http://localhost:$IDE_PORT"
echo ""
print_warning "Press Ctrl+C to stop all services"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Start both services using concurrently
PORT=$API_PORT BASE_PATH=$BASE_PATH VITE_API_PORT=$VITE_API_PORT pnpm run dev
