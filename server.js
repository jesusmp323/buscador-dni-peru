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
const querystring = require('querystring');

const PORT = 8080;
const API_HOST = 'dniperu.com';
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
        req.on('end', async () => {
            try {
                const parsedBody = querystring.parse(body);

                if (parsedBody.tipo === 'dni') {
                    // dniperu.com doesn't support exact DNI lookup, return empty or mock error
                    // We return { success: false } so the frontend ignores the age request gracefully
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, data: { message: 'Búsqueda por DNI no soportada' } }));
                    return;
                }

                // 1. Fetch token and cookie
                const tokenPostData = querystring.stringify({
                    action: 'cc_get_tokens',
                    context: 'buscar_dni',
                    company: '',
                    count: '1'
                });

                const tokenOptions = {
                    hostname: API_HOST,
                    port: 443,
                    path: API_PATH,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Content-Length': Buffer.byteLength(tokenPostData),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Origin': 'https://dniperu.com',
                        'Referer': 'https://dniperu.com/buscar-dni-por-nombre/',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                };

                const tokenData = await new Promise((resolve, reject) => {
                    const tokenReq = https.request(tokenOptions, (tokenRes) => {
                        let data = '';
                        let cookie = '';
                        const setCookie = tokenRes.headers['set-cookie'];
                        if (setCookie && setCookie.length > 0) {
                            cookie = setCookie[0].split(';')[0];
                        }
                        tokenRes.on('data', chunk => { data += chunk; });
                        tokenRes.on('end', () => {
                            try {
                                const json = JSON.parse(data);
                                json.cookie = cookie;
                                resolve(json);
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });
                    tokenReq.on('error', reject);
                    tokenReq.write(tokenPostData);
                    tokenReq.end();
                });

                if (!tokenData || !tokenData.data || !tokenData.data.cc_token) {
                    throw new Error('No se pudo obtener el token de búsqueda');
                }

                // 2. Perform search
                const searchPostData = querystring.stringify({
                    action: 'buscar_dni',
                    tipo: 'nombre',
                    nombres: parsedBody.nombres || '',
                    apellido_paterno: parsedBody.ap_pat || '',
                    apellido_materno: parsedBody.ap_mat || '',
                    company: '',
                    cc_token: tokenData.data.cc_token,
                    cc_sig: tokenData.data.cc_sig
                });

                const searchOptions = {
                    hostname: API_HOST,
                    port: 443,
                    path: API_PATH,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Content-Length': Buffer.byteLength(searchPostData),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Origin': 'https://dniperu.com',
                        'Referer': 'https://dniperu.com/buscar-dni-por-nombre/',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                };

                if (tokenData.cookie) {
                    searchOptions.headers['Cookie'] = tokenData.cookie;
                }

                const searchReq = https.request(searchOptions, (searchRes) => {
                    let data = '';
                    searchRes.on('data', chunk => { data += chunk; });
                    searchRes.on('end', () => {
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(data);
                    });
                });

                searchReq.on('error', (err) => {
                    console.error('Proxy error on search:', err.message);
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, data: 'Error de conexión con el servidor de búsqueda' }));
                });

                searchReq.write(searchPostData);
                searchReq.end();

            } catch (err) {
                console.error('Proxy overall error:', err.message);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, data: 'Error interno en el proxy' }));
            }
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
