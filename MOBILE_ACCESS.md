# Mobile Access Instructions

## Accessing from Mobile Device

The app is configured to run on `localhost:3000` by default, which only works on the same machine. To access from a mobile device:

### Option 1: Using .env file (Recommended)

1. Find your computer's local IP address:
   - **macOS**: `ipconfig getifaddr en0` or check System Preferences > Network
   - **Linux**: `hostname -I | awk '{print $1}'`
   - **Windows**: `ipconfig` and look for IPv4 Address

2. Create a `.env` file in the project root:
   ```bash
   # Replace 192.168.1.100 with your actual IP address
   BACKEND_PORT=8000
   FRONTEND_PORT=3000
   VITE_API_URL=http://192.168.1.100:8000
   ```

3. Rebuild and restart:
   ```bash
   docker-compose down
   docker-compose build
   docker-compose up -d
   ```

4. Access from mobile: `http://192.168.1.100:3000`

### Option 2: Quick Test (Temporary)

Access the app using your computer's IP address directly:
- Find your IP (e.g., 192.168.1.100)
- Open on mobile: `http://192.168.1.100:3000`

**Note**: If images don't load, this means the API_URL environment variable needs to be set (use Option 1).

### Troubleshooting

**"Load failed" or "Connection Error"**:
- Ensure your phone and computer are on the same WiFi network
- Check firewall settings allow connections on ports 3000 and 8000
- Verify Docker containers are running: `docker-compose ps`

**Images not loading in Tonies section**:
- The frontend is trying to connect to `localhost:8000`
- Use Option 1 to set `VITE_API_URL` properly

**Layout issues on mobile**:
- The app is responsive and should adapt to small screens
- Clear browser cache if you see strange layouts
- Try rotating device between portrait/landscape

### Network Requirements

- **Computer**: Running Docker with ports 3000 (frontend) and 8000 (backend)
- **Mobile**: Connected to same WiFi network as computer
- **Firewall**: Allow incoming connections on ports 3000 and 8000
