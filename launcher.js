const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const dashboardPort = Number(process.env.DASHBOARD_PORT || 5000);
const botApiPort = Number(process.env.SERVER_PORT || (dashboardPort === 3000 ? 3001 : 3000));
const internalApiSecret = process.env.BOT_INTERNAL_API_SECRET || crypto.randomBytes(32).toString('hex');

if (!Number.isInteger(dashboardPort) || !Number.isInteger(botApiPort) || dashboardPort === botApiPort) {
    throw new Error('DASHBOARD_PORT and SERVER_PORT must be valid, different ports.');
}

console.log('Starting MarkaBot and its dashboard...\n');

let botProcess = null;
let dashboardProcess = null;
let shuttingDown = false;

function startBot() {
    console.log(`Starting Discord bot and internal API on port ${botApiPort}...`);
    botProcess = spawn('node', ['index.js'], {
        stdio: 'inherit',
        cwd: __dirname,
        env: {
            ...process.env,
            SERVER_PORT: String(botApiPort),
            DASHBOARD_PORT: String(dashboardPort),
            BOT_INTERNAL_API_SECRET: internalApiSecret
        }
    });

    botProcess.on('error', (error) => {
        console.error('❌ Bot process error:', error);
    });

    botProcess.on('exit', (code) => {
        console.log(`🔴 Bot process exited with code ${code}`);
        if (!shuttingDown && code !== 0) {
            console.log('⚠️  Bot crashed. Dashboard will continue running.');
        }
        botProcess = null;
    });
}

function startDashboard() {
    console.log(`Starting Flask dashboard on port ${dashboardPort}...`);
    dashboardProcess = spawn(process.env.PYTHON_EXECUTABLE || 'python3', ['main.py'], {
        stdio: 'inherit',
        cwd: path.join(__dirname, 'dashboard'),
        env: {
            ...process.env,
            DASHBOARD_PORT: String(dashboardPort),
            SERVER_PORT: String(botApiPort),
            BOT_INTERNAL_API_SECRET: internalApiSecret,
            PYTHONUNBUFFERED: '1'
        }
    });

    dashboardProcess.on('error', (error) => {
        console.error('❌ Dashboard process error:', error);
    });

    dashboardProcess.on('exit', (code) => {
        console.log(`🔴 Dashboard process exited with code ${code}`);
        if (!shuttingDown && code !== 0) {
            console.log('⚠️  Dashboard crashed. Restarting in 5 seconds...');
            setTimeout(startDashboard, 5000);
        }
        dashboardProcess = null;
    });
}

function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    
    console.log('\n⚠️  Shutting down...');
    
    if (botProcess) {
        botProcess.kill('SIGTERM');
    }
    if (dashboardProcess) {
        dashboardProcess.kill('SIGTERM');
    }
    
    setTimeout(() => {
        process.exit(0);
    }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startBot();
setTimeout(startDashboard, 2000);
