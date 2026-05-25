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
        // Vercel parses 'application/x-www-form-urlencoded' into req.body object automatically
        let bodyString = '';
        if (typeof req.body === 'object' && req.body !== null) {
            const params = new URLSearchParams();
            for (const key in req.body) {
                params.append(key, req.body[key]);
            }
            bodyString = params.toString();
        } else {
            bodyString = req.body || '';
        }

        const response = await fetch('https://buscardniperu.com/wp-admin/admin-ajax.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://buscardniperu.com',
                'Referer': 'https://buscardniperu.com/buscar-dni-por-nombres/'
            },
            body: bodyString
        });

        const data = await response.text();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(response.status).send(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(502).json({ success: false, data: 'Error de conexión con el servidor en Vercel' });
    }
};
