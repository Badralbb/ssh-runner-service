module.exports = {
  apps: [
    {
      name: "ssh-runner-service",
      script: "dist/index.js",
      cwd: "/home/admin/pinebaatars/ssh-runner-service",
      env_file: ".env",
      restart_delay: 3000,
      max_restarts: 10,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "logs/out.log",
      error_file: "logs/error.log",
    },
  ],
};
