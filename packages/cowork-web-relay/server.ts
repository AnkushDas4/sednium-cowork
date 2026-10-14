import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sendHandler from './api/send.js';
import presenceHandler from './api/presence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, '../../.env') });
const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// API Routes
app.all('/api/send', async (req, res) => {
  return sendHandler(req, res);
});

app.all('/api/presence', async (req, res) => {
  return presenceHandler(req, res);
});

// Frontend Serving
if (!isProd) {
  // Development: Mount Vite server middleware
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
    root: __dirname,
  });
  app.use(vite.middlewares);
} else {
  // Production: Serve built assets from dist
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\x1b[32m✔ Sednium CoWork Relay & UI running on http://localhost:${PORT}\x1b[0m`);
    console.log(`  Endpoints:`);
    console.log(`  - POST http://localhost:${PORT}/api/send`);
    console.log(`  - GET  http://localhost:${PORT}/api/presence`);
  });
}

export default app;
