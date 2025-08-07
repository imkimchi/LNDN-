#!/usr/bin/env node

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkSystem() {
    console.log('🔍 System Health Check\n');
    
    // Check Node.js version
    console.log('Node.js version:', process.version);
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    console.log('Memory usage:', {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`
    });
    
    // Check system memory
    try {
        const { stdout } = await execAsync('free -h');
        console.log('\nSystem Memory:');
        console.log(stdout);
    } catch (error) {
        console.log('⚠️ Could not check system memory (not Linux)');
    }
    
    // Check Chrome availability
    const chromePaths = [
        process.env.CHROME_PATH,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ].filter(Boolean);
    
    console.log('\n🌐 Browser Check:');
    let chromeFound = false;
    for (const path of chromePaths) {
        if (fs.existsSync(path)) {
            console.log(`✅ Found Chrome at: ${path}`);
            chromeFound = true;
            break;
        }
    }
    
    if (!chromeFound) {
        console.log('❌ Chrome/Chromium not found!');
        console.log('Install with: sudo yum install -y chromium');
    }
    
    // Check required environment variables
    console.log('\n⚙️ Environment Variables:');
    const required = ['TELEGRAM_BOT_TOKEN', 'CHAT_ID'];
    const optional = ['ZOOPLA_COOKIES', 'CHECK_INTERVAL_SECONDS', 'BROWSER_POOL_SIZE', 'CHROME_PATH'];
    
    for (const key of required) {
        const value = process.env[key];
        console.log(`${value ? '✅' : '❌'} ${key}: ${value ? '[SET]' : '[MISSING]'}`);
    }
    
    for (const key of optional) {
        const value = process.env[key];
        console.log(`ℹ️  ${key}: ${value || '[NOT SET]'}`);
    }
    
    // Check config files
    console.log('\n📁 Configuration Files:');
    const configFiles = [
        './config/searches.json',
        './.env',
        './package.json'
    ];
    
    for (const file of configFiles) {
        const exists = fs.existsSync(file);
        console.log(`${exists ? '✅' : '❌'} ${file}: ${exists ? 'EXISTS' : 'MISSING'}`);
    }
    
    // Check listings directory
    const listingsDir = './listings';
    if (fs.existsSync(listingsDir)) {
        const files = fs.readdirSync(listingsDir);
        console.log(`✅ Listings directory: ${files.length} files`);
    } else {
        console.log('❌ Listings directory: MISSING');
    }
    
    // Check if service is running (Linux only)
    try {
        const { stdout } = await execAsync('systemctl is-active srbot 2>/dev/null || echo "not-running"');
        const status = stdout.trim();
        console.log(`\n🔧 Service Status: ${status === 'active' ? '✅ RUNNING' : '❌ NOT RUNNING'}`);
    } catch (error) {
        console.log('\nℹ️ Service status: Cannot check (not systemd)');
    }
    
    console.log('\n✅ Health check complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    checkSystem().catch(console.error);
}