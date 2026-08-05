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

        // --- MANEJO DE CONSULTA POR DNI (Datos Extra) ---
        if (reqBody.tipo === 'dni') {
            const dni = reqBody.dni;
            if (!dni) return res.status(200).json({ success: false, data: { message: 'DNI requerido' } });

            // Helper para obtener datos de dniperu
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

            // Hacer las 3 consultas en paralelo
            const [fechaRes, nombresRes, ubigeoRes] = await Promise.all([
                fetchDniPeruData('buscar_fecha', 'buscar_fecha', 'dni'),
                fetchDniPeruData('buscar_nombres', 'buscar_nombres', 'dni4'),
                fetchDniPeruData('buscar_ubigeo', 'buscar_ubigeo', 'dni')
            ]);

            let fecha_nac = '';
            let verificador = '';
            let ubigeo = '';

            if (fechaRes && fechaRes.success && fechaRes.data) {
                fecha_nac = fechaRes.data.fechaNacimiento || '';
            }
            if (nombresRes && nombresRes.success && nombresRes.data && nombresRes.data.message) {
                const match = nombresRes.data.message.match(/Codigo de Verificacion:\s*(\d)/i);
                if (match) verificador = match[1];
            }
            if (ubigeoRes && ubigeoRes.success && ubigeoRes.data) {
                ubigeo = ubigeoRes.data.ubigeo || '';
            }

            return res.status(200).json({
                success: true,
                data: {
                    fecha_nac,
                    verificador,
                    ubigeo
                }
            });
        }

        // --- MANEJO DE CONSULTA POR NOMBRES (Original) ---
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

        const rawData = await searchResponse.json();
        
        // Map response to match the old API format expected by the frontend
        if (rawData.success && rawData.data && rawData.data.resultados) {
            const mappedData = rawData.data.resultados.map(p => ({
                dni: p.numero,
                nombres: p.nombres,
                ap_pat: p.apellido_paterno,
                ap_mat: p.apellido_materno
            }));
            res.status(200).json({ success: true, data: mappedData });
        } else {
            res.status(200).json({ success: false, data: rawData.message || 'No se encontraron resultados' });
        }
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(502).json({ success: false, data: 'Error interno en el proxy de Vercel' });
    }
};
