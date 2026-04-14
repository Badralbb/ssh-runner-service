# SSH Runner Service — Operations Guide

## Service Info

| Item    | Value                          |
|---------|--------------------------------|
| Name    | `ssh-runner-service`           |
| Port    | `3022`                         |
| URL     | `http://192.168.11.253:3022/`  |
| Entry   | `dist/index.js`                |
| PM2 ID  | `2`                            |

---

## Start

```bash
cd /home/admin/pinebaatars/ssh-runner-service
pm2 start ecosystem.config.js
```

---

## Stop

```bash
pm2 stop ssh-runner-service
```

---

## Restart

```bash
pm2 restart ssh-runner-service
```

---

## Reload (zero-downtime, picks up .env changes)

```bash
pm2 reload ssh-runner-service --update-env
```

---

## Status

```bash
pm2 status
```

---

## Logs

```bash
# Live tail
pm2 logs ssh-runner-service

# Last 100 lines
pm2 logs ssh-runner-service --lines 100

# Log files location
tail -f /home/admin/pinebaatars/ssh-runner-service/logs/out.log
tail -f /home/admin/pinebaatars/ssh-runner-service/logs/error.log
```

---

## Delete from PM2 (full removal)

```bash
pm2 delete ssh-runner-service
```

---

## Auto-start on Server Reboot

```bash
# Save current PM2 process list
pm2 save

# Generate and enable startup script (run once)
pm2 startup
# Then run the command it outputs (starts with: sudo env PATH=...)
```

---

## Update .env and Apply

1. Edit the file:
   ```bash
   nano /home/admin/pinebaatars/ssh-runner-service/.env
   ```
2. Reload the service:
   ```bash
   pm2 reload ssh-runner-service --update-env
   ```

---

## Update from Git & Deploy

> Safe to run while the service is live — reload is zero-downtime.

```bash
cd /home/admin/pinebaatars/ssh-runner-service

# 1. Pull latest code
git pull origin main

# 2. Install any new dependencies
npm install

# 3. Build TypeScript → dist/
npm run build

# 4. Reload service (picks up new dist/ with zero downtime)
pm2 reload ssh-runner-service --update-env
```

### If the service is not running yet (first time after a pull)

```bash
cd /home/admin/pinebaatars/ssh-runner-service
git pull origin main
npm install
npm run build
pm2 start ecosystem.config.js
pm2 save
```

---

## Quick Health Check

```bash
curl http://192.168.11.253:3022/
# Expected: {"ok":true,"message":"Use POST /run, GET /stations, or GET /user/:mac"}
```
