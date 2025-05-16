# Setup Instructions

This document provides detailed instructions for setting up and running the Code Editor application.

## Prerequisites

- Node.js (v16+)
- npm or yarn
- Docker (required for code execution)
- Docker Compose (optional, for easier deployment)

## Docker Setup (Required)

The application uses Docker to safely execute code in isolated containers. 

1. Install Docker:
   - [Docker Desktop for Windows/Mac](https://www.docker.com/products/docker-desktop)
   - [Docker Engine for Linux](https://docs.docker.com/engine/install/)

2. Verify Docker is installed and running:
   ```bash
   docker --version
   docker run hello-world
   ```

3. Pull the Python image that will be used for code execution:
   ```bash
   docker pull python:3.9-alpine
   ```

## Development Setup

### 1. Install Dependencies

First, install all dependencies for both client and server:

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..

# Install server dependencies
cd server
npm install
cd ..

# Or use the shortcut
npm run install:all
```

### 2. Run in Development Mode

To run both the client and server in development mode:

```bash
npm run dev
```

This will start:
- Client on http://localhost:5173
- Server on http://localhost:3000

To run them separately:

```bash
# Client only
npm run client:dev

# Server only
npm run server:dev
```

## Production Build

To build the client application for production:

```bash
npm run build
```

This will create a `dist` folder in the client directory.

## Deployment with Docker Compose

The easiest way to deploy the application is using Docker Compose:

```bash
# Build and start the container
docker-compose up -d

# To view logs
docker-compose logs -f

# To stop the container
docker-compose down
```

## Configuration

The server uses the following environment variables that can be set in a `.env` file in the server directory:

```
PORT=3000
NODE_ENV=development
```

## Security Considerations

The application uses Docker containers for code execution, which provides some level of isolation. However, for production environments you should consider:

1. Using a reverse proxy like Nginx
2. Adding rate limiting
3. Implementing proper user authentication
4. Periodically updating the Docker images
5. Setting stricter resource limits in the container configuration

## How It Works

When code is executed:
1. The server creates a temporary Python file with the code
2. An input file is created with user-provided input (if any)
3. A Docker container is created with these files mounted
4. The code runs inside the container with resource limits
5. Output/errors are captured and returned to the client
6. The container is automatically removed after execution

## Troubleshooting

If you encounter issues:

1. Ensure Docker is running (most common issue)
2. Check Docker permissions - the server needs permission to create containers
3. Check if all required ports are available
4. Verify you have write permissions to the temp directory
5. If you see "EOFError", make sure you've provided inputs in the input field for any input() calls in your code
6. Check Docker logs: `docker logs $(docker ps -q -f ancestor=python:3.9-alpine)` 