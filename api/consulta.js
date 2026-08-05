module.exports = async function(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        let reqBody = req.body || {};
        if (typeof req.body === 'string') {
            const params = new URLSearchParams(req.body);
            reqBody = Object.fromEntries(params);
        }

        if (reqBody.tipo === 'dni') {
            res.status(200).json({ success: false, data: { message: 'Búsqueda por DNI no soportada' } });
            return;
        }

        // 1. Fetch token and cookie
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

        // 2. Perform search
        const searchParams = new URLSearchParams({
            action: 'buscar_dni',
            tipo: 'nombre',
            nombres: reqBody.nombres || '',
            apellido_paterno: reqBody.ap_pat || '',
            apellido_materno: reqBody.ap_mat || '',
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

        const data = await searchResponse.text();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(searchResponse.status).send(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(502).json({ success: false, data: 'Error interno en el proxy de Vercel' });
    }
};
