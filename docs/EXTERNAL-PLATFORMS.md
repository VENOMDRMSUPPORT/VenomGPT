# Running on External Platforms

This guide covers running VenomGPT on external platforms like GitHub Codespaces, Gitpod, local development, or any cloud IDE.

## Quick Start

### Option 1: Using Docker (Easiest)

```bash
# 1. Copy .env.example to .env and add your ZAI_API_KEY
cp .env.example .env

# 2. Start with Docker Compose
docker-compose up -d

# 3. Access the application
# IDE: http://localhost:5173
# API: http://localhost:3001
```

### Option 2: Using the startup script (Recommended for non-Docker)

```bash
./start-external.sh
```

This script will:
- Check and create `.env` if needed
- Install dependencies
- Build the project
- Start both API server and IDE

### Option 3: Manual setup

#### 1. Install dependencies
```bash
pnpm install
```

#### 2. Configure environment variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and add your configuration:
```env
# Required: Your Z.AI API key
ZAI_API_KEY=your-actual-api-key-here

# Optional: Ports (defaults shown)
API_PORT=3001
IDE_PORT=5173
SANDBOX_PORT=5174

# Optional: Base paths
BASE_PATH=/
VITE_API_PORT=3001
```

#### 3. Build the project
```bash
# Set required environment variables for build
export PORT=5174
export BASE_PATH=/

# Build
pnpm run build
```

#### 4. Start the services
```bash
# Set environment variables
export API_PORT=3001
export IDE_PORT=5173
export BASE_PATH=/
export VITE_API_PORT=3001

# Start both services
pnpm run dev
```

## Using Docker

Docker provides the easiest way to run VenomGPT on any platform with Docker installed.

### Docker Compose (Recommended)

```bash
# 1. Create .env file with your API key
cp .env.example .env
# Edit .env and add your ZAI_API_KEY

# 2. Start the services
docker-compose up -d

# 3. View logs
docker-compose logs -f

# 4. Stop the services
docker-compose down
```

### Docker build and run manually

```bash
# 1. Build the image
docker build -t venomgpt .

# 2. Run the container
docker run -d \
  -p 3001:3001 \
  -p 5173:5173 \
  -e ZAI_API_KEY=your-key-here \
  -v $(pwd)/workspace:/workspace \
  --name venomgpt \
  venomgpt
```

### Docker volumes

The following volumes are available:
- `/workspace` - Your code workspace (read-write)
- `/home/node/.venomgpt` - Agent persistence data

### Docker environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ZAI_API_KEY` | *required* | Your Z.AI API key |
| `ZAI_BASE_URL` | `https://api.z.ai/api/coding/paas/v4/` | API base URL |
| `API_PORT` | `3001` | API server port |
| `IDE_PORT` | `5173` | Frontend IDE port |
| `BASE_PATH` | `/` | Base path for routing |
| `NODE_ENV` | `development` | Node environment |

## Platform-Specific Instructions

### GitHub Codespaces

1. Create a new Codespace from this repository
2. The ports will be automatically forwarded:
   - **API Server**: Port 3001
   - **IDE**: Port 5173
3. Access the application through the forwarded ports

### Gitpod

1. Create a new Gitpod workspace
2. Run the startup script:
   ```bash
   ./start-external.sh
   ```
3. Gitpod will automatically detect and expose the ports

### Local Development

#### Prerequisites
- Node.js 18+ and pnpm
- Git

#### Steps
```bash
# Clone the repository
git clone <repository-url>
cd Asset-Manager

# Run the startup script
./start-external.sh
```

Access the application at:
- **IDE**: http://localhost:5173
- **API**: http://localhost:3001

## Troubleshooting

### "PORT environment variable is required"
Add the missing environment variables to your `.env` file or export them before running:
```bash
export PORT=5174
export BASE_PATH=/
```

### Build fails with "Cannot find module"
Make sure all dependencies are installed:
```bash
pnpm install
```

### Services don't start
1. Check if ports are already in use
2. Verify environment variables are set correctly
3. Check the logs for specific error messages

### API returns 404 for /api/status
This is expected. The available endpoints are under `/api/`:
- `/api/workspace` - Workspace configuration
- `/api/tasks` - Task management
- And others defined in the API routes

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZAI_API_KEY` | Yes | - | Your Z.AI API key for the AI agent |
| `ZAI_BASE_URL` | No | `https://api.z.ai/api/coding/paas/v4/` | Z.AI API base URL |
| `API_PORT` | No | `3001` | Port for the API server |
| `IDE_PORT` | No | `5173` | Port for the frontend IDE |
| `SANDBOX_PORT` | No | `5174` | Port for the sandbox preview |
| `BASE_PATH` | No | `/` | Base path for the application |
| `VITE_API_PORT` | No | `3001` | API port for the frontend to connect to |
| `NODE_ENV` | No | `development` | Node environment |

## Project Structure

```
Asset-Manager/
├── artifacts/
│   ├── api-server/      # Backend API server (Express.js)
│   ├── workspace-ide/   # Frontend IDE (React + Vite)
│   └── mockup-sandbox/  # Preview sandbox
├── lib/                 # Shared libraries
├── scripts/             # Build and utility scripts
├── .env                 # Environment variables (create this)
├── .env.example         # Example environment variables
└── start-external.sh    # Startup script for external platforms
```

## Development Workflow

1. **Make changes** to the codebase
2. **Build** the project:
   ```bash
   PORT=5174 BASE_PATH=/ pnpm run build
   ```
3. **Restart** the services or use watch mode for automatic rebuilds

## Support

For issues or questions:
1. Check the [troubleshooting section](#troubleshooting)
2. Review the main [README.md](../README.md)
3. Open an issue on the repository
