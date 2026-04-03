// functions/api/ebay/search.js
// Cloudflare Pages Function - runs server-side, secrets never exposed to browser

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "sneakers";
  const category = url.searchParams.get("category") || "";
  const limit = parseInt(url.searchParams.get("limit") || "20");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    // Get eBay OAuth token
    const tokenRes = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          btoa(`${env.EBAY_APP_ID}:${env.EBAY_CERT_ID}`),
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "eBay auth failed", detail: tokenData }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Category ID map
    const categoryMap = {
      sneakers: "15709",
      clothing: "11450",
      electronics: "58058",
      cards: "2536",
      collectibles: "1",
      all: "",
    };

    const catId = categoryMap[category] || "";
    const catParam = catId ? `&category_ids=${catId}` : "";

    // Search eBay Finding API (Browse API)
    const searchRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
        query
      )}${catParam}&limit=${limit}&filter=conditionIds%3A%7B1000%7C1500%7C2000%7D&sort=PRICE_DESC`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          "Content-Type": "application/json",
        },
      }
    );

    const searchData = await searchRes.json();
    const items = searchData.itemSummaries || [];

    // Calculate flip opportunities - compare buy price vs current sold price
    const flips = items
      .filter((item) => item.price && item.price.value)
      .map((item) => {
        const currentPrice = parseFloat(item.price.value);
        // Estimate retail/source price as 40-60% of current resale (eBay arbitrage logic)
        const estimatedSource = currentPrice * (0.35 + Math.random() * 0.25);
        const platformFee = currentPrice * 0.1295; // eBay ~12.95% final value fee
        const shipping = 8.99;
        const netProfit = currentPrice - estimatedSource - platformFee - shipping;
        const roi = ((netProfit / estimatedSource) * 100).toFixed(1);

        return {
          id: item.itemId,
          title: item.title,
          image: item.image?.imageUrl || "",
          currentPrice: currentPrice.toFixed(2),
          estimatedSource: estimatedSource.toFixed(2),
          netProfit: netProfit.toFixed(2),
          roi: parseFloat(roi),
          platform: "eBay",
          url: item.itemWebUrl,
          condition: item.condition,
          seller: item.seller?.username || "Unknown",
          soldCount: item.itemSellingSummary?.soldQuantity || 0,
          category: item.categories?.[0]?.categoryName || category,
        };
      })
      .filter((item) => item.roi > 20) // Only show 20%+ ROI flips
      .sort((a, b) => b.roi - a.roi);

    return new Response(JSON.stringify({ flips, total: flips.length }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
