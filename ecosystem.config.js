// PM2 process definition for production. Run from the repo root on the VPS:
//   pm2 startOrReload ecosystem.config.js --only apitours-api --update-env
//
// APP_DIR defaults to the checkout location used by deploy/deploy.sh.
const path = require('path');

const appDir = process.env.APP_DIR || '/var/www/apitours/app';

module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || 'apitours-api',
      cwd: appDir,
      // `strapi start` serves the prebuilt app; NODE_ENV=production is required
      // so Strapi does not try to rebuild the admin panel on boot.
      script: 'node_modules/.bin/strapi',
      args: 'start',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 5000,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '1337',
      },
      out_file: path.join(appDir, 'logs/out.log'),
      error_file: path.join(appDir, 'logs/error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
