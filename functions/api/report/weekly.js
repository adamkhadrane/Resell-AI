// functions/api/report/weekly.js
// Generates weekly flip report using eBay data + Gemini AI analysis

export async function onRequestGet(context) {
  const { env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    // 1. Get eBay token
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${env.EBAY_APP_ID}:${env.EBAY_CERT_ID}`),
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });
    const { access_token } = await tokenRes.json();

    // 2. Fetch hot categories
    const categories = ["jordan sneakers", "pokemon cards", "vintage streetwear", "iphone", "supreme"];
    const allItems = [];

    for (const cat of categories) {
      const res = await fetch(
        `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(cat)}&limit=5&sort=PRICE_DESC`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          },
        }
      );
      const data = await res.json();
      if (data.itemSummaries) allItems.push(...data.itemSummaries);
    }

    // 3. Send to Gemini for analysis
    const itemSummary = allItems.slice(0, 25).map((i) => ({
      title: i.title,
      price: i.price?.value,
      category: i.categories?.[0]?.categoryName,
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are a reselling expert. Based on these eBay items currently selling at high prices, identify the top 10 best flip opportunities for teen resellers. For each, provide: title, category, estimated buy price (retail/thrift), current sell price, estimated profit, and a 1-sentence why-it's-hot tip. Return as JSON array with fields: rank, title, category, buyPrice, sellPrice, profit, tip. Items: ${JSON.stringify(itemSummary)}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const cleanJson = rawText.replace(/```json|```/g, "").trim();

    let flips = [];
    try {
      flips = JSON.parse(cleanJson);
    } catch {
      flips = itemSummary.slice(0, 10).map((item, i) => ({
        rank: i + 1,
        title: item.title,
        category: item.category || "General",
        buyPrice: (parseFloat(item.price) * 0.4).toFixed(2),
        sellPrice: item.price,
        profit: (parseFloat(item.price) * 0.6 * 0.87 - 8.99).toFixed(2),
        tip: "High demand item with strong resale market.",
      }));
    }

    return new Response(
      JSON.stringify({
        weekOf: new Date().toISOString().split("T")[0],
        flips,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
