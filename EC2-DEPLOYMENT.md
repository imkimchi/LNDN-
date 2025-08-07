# EC2 Deployment Guide

## Key EC2 Compatibility Issues & Solutions

### 1. Puppeteer/Chrome Dependencies

**Issue**: EC2 instances don't have Chrome/Chromium installed by default.

**Solutions**:
```bash
# Install Chrome on Amazon Linux 2
sudo yum update -y
sudo yum install -y chromium

# Or install Chrome manually:
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt update
sudo apt install -y google-chrome-stable
```

**Code Fix**: Update browserPool.js to find Chrome executable:
```javascript
const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
    ]
});
```

### 2. Memory Management

**Issue**: EC2 t2.micro (1GB RAM) may be insufficient for Puppeteer.

**Recommendations**:
- Use at least t3.small (2GB RAM) for reliable operation
- Monitor memory usage with `top` or `htop`
- Consider reducing BROWSER_POOL_SIZE to 1 for smaller instances

### 3. Environment Variables

**Required Variables**:
```bash
# Create /home/ec2-user/.env
TELEGRAM_BOT_TOKEN=your_bot_token
CHAT_ID=your_chat_id
ZOOPLA_COOKIES=your_cookies_if_needed
CHECK_INTERVAL_SECONDS=20
BROWSER_POOL_SIZE=1
CHROME_PATH=/usr/bin/google-chrome-stable
```

### 4. File Permissions & Storage

**Setup Commands**:
```bash
# Create application directory
sudo mkdir -p /opt/srbot
sudo chown ec2-user:ec2-user /opt/srbot

# Create listings directory with proper permissions
mkdir -p /opt/srbot/listings
chmod 755 /opt/srbot/listings
```

### 5. Process Management

**SystemD Service** (`/etc/systemd/system/srbot.service`):
```ini
[Unit]
Description=SpareRoom Bot
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/srbot
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/srbot/.env

[Install]
WantedBy=multi-user.target
```

**Enable and start**:
```bash
sudo systemctl enable srbot
sudo systemctl start srbot
sudo systemctl status srbot
```

### 6. Networking & Security

**Security Group Rules**:
- Outbound HTTPS (443) - for Telegram API, website scraping
- Outbound HTTP (80) - for website scraping
- No inbound ports needed (outbound-only application)

**Domain Access**:
- api.telegram.org (Telegram API)
- www.spareroom.co.uk
- www.rightmove.co.uk  
- www.zoopla.co.uk
- www.foxtons.co.uk

### 7. Monitoring & Logs

**Log Management**:
```bash
# View logs
sudo journalctl -u srbot -f

# Log rotation
sudo systemctl enable logrotate
```

**Health Monitoring**:
Add to crontab for basic monitoring:
```bash
*/5 * * * * systemctl is-active --quiet srbot || systemctl restart srbot
```

### 8. Deployment Script

Create `deploy.sh`:
```bash
#!/bin/bash
set -e

# Install Node.js (if not installed)
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs

# Install Chrome
sudo yum install -y chromium

# Install application dependencies
npm install --production

# Set up environment
cp .env.example .env
echo "Please edit .env with your configuration"

# Create systemd service
sudo cp srbot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable srbot

echo "Deployment complete. Edit .env and run: sudo systemctl start srbot"
```

### 9. Resource Optimization

**For t2.micro instances**:
- Set BROWSER_POOL_SIZE=1
- Increase CHECK_INTERVAL_SECONDS=30 (reduce frequency)
- Monitor with: `watch -n 1 'free -h && ps aux | grep node'`

**For production**:
- Use t3.small or larger
- BROWSER_POOL_SIZE=2-3
- Set up CloudWatch monitoring
- Configure auto-scaling if needed

### 10. Common Issues & Solutions

**Chrome not found**:
```bash
# Find Chrome path
which google-chrome-stable || which chromium-browser || which chromium

# Set in environment
export CHROME_PATH=/usr/bin/chromium
```

**Memory issues**:
```bash
# Check memory usage
free -h
ps aux --sort=-%mem | head

# Restart service if memory is low
sudo systemctl restart srbot
```

**Permission denied**:
```bash
# Fix file permissions
sudo chown -R ec2-user:ec2-user /opt/srbot
chmod +x /opt/srbot/index.js
```

This deployment guide ensures your rental monitoring bot runs reliably on EC2 with proper resource management and error handling.