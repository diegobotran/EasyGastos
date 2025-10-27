module.exports = {
  apps: [{
    name: 'easygastos-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      MONGODB_URI: 'mongodb://localhost:27017/easygastos',
      JWT_SECRET: 'your-super-secure-jwt-secret',
      // Importante para port forwarding - escuchar en todas las interfaces
      BIND_IP: '0.0.0.0'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};