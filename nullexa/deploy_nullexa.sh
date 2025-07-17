#!/bin/bash

# Nullexa Deployment Script
# This script automates the deployment of Nullexa on Ubuntu
# It supports both Docker and direct deployment methods

set -e

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# Function to print colored messages
print_message() {
    echo -e "${BOLD}${2}${1}${NC}"
}

# Function to print section headers
print_section() {
    echo -e "\n${BOLD}${BLUE}=== $1 ===${NC}\n"
}

# Function to print success messages
print_success() {
    echo -e "${BOLD}${GREEN}✓ $1${NC}"
}

# Function to print error messages and exit
print_error() {
    echo -e "${BOLD}${RED}✗ ERROR: $1${NC}"
    exit 1
}

# Function to print warning messages
print_warning() {
    echo -e "${BOLD}${YELLOW}⚠ WARNING: $1${NC}"
}

# Function to ask yes/no questions
ask_yes_no() {
    while true; do
        read -p "$1 (y/n): " yn
        case $yn in
            [Yy]* ) return 0;;  # Yes
            [Nn]* ) return 1;;  # No
            * ) echo "Please answer yes (y) or no (n).";;  # Invalid input
        esac
    done
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to generate a secure random key
generate_secret_key() {
    python3 -c "import secrets; print(secrets.token_hex(32))"
}

# Function to check if Docker is installed
check_docker() {
    if command_exists docker && command_exists docker-compose; then
        print_success "Docker and Docker Compose are already installed."
        return 0
    else
        return 1
    fi
}

# Function to install Docker and Docker Compose
install_docker() {
    print_section "Installing Docker and Docker Compose"
    
    # Update package index
    sudo apt update
    
    # Install prerequisites
    sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
    
    # Add Docker repository
    sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    
    # Install Docker
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io
    
    # Install Docker Compose
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.18.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    
    # Add current user to the docker group
    sudo usermod -aG docker ${USER}
    
    print_success "Docker and Docker Compose installed successfully."
    print_warning "You may need to log out and log back in for the docker group changes to take effect."
}

# Function to deploy with Docker
deploy_with_docker() {
    print_section "Deploying Nullexa with Docker"
    
    # Check if .env file exists, if not create it
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            print_success "Created .env file from .env.example"
        else
            # Create a basic .env file
            cat > .env << EOL
# Environment variables for Nullexa

# Flask configuration
FLASK_SECRET_KEY=$(generate_secret_key)
FLASK_DEBUG=False

# Server configuration
HOST=0.0.0.0
PORT=3000

# File upload configuration
MAX_CONTENT_LENGTH=1073741824  # 1GB in bytes
EOL
            print_success "Created new .env file with generated secret key"
        fi
    else
        # Check if FLASK_SECRET_KEY is set in .env
        if grep -q "FLASK_SECRET_KEY=your_secure_random_key_here" .env || ! grep -q "FLASK_SECRET_KEY=" .env; then
            # Replace the placeholder or add the key if it doesn't exist
            sed -i "s/FLASK_SECRET_KEY=.*/FLASK_SECRET_KEY=$(generate_secret_key)/" .env || \
            echo "FLASK_SECRET_KEY=$(generate_secret_key)" >> .env
            print_success "Updated FLASK_SECRET_KEY in .env file"
        fi
    fi
    
    # Build and start the Docker containers
    print_message "Building and starting Docker containers..." "$YELLOW"
    docker-compose up -d --build
    
    print_success "Nullexa has been deployed with Docker!"
    print_message "You can access it at http://localhost:3000" "$GREEN"
}
# Function to install Nginx
install_nginx() {
    if ! command_exists nginx; then
        print_section "Installing Nginx"
        sudo apt update
        sudo apt install -y nginx
        sudo systemctl enable nginx
        sudo systemctl start nginx
        print_success "Nginx installed successfully."
    else
        print_success "Nginx is already installed."
    fi
}

# Function to configure Nginx for Nullexa
configure_nginx() {
    local domain=$1
    local port=$2
    
    print_section "Configuring Nginx for Nullexa"
    
    # Create Nginx configuration file
    sudo bash -c "cat > /etc/nginx/sites-available/nullexa << EOL
server {
    listen 80;
    server_name $domain;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /static/ {
        alias $(pwd)/static/;
    }
}
EOL"
    
    # Enable the site
    sudo ln -sf /etc/nginx/sites-available/nullexa /etc/nginx/sites-enabled/
    
    # Test Nginx configuration
    sudo nginx -t && sudo systemctl restart nginx
    
    print_success "Nginx configured successfully."
}

# Function to set up HTTPS with Let's Encrypt
setup_https() {
    local domain=$1
    
    print_section "Setting up HTTPS with Let's Encrypt"
    
    # Install Certbot
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
    
    # Obtain and install certificate
    sudo certbot --nginx -d "$domain" --non-interactive --agree-tos --email "admin@$domain" --redirect
    
    print_success "HTTPS configured successfully."
}

