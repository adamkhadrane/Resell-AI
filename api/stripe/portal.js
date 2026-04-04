export const config = { runtime: 'edge' };

export default async function handler(request) {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const { customerId } = await request.json();
    const params = new URLSearchParams({ customer: customerId, return_url: 'https://resellai.tools/account.html' });

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const portal = await res.json();
    if (portal.error) return new Response(JSON.stringify({ error: portal.error.message }), { status: 400, headers: corsHeaders });

    return new Response(JSON.stringify({ url: portal.url }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
