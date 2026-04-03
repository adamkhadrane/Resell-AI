// functions/api/ebay/sold.js
// Gets recently SOLD listings to show real resale prices

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "sneakers";

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
        Authorization: "Basic " + btoa(`${env.EBAY_APP_ID}:${env.EBAY_CERT_ID}`),
      },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Search completed/sold listings
    const searchRes = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
        query
      )}&limit=10&filter=soldItemsOnly%3Atrue`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
      }
    );

    const data = await searchRes.json();
    const items = (data.itemSummaries || []).map((item) => ({
      id: item.itemId,
      title: item.title,
      soldPrice: parseFloat(item.price?.value || 0).toFixed(2),
      image: item.image?.imageUrl || "",
      url: item.itemWebUrl,
      soldDate: item.itemEndDate || null,
    }));

    return new Response(JSON.stringify({ soldItems: items }), {
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
