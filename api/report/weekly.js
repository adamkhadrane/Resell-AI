// api/report/weekly.js — Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Get eBay token
    const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64'),
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    });

    const tokenData = await tokenRes.json();
    const access_token = tokenData.access_token;

    if (!access_token) {
      throw new Error('Failed to get eBay token: ' + JSON.stringify(tokenData));
    }

    // Fetch trending categories
    const categories = ['jordan sneakers', 'pokemon cards', 'vintage streetwear', 'iphone', 'supreme'];
    const allItems = [];

    for (const cat of categories) {
      try {
        const searchRes = await fetch(
          `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(cat)}&limit=5&sort=PRICE_DESC`,
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            },
          }
        );
        const data = await searchRes.json();
        if (data.itemSummaries) allItems.push(...data.itemSummaries);
      } catch (e) {
        console.error(`eBay search failed for "${cat}":`, e.message);
      }
    }

    const itemSummary = allItems.slice(0, 25).map((i) => ({
      title: i.title,
      price: i.price?.value,
      category: i.categories?.[0]?.categoryName || 'General',
    }));

    // Try Gemini for AI analysis
    let flips = [];

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a reselling expert. Based on these eBay items currently selling at high prices, identify the top 10 best flip opportunities for resellers. For each, provide: rank, title, category, buyPrice (estimated retail/thrift cost as a number), sellPrice (current eBay price as a number), profit (estimated after 13% fees as a number), tip (1 sentence why it's hot). Return ONLY a valid JSON array, no markdown, no explanation, no backticks. Items: ${JSON.stringify(itemSummary)}`,
              }],
            }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 1500,
            },
          }),
        }
      );

      const geminiData = await geminiRes.json();
      console.log('Gemini response status:', geminiRes.status);

      if (geminiData.error) {
        console.error('Gemini error:', JSON.stringify(geminiData.error));
      } else {
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('Gemini raw text length:', rawText.length);
        const cleanJson = rawText.replace(/```json|```/g, '').trim();
        if (cleanJson) {
          flips = JSON.parse(cleanJson);
        }
      }
    } catch (aiErr) {
      console.error('Gemini analysis failed:', aiErr.message);
    }

    // Fallback: compute from raw eBay data if Gemini failed or returned nothing
    if (!flips || flips.length === 0) {
      console.log('Using computed fallback, itemSummary count:', itemSummary.length);
      flips = itemSummary
        .filter(item => parseFloat(item.price) > 20)
        .slice(0, 10)
        .map((item, i) => {
          const sellPrice = parseFloat(item.price);
          const buyPrice = parseFloat((sellPrice * 0.35).toFixed(2));
          const profit = Math.max(parseFloat((sellPrice * 0.87 - buyPrice - 4).toFixed(2)), 1);
          return {
            rank: i + 1,
            title: item.title,
            category: item.category,
            buyPrice,
            sellPrice,
            profit: profit.toFixed(2),
            tip: 'High-demand item with strong resale market on eBay.',
          };
        });
    }

    return res.status(200).json({
      weekOf: new Date().toISOString().split('T')[0],
      flips,
      generatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('Weekly report error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
