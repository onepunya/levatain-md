// pm2 config: `pm2 start ecosystem.config.cjs && pm2 save`
module.exports = {
  apps: [
    {
      name: 'levatain-md',
      script: 'index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: '800M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
