# Nullexa - P2P Messaging System

Nullexa is a peer-to-peer messaging application built with Python, Flask, SocketIO, and WebRTC. It enables direct, encrypted communication between users without storing messages on a server.

## Features

- **Peer-to-Peer Messaging**: Direct communication between users using WebRTC data channels
- **Group Chat Rooms**: Create and join room-based conversations
- **Real-time Updates**: Instant messaging with real-time user status updates
- **Encrypted Communication**: WebRTC provides secure, encrypted data transfer
- **Responsive Design**: Works on desktop and mobile devices

## Technology Stack

- **Backend**: Python with Flask and Flask-SocketIO
- **Frontend**: HTML, CSS, JavaScript
- **Real-time Communication**: Socket.IO for signaling, WebRTC for peer-to-peer data transfer
- **UI Framework**: Bootstrap 5

## How It Works

1. **Signaling Server**: The Flask server with Socket.IO handles user authentication, presence, and WebRTC signaling
2. **WebRTC Connection**: Users establish direct peer connections using the signaling server
3. **Data Channels**: Once connected, messages are sent directly between peers without going through the server
4. **Group Messaging**: Room-based messages are distributed through the server to all room participants

## Setup and Installation

### Prerequisites

- Python 3.7 or higher and pip (for local development)
- Docker and Docker Compose (for containerized deployment)

### Local Installation

1. Clone the repository or download the source code

2. Navigate to the project directory

```bash
cd nullexa
```

3. Create a virtual environment (optional but recommended)

```bash
python -m venv venv
```

4. Activate the virtual environment

- On Windows:
```bash
venv\Scripts\activate
```

- On macOS/Linux:
```bash
source venv/bin/activate
```

5. Install the required dependencies

```bash
pip install -r requirements.txt
```

### Running the Application Locally

1. Start the server

```bash
python app.py
```

2. Open your web browser and navigate to:

```
http://localhost:3000
```

### Deployment Options

#### Docker Deployment

1. Make sure Docker and Docker Compose are installed on your system

2. Configure environment variables (optional)

   Copy the example .env file and modify as needed:
   ```bash
   cp .env.example .env
   ```

3. Build and start the Docker container

   ```bash
   docker-compose up -d
   ```

4. Access the application

   ```
   http://localhost:3000
   ```

5. For production deployment on a VPS with Docker

   See the detailed instructions in [DEPLOYMENT.md](DEPLOYMENT.md)

#### Direct Deployment (Without Docker)

For deploying directly on an Ubuntu VPS without Docker:

1. Use the provided deployment script:

   ```bash
   sudo bash deploy_without_docker.sh
   ```

2. Or follow the step-by-step manual instructions in [DEPLOYMENT_WITHOUT_DOCKER.md](DEPLOYMENT_WITHOUT_DOCKER.md)

3. This method uses:
   - Python virtual environment
   - Gunicorn as the WSGI server
   - Supervisor for process management
   - Nginx as a reverse proxy

## Usage

1. **Setting Your Username**: Enter your desired username in the profile section and click "Update"

2. **Direct Messaging**:
   - Click on a user in the "Users" tab to start a direct chat
   - Messages are sent directly peer-to-peer using WebRTC

3. **Group Messaging**:
   - Click "Create Room" to create a new chat room
   - Enter a room name and click "Create"
   - Other users can join your room from the "Rooms" tab
   - Messages in rooms are distributed through the server

## Security Considerations

- Direct messages between users are encrypted using WebRTC's built-in encryption
- The server does not store any messages
- For production use:
  - Set up HTTPS using Nginx and Let's Encrypt (see deployment guides)
  - Configure a fixed SECRET_KEY in the .env file
  - Consider adding user authentication
  - Keep system packages updated (Docker or direct installation)
  - Use a firewall to restrict access to necessary ports only
  - For non-Docker deployments, consider using fail2ban to prevent brute force attacks
  - Set up regular backups of your application data

## Limitations

- The current implementation uses a STUN server for NAT traversal but doesn't include TURN server support
- For users behind symmetric NATs, direct connections might not be possible without a TURN server
- The application doesn't persist messages or user accounts

## License

This project is open source and available under the MIT License.

## Acknowledgments

- WebRTC API
- Socket.IO
- Flask
- Bootstrap