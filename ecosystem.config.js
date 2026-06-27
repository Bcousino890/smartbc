module.exports = {
  apps: [
    {
      name: "smartbc-main",
      script: "node_modules/.bin/next",
      args: "start --port 3137",
      cwd: "/app/smartbc",
      env: {
        NODE_ENV: "production",
        PORT: 3137,
      },
      error_file: "logs/smartbc-main-error.log",
      out_file: "logs/smartbc-main-out.log",
    },
    {
      name: "smartbc-portal-web",
      script: "npm",
      args: "run preview",
      cwd: "/app/smartbc/portal-web",
      env: {
        NODE_ENV: "production",
        PORT: 3138,
      },
      error_file: "logs/portal-web-error.log",
      out_file: "logs/portal-web-out.log",
    },
  ],
};
