# Web-based Coding Editor

A full-stack web application that allows users to write, execute, and share code. Built with React, Node.js, Express, and Docker.

## Features

- Write code with syntax highlighting (starting with Python support)
- Execute code on a backend server
- View output in a terminal-like window
- Pass input to the program via stdin
- Save code snippets locally
- Light/Dark mode toggle
- Share code via link
- Responsive, mobile-friendly design

## Tech Stack

### Frontend
- React with TypeScript
- CodeMirror for the code editor
- Tailwind CSS for styling
- Vite for fast development

### Backend
- Node.js with Express
- Docker for secure code execution
- REST API for communication between frontend and backend

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Docker (for running the backend)

### Installation

1. Clone the repository
2. Install dependencies for both frontend and backend

```bash
# Install frontend dependencies
cd client
npm install

# Install backend dependencies
cd ../server
npm install
```

3. Start the development servers

```bash
# Start the frontend
cd client
npm run dev

# Start the backend
cd ../server
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## Project Structure

- `/client` - Frontend React application
- `/server` - Backend Express server

## Docker Setup

The backend uses Docker to execute code safely. Make sure you have Docker installed and running.

## License

MIT 