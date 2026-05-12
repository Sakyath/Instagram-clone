# Instagram Clone - Railway Deployment

## Project Structure

```
/
├── backend/           ← Node.js/TypeScript backend (Railway deploys this)
│   ├── dist/          ← Pre-compiled JavaScript (no build step needed)
│   ├── src/           ← TypeScript source files
│   ├── data/          ← SQLite database (auto-created on first run)
│   ├── uploads/       ← User uploaded images
│   └── package.json
├── frontend/
│   └── dist/          ← Pre-built React app (served by backend)
├── Procfile           ← Railway start command
├── nixpacks.toml      ← Railway build config (skips TypeScript compile)
└── package.json
```

## Railway Deployment Steps

1. Push this folder to a GitHub repository (just the contents, no subfolder)
2. Go to [Railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repository
4. Add environment variables in Railway dashboard:
   - `JWT_SECRET` → any long random string (e.g. `my-super-secret-jwt-key-2024`)
   - `NODE_ENV` → `production`
   - `PORT` → Railway sets this automatically
5. Click Deploy

## Why this works (what was fixed)

- **Root package.json**: Removed invalid `typescript: ^6.0.3` (doesn't exist)
- **Procfile**: Changed from `npm run build && npm start` to just `npm install && npm start`
- **nixpacks.toml**: Tells Railway to skip `tsc` and use pre-compiled `dist/`
- **backend/package.json**: Cleaned up, removed `express4` dummy package, fixed versions
- **Pre-compiled dist/**: Already in repo — Railway just runs `node dist/server.js`

## Local Development

```bash
cd backend
npm install
node dist/server.js  # runs pre-compiled version
# OR for TypeScript dev:
npm run dev          # uses ts-node
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3001 | Server port (Railway auto-sets) |
| `JWT_SECRET` | Yes | insecure default | **Set this in Railway!** |
| `NODE_ENV` | No | development | Set to `production` |
