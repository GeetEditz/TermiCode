#!/bin/bash

# Update and deploy the server changes
echo "Committing and pushing server changes..."
git add server/index.js
git commit -m "Update server CORS configuration to allow client requests"
git push origin master

# Update and deploy the client changes
echo "Committing and pushing client changes..."
git add client/public/serve.json client/src/services/api.ts
git commit -m "Add API proxy configuration and update API endpoint construction"
git push origin master

echo "Done! Railway should automatically detect these changes and redeploy."
echo ""
echo "Configuration changes made:"
echo "1. Updated server CORS to accept client domain"
echo "2. Created serve.json for API proxying"
echo "3. Updated API endpoint construction in client code"
echo ""
echo "Important Railway settings to check:"
echo "- Server: Make sure Docker socket is mounted: /var/run/docker.sock:/var/run/docker.sock"
echo "- Server: Start command should be: sh -c \"node /app/server/index.js\""
echo "- Client: Start command should be: npx serve -s client/dist --config ./client/public/serve.json"
echo "- Client: Set environment variable VITE_API_URL=https://code-editor-server-production.up.railway.app" 