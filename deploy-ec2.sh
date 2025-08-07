#!/bin/bash
set -e

echo "🚀 Deploying SpareRoom Bot to EC2..."

# Update system
echo "📦 Updating system packages..."
sudo yum update -y

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
    sudo yum install -y nodejs
fi

# Install Chrome/Chromium
if ! command -v google-chrome-stable &> /dev/null && ! command -v chromium-browser &> /dev/null; then
    echo "🌐 Installing Chromium browser..."
    sudo yum install -y chromium
fi

# Set Chrome path
CHROME_PATH=$(which google-chrome-stable || which chromium-browser || which chromium || echo "")
if [ -n "$CHROME_PATH" ]; then
    echo "✅ Found Chrome at: $CHROME_PATH"
    export CHROME_PATH
else
    echo "❌ Chrome/Chromium not found! Please install manually."
    exit 1
fi

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install --production

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️ Creating .env file template..."
    cat > .env << EOL
TELEGRAM_BOT_TOKEN=your_bot_token_here
CHAT_ID=your_chat_id_here
ZOOPLA_COOKIES=your_cookies_if_needed
CHECK_INTERVAL_SECONDS=20
BROWSER_POOL_SIZE=1
CHROME_PATH=$CHROME_PATH
EOL
    echo "⚠️ Please edit .env with your configuration before starting the service!"
fi

# Create systemd service
echo "⚙️ Creating systemd service..."
sudo tee /etc/systemd/system/srbot.service > /dev/null << EOL
[Unit]
Description=SpareRoom Bot
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=$(pwd)/.env

[Install]
WantedBy=multi-user.target
EOL

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable srbot

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env with your Telegram bot token and chat ID"
echo "2. Start the service: sudo systemctl start srbot"
echo "3. Check status: sudo systemctl status srbot" 
echo "4. View logs: sudo journalctl -u srbot -f"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start srbot"
echo "  Stop:    sudo systemctl stop srbot"
echo "  Restart: sudo systemctl restart srbot"
echo "  Status:  sudo systemctl status srbot"
echo "  Logs:    sudo journalctl -u srbot -f"