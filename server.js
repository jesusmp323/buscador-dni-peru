// ============================================
// DNI PERU BUSCADOR — Proxy Server
// Serves static files + proxies API requests
// to buscardniperu.com to avoid CORS issues
// ============================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const API_HOST = 'buscardniperu.com';
const API_PATH = '/wp-admin/admin-ajax.php';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    // CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Proxy API requests
    if (req.url === '/api/consulta' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            const options = {
                hostname: API_HOST,
                port: 443,
                path: API_PATH,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'Content-Length': Buffer.byteLength(body),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://buscardniperu.com',
                    'Referer': 'https://buscardniperu.com/buscar-dni-por-nombres/',
                },
            };

            const proxyReq = https.request(options, (proxyRes) => {
                let data = '';
                proxyRes.on('data', chunk => { data += chunk; });
                proxyRes.on('end', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(data);
                });
            });

            proxyReq.on('error', (err) => {
                console.error('Proxy error:', err.message);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, data: 'Error de conexión con el servidor' }));
            });

            proxyReq.write(body);
            proxyReq.end();
        });
        return;
    }

    // Serve static files
    let filePath = req.url === '/' ? '/index.html' : url.parse(req.url).pathname;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║   🔍 BUSCADOR DE DNI PERÚ — Servidor        ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║   🌐 http://localhost:${PORT}                   ║`);
    console.log('  ║   📡 Proxy API activo                        ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    console.log('  Presiona Ctrl+C para detener el servidor');
    console.log('');
});
