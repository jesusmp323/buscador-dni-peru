// ============================================
// DNI PERU BUSCADOR — Proxy Server
// Serves static files + proxies API requests
// to buscardniperu.com to avoid CORS issues
// ============================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');

const PORT = 8080;

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

const server = http.createServer(async (req, res) => {
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

                // --- MANEJO DE CONSULTA POR DNI (Datos Extra) ---
                if (parsedBody.tipo === 'dni') {
                    const dni = parsedBody.dni;
                    if (!dni) {
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ success: false, data: { message: 'DNI requerido' } }));
                        return;
                    }

                    const fetchDniPeruData = async (context, action, inputField) => {
                        try {
                            const tokenParams = new URLSearchParams({ action: 'cc_get_tokens', context: context, company: '', count: '1' });
                            const headers = {
                                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Origin': 'https://dniperu.com',
                                'Referer': `https://dniperu.com/${action === 'buscar_nombres' ? 'digito-verificador-dni' : action === 'buscar_fecha' ? 'saber-edad-con-dni' : 'buscar-ubigeo-dni'}/`,
                                'X-Requested-With': 'XMLHttpRequest'
                            };

                            const tokenRes = await fetch('https://dniperu.com/wp-admin/admin-ajax.php', { method: 'POST', headers: headers, body: tokenParams.toString() });
                            const tokenData = await tokenRes.json();
                            
                            let cookie = '';
                            const setCookieHeader = tokenRes.headers.get('set-cookie');
                            if (setCookieHeader) cookie = setCookieHeader.split(';')[0];
                            
                            if (!tokenData || !tokenData.data || !tokenData.data.cc_token) return null;

                            const searchParams = new URLSearchParams({ action: action, [inputField]: dni, cc_token: tokenData.data.cc_token, cc_sig: tokenData.data.cc_sig });
                            const searchHeaders = { ...headers };
                            if (cookie) searchHeaders['Cookie'] = cookie;
                            
                            const searchRes = await fetch('https://dniperu.com/wp-admin/admin-ajax.php', { method: 'POST', headers: searchHeaders, body: searchParams.toString() });
                            return await searchRes.json();
                        } catch (e) {
                            console.error(`Error fetching ${action}:`, e);
                            return null;
                        }
                    };

                    const [fechaRes, nombresRes] = await Promise.all([
                        fetchDniPeruData('buscar_fecha', 'buscar_fecha', 'dni'),
                        fetchDniPeruData('buscar_nombres', 'buscar_nombres', 'dni4')
                    ]);

                    let fecha_nac = '';
                    let verificador = '';

                    if (fechaRes && fechaRes.success && fechaRes.data) {
                        fecha_nac = fechaRes.data.fechaNacimiento || '';
                    }
                    if (nombresRes && nombresRes.success && nombresRes.data && nombresRes.data.message) {
                        const match = nombresRes.data.message.match(/Codigo de Verificacion:\s*(\d)/i);
                        if (match) verificador = match[1];
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        success: true,
                        data: {
                            fecha_nac,
                            verificador
                        }
                    }));
                    return;
                }

                // --- MANEJO DE CONSULTA POR NOMBRES (Original) ---
                const tokenParams = new URLSearchParams({
                    action: 'cc_get_tokens',
                    context: 'buscar_dni',
                    company: '',
                    count: '1'
                });

                const tokenResponse = await fetch('https://dniperu.com/wp-admin/admin-ajax.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Origin': 'https://dniperu.com',
                        'Referer': 'https://dniperu.com/buscar-dni-por-nombre/',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: tokenParams.toString()
                });

                let cookie = '';
                const setCookieHeader = tokenResponse.headers.get('set-cookie');
                if (setCookieHeader) {
                    cookie = setCookieHeader.split(';')[0];
                }

                const tokenData = await tokenResponse.json();
                if (!tokenData || !tokenData.data || !tokenData.data.cc_token) {
                    throw new Error('No se pudo obtener el token de búsqueda');
                }

                const searchParams = new URLSearchParams({
                    action: 'buscar_dni',
                    tipo: 'nombre',
                    nombres: parsedBody.nombres || '',
                    apellido_paterno: parsedBody.ap_pat || '',
                    apellido_materno: parsedBody.ap_mat || '',
                    company: '',
                    cc_token: tokenData.data.cc_token,
                    cc_sig: tokenData.data.cc_sig
                });

                const searchHeaders = {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://dniperu.com',
                    'Referer': 'https://dniperu.com/buscar-dni-por-nombre/',
                    'X-Requested-With': 'XMLHttpRequest'
                };
                if (cookie) {
                    searchHeaders['Cookie'] = cookie;
                }

                const searchResponse = await fetch('https://dniperu.com/wp-admin/admin-ajax.php', {
                    method: 'POST',
                    headers: searchHeaders,
                    body: searchParams.toString()
                });

                const rawData = await searchResponse.json();
                
                if (rawData.success && rawData.data && rawData.data.resultados) {
                    const mappedData = rawData.data.resultados.map(p => ({
                        dni: p.numero,
                        nombres: p.nombres,
                        ap_pat: p.apellido_paterno,
                        ap_mat: p.apellido_materno
                    }));
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, data: mappedData }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, data: rawData.message || 'No se encontraron resultados' }));
                }

            } catch (err) {
                console.error('Proxy error:', err);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, data: 'Error interno en el proxy local' }));
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
