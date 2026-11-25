import {defineConfig} from 'vite';
import {readFile} from 'node:fs/promises';

// Relative assets work both at localhost/ and GitHub Pages' /seatlink/ path.
export default defineConfig({
  base: './',
  server: {
    fs: {
      // Keep Vite's standard exclusions and block direct access to local experiment output.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.qa/**'],
    },
  },
  plugins: [{
    name: 'seatlink-local-replay',
    configureServer(server) {
      server.middlewares.use('/__seatlink/c200-replay', async (request, response, next) => {
        if (request.method !== 'GET') return next();
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
        if (!local) {
          response.writeHead(404).end();
          return;
        }
        try {
          const summary = await readFile(new URL('./.qa/c200-incremental.json', import.meta.url));
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(summary);
        } catch (error) {
          response.writeHead(error.code === 'ENOENT' ? 204 : 500).end();
        }
      });
    },
  }],
});
