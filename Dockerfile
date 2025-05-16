FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Install dependencies for the root project
RUN npm install

# Copy client and server files
COPY . .

# Install client dependencies and build
WORKDIR /app/client
RUN npm install
RUN npm run build

# Move back to root directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Install Python and dependencies
RUN apk add --update python3 py3-pip python3-dev gcc g++ musl-dev

# Create and activate virtual environment for Python packages
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Install Python packages in the virtual environment
RUN pip3 install --no-cache-dir numpy pandas scipy scikit-learn sympy statsmodels

# Create temp directory for code execution
RUN mkdir -p /app/server/temp
RUN chmod 777 /app/server/temp

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
 