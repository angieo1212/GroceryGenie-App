export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const results = { kroger: [], walmart: [], amazon: [] };
  const errors = {};

  // --- KROGER ---
  try {
    const krogerClientId = process.env.KROGER_CLIENT_ID;
    const krogerClientSecret = process.env.KROGER_CLIENT_SECRET;

    if (!krogerClientId || !krogerClientSecret) {
      errors.kroger = 'Missing Kroger credentials';
    } else {
      const credentials = Buffer.from(`${krogerClientId}:${krogerClientSecret}`).toString('base64');

      const tokenRes = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: 'grant_type=client_credentials&scope=product.compact'
      });

      const tokenData = await tokenRes.json();

      if (tokenData.access_token) {
        const productRes = await fetch(
          `https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(query)}&filter.limit=5`,
          {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Accept': 'application/json'
            }
          }
        );

        const productData = await productRes.json();

        results.kroger = (productData.data || [])
          .filter(p => p.items?.[0]?.price?.regular)
          .slice(0, 3)
          .map(p => ({
            name: p.description,
            price: p.items[0].price.regular,
            image: p.images?.[0]?.sizes?.find(s => s.size === 'thumbnail')?.url || p.images?.[0]?.sizes?.[0]?.url,
            store: 'Kroger'
          }));
      } else {
        errors.kroger = tokenData.error_description || 'Token failed';
      }
    }
  } catch (e) {
    errors.kroger = e.message;
  }

  // --- WALMART via RapidAPI ---
  try {
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiKey) {
      errors.walmart = 'Missing RapidAPI key';
    } else {
      const walmartRes = await fetch(
        `https://api-to-find-grocery-prices.p.rapidapi.com/walmart?query=${encodeURIComponent(query)}&country=us&page=1`,
        {
          headers: {
            'x-rapidapi-host': 'api-to-find-grocery-prices.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey
          }
        }
      );

      const walmartText = await walmartRes.text();
      let walmartData;
      try { walmartData = JSON.parse(walmartText); } catch(e) { walmartData = null; }

      // Try multiple response shapes
      const walmartProducts = walmartData?.products || walmartData?.items || walmartData?.data || [];
      results.walmart = walmartProducts.slice(0, 3).map(p => ({
        name: p.title || p.name || p.product_title,
        price: p.price || p.sale_price || p.regular_price || p.current_price,
        image: p.thumbnail || p.image || p.image_url,
        store: 'Walmart'
      })).filter(p => p.name && p.price);

      if (results.walmart.length === 0) {
        errors.walmart_debug = JSON.stringify(walmartData).substring(0, 300);
      }
    }
  } catch (e) {
    errors.walmart = e.message;
  }

  // --- AMAZON via RapidAPI ---
  try {
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiKey) {
      errors.amazon = 'Missing RapidAPI key';
    } else {
      const amazonRes = await fetch(
        `https://api-to-find-grocery-prices.p.rapidapi.com/amazon?query=${encodeURIComponent(query)}&country=us&page=1`,
        {
          headers: {
            'x-rapidapi-host': 'api-to-find-grocery-prices.p.rapidapi.com',
            'x-rapidapi-key': rapidApiKey
          }
        }
      );

      const amazonText = await amazonRes.text();
      let amazonData;
      try { amazonData = JSON.parse(amazonText); } catch(e) { amazonData = null; }

      // Try multiple response shapes
      const amazonProducts = amazonData?.products || amazonData?.items || amazonData?.data || [];
      results.amazon = amazonProducts.slice(0, 3).map(p => ({
        name: p.title || p.name || p.product_title,
        price: p.price || p.sale_price || p.regular_price || p.current_price,
        image: p.thumbnail || p.image || p.image_url,
        store: 'Amazon'
      })).filter(p => p.name && p.price);

      if (results.amazon.length === 0) {
        errors.amazon_debug = JSON.stringify(amazonData).substring(0, 300);
      }
    }
  } catch (e) {
    errors.amazon = e.message;
  }

  res.status(200).json({ ...results, _debug: errors });
}
