// api/ebay/sold.js — Vercel Edge Function

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'sneakers';

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
    });
  }

  try {
    const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + btoa(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`),
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    });

    const { access_token } = await tokenRes.json();

    const searchRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=10&sort=PRICE_DESC`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      }
    );

    const data = await searchRes.json();
    const soldItems = (data.itemSummaries || []).map((item) => ({
      id: item.itemId,
      title: item.title,
      soldPrice: parseFloat(item.price?.value || 0).toFixed(2),
      image: item.image?.imageUrl || '',
      url: item.itemWebUrl,
    }));

    return new Response(JSON.stringify({ soldItems }), {
      status: 200, headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    });
  }
}