# Function to deploy directly (without Docker)
deploy_directly() {
    print_section "Deploying Nullexa directly (without Docker)"
    
    # Install required packages
    print_message "Installing required packages..." "$YELLOW"
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv nginx supervisor
    
    # Create a user for the application
    if ! id -u nullexa &>/dev/null; then
        sudo adduser --system --group nullexa
    fi
    
    # Create application directory
    sudo mkdir -p /var/www/nullexa
    
    # Copy application files
    current_dir=$(pwd)
    sudo cp -r "$current_dir"/* /var/www/nullexa/
    sudo chown -R nullexa:nullexa /var/www/nullexa
    # Set up Python virtual environment
    print_message "Setting up Python virtual environment..." "$YELLOW"
    sudo -u nullexa bash -c "cd /var/www/nullexa && python3 -m venv venv"
    sudo -u nullexa bash -c "cd /var/www/nullexa && source venv/bin/activate && pip install -r requirements.txt"
    sudo -u nullexa bash -c "cd /var/www/nullexa && source venv/bin/activate && pip install gunicorn"
    
    # Configure environment variables
    if [ -f /var/www/nullexa/.env.example ]; then
        sudo -u nullexa bash -c "cd /var/www/nullexa && cp .env.example .env"
    else
        # Create a basic .env file
        sudo -u nullexa bash -c "cat > /var/www/nullexa/.env << EOL
# Environment variables for Nullexa

# Flask configuration
FLASK_SECRET_KEY=$(generate_secret_key)
FLASK_DEBUG=False

# Server configuration
HOST=0.0.0.0
PORT=3000

# File upload configuration
MAX_CONTENT_LENGTH=1073741824  # 1GB in bytes
EOL"
    fi
    # Create upload directory
    print_message "Creating upload directory..." "$YELLOW"
    sudo -u nullexa mkdir -p /var/www/nullexa/static/uploads
    
    # Configure Supervisor
    print_message "Configuring Supervisor..." "$YELLOW"
    sudo bash -c "cat > /etc/supervisor/conf.d/nullexa.conf << EOL
[program:nullexa]
directory=/var/www/nullexa
command=/var/www/nullexa/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:3000 --timeout 120 app:app
user=nullexa
autostart=true
autorestart=true
stdout_logfile=/var/log/nullexa/gunicorn.log
stderr_logfile=/var/log/nullexa/gunicorn_error.log
environment=PYTHONPATH='/var/www/nullexa'
EOL"
    
    # Create log directory
    sudo mkdir -p /var/log/nullexa
    sudo chown -R nullexa:nullexa /var/log/nullexa
    
    # Reload supervisor
    sudo supervisorctl reread
    sudo supervisorctl update
    sudo supervisorctl start nullexa
    
    print_success "Nullexa has been deployed directly!"
    print_message "You can access it at http://localhost:3000" "$GREEN"
}

# Function to configure firewall
configure_firewall() {
    print_section "Configuring Firewall"
    
    # Install UFW if not already installed
    if ! command_exists ufw; then
        sudo apt update
        sudo apt install -y ufw
    fi
    
    # Configure UFW
    sudo ufw allow ssh
    sudo ufw allow 80
    sudo ufw allow 443
    
    # Enable UFW if not already enabled
    if ! sudo ufw status | grep -q "Status: active"; then
        sudo ufw --force enable
    fi
    
    print_success "Firewall configured successfully."
}

# Main function
main() {
    print_section "Nullexa Deployment Script"
    
    # Check if running on Ubuntu
    if ! grep -q "Ubuntu" /etc/os-release; then
        print_warning "This script is designed for Ubuntu. You may encounter issues on other distributions."
        if ! ask_yes_no "Do you want to continue anyway?"; then
            print_message "Deployment cancelled." "$YELLOW"
            exit 0
        fi
    fi
    
    # Update system packages
    print_section "Updating System Packages"
    sudo apt update
    sudo apt upgrade -y
    
    # Configure firewall
    configure_firewall
    
    # Ask for deployment method
    print_section "Deployment Method"
    echo "1) Docker Deployment (recommended)"
    echo "2) Direct Deployment (without Docker)"
    
    while true; do
        read -p "Select deployment method (1/2): " method
        case $method in
            1) 
                # Check if Docker is installed
                if ! check_docker; then
                    install_docker
                fi
                deploy_with_docker
                break
                ;;
            2) 
                deploy_directly
                break
                ;;
            *) echo "Please enter 1 or 2.";;  # Invalid input
        esac
    done
    
    # Ask if user wants to configure Nginx
    if ask_yes_no "Do you want to configure Nginx as a reverse proxy?"; then
        install_nginx
        
        # Ask for domain name
        read -p "Enter your domain name (or leave blank to use server IP): " domain
        if [ -z "$domain" ]; then
            domain=$(curl -s ifconfig.me)
        fi
      configure_nginx "$domain" 3000
        
        # Ask if user wants to set up HTTPS
        if ask_yes_no "Do you want to set up HTTPS with Let's Encrypt?"; then
            setup_https "$domain"
            print_success "Nullexa is now accessible at https://$domain"
        else
            print_success "Nullexa is now accessible at http://$domain"
        fi
    else
        print_success "Nullexa is now running locally. You can access it at http://localhost:3000"
    fi
    
    print_section "Deployment Complete"
    print_message "Thank you for using the Nullexa Deployment Script!" "$GREEN"
}

# Run the main function
main