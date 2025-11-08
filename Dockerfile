# Multi-stage build: Frontend + Backend in one container
FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
# Build without VITE_API_URL to use relative URLs (handled by nginx proxy)
RUN npm run build

# Final stage: Python backend with nginx for frontend
FROM python:3.11-slim

# Install nginx and required packages
RUN apt-get update && apt-get install -y \
    nginx \
    libmagic1 \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Setup backend
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/sites-available/default
RUN ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default && \
    rm -f /etc/nginx/sites-enabled/default && \
    ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/

# Create startup script that runs both nginx and uvicorn
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "Testing nginx configuration..."\n\
nginx -t\n\
\n\
echo "Starting nginx..."\n\
service nginx start\n\
\n\
# Wait a moment and check if nginx is running\n\
sleep 2\n\
if pgrep nginx > /dev/null; then\n\
    echo "Nginx started successfully"\n\
else\n\
    echo "ERROR: Nginx failed to start!"\n\
    exit 1\n\
fi\n\
\n\
echo "Starting uvicorn..."\n\
exec uvicorn app.main:app --host 0.0.0.0 --port 8000\n\
' > /start.sh && chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"]
