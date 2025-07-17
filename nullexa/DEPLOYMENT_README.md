# Nullexa Deployment Files

This directory contains comprehensive deployment files for the Nullexa application. These files have been merged into a single, cohesive set of instructions to simplify the deployment process.

## Deployment Files Overview

1. **COMPLETE_DEPLOYMENT_GUIDE.md**
   - A comprehensive guide that covers both Docker and direct deployment methods
   - Includes detailed instructions for VPS configuration, security considerations, and troubleshooting
   - Serves as the main reference document for deployment

2. **deploy_nullexa.sh**
   - An automated deployment script that handles both Docker and direct deployment
   - Interactive script that guides you through the deployment process
   - Handles prerequisites, environment setup, and configuration

## How to Use These Files

### For Comprehensive Documentation

Refer to `COMPLETE_DEPLOYMENT_GUIDE.md` for detailed instructions and explanations about the deployment process. This guide covers:

- Prerequisites
- VPS Configuration
- Docker Deployment
- Direct Deployment (Without Docker)
- Domain Configuration
- Security Considerations
- Maintenance
- Troubleshooting
- WebRTC Considerations

### For Automated Deployment

Use the `deploy_nullexa.sh` script for an interactive, guided deployment process:

1. Connect to your VPS via SSH
2. Update your system packages
3. Install Git if not already installed
4. Clone the Nullexa repository
5. Navigate to the Nullexa directory
6. Make the script executable: `chmod +x deploy_nullexa.sh`
7. Run the script: `./deploy_nullexa.sh`
8. Follow the interactive prompts to complete the deployment

## Deployment Options

### Docker Deployment (Recommended)

The Docker deployment method uses Docker and Docker Compose to containerize the application, making it easier to manage and update. This method is recommended for most users.

### Direct Deployment

The direct deployment method installs the application directly on the server using Python, Gunicorn, Supervisor, and Nginx. This method gives you more control over the deployment but requires more manual configuration.

## VPS-Specific Configuration

For deploying on the specific VPS at `srv898188.hstgr.cloud` (IP: `69.62.85.60`) with the domain `nullexa.com`, both the deployment guide and script include specific instructions for:

- Connecting to the VPS
- Configuring the domain
- Setting up HTTPS with Let's Encrypt
- Configuring Nginx as a reverse proxy

## Maintenance and Updates

Both deployment methods include instructions for maintaining and updating the application. Refer to the maintenance section in the deployment guide for detailed instructions.

## Support

If you encounter any issues during deployment, refer to the troubleshooting section in the deployment guide. If you need further assistance, please contact the Nullexa support team.