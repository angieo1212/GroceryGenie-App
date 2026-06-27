const https = require('https');

async function fetchKrogerToken() {
  const credentials = Buffer.from(
    `${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`
  ).toString('base64');

  return new Promise((resolve, reject) => {
    const postData = 'grant_type=client_credentials&scope=product.compact';
    const options = {
      hostname: 'api.kroger.com',
      path: '/v1/connect/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function fetchKrogerPrices(query, token) {
  return new Promise((resolve, reject) => {
    const path = `/v1/products?filter.term=${encodeURIComponent(query)}&filter.limit=5`;
    const options = {
      hostname: 'api.kroger.com',
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchRapidAPIPrice(query, store) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-to-find-grocery-prices.p.rapidapi.com',
      path: `/${store}?query=${encodeURIComponent(query)}&country=us&page=1`,
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'api-to-find-grocery-prices.p.rapidapi.com',
        'x-rapidapi-key': process.env.RAPIDAPI_KEY
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const [walmartData, amazonData, krogerToken] = await Promise.all([
      fetchRapidAPIPrice(query, 'walmart'),
      fetchRapidAPIPrice(query, 'amazon'),
      fetchKrogerToken()
    ]);

    const krogerData = krogerToken?.access_token
      ? await fetchKrogerPrices(query, krogerToken.access_token)
      : null;

    const results = {
      walmart: walmartData?.products?.slice(0, 3).map(p => ({
        name: p.title,
        price: p.price,
        image: p.thumbnail,
        store: 'Walmart'
      })) || [],
      amazon: amazonData?.products?.slice(0, 3).map(p => ({
        name: p.title,
        price: p.price,
        image: p.thumbnail,
        store: 'Amazon'
      })) || [],
      kroger: krogerData?.data?.slice(0, 3).map(p => ({
        name: p.description,
        price: p.items?.[0]?.price?.regular,
        image: p.images?.[0]?.sizes?.[0]?.url,
        store: 'Kroger'
      })).filter(p => p.price) || []
    };

    res.status(200).json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
