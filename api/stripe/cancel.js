export const config = { runtime: 'edge' };

export default async function handler(request) {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const { subscriptionId } = await request.json();
    if (!subscriptionId) return new Response(JSON.stringify({ error: 'Missing subscription ID' }), { status: 400, headers: corsHeaders });

    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'cancel_at_period_end=true',
    });
    const sub = await res.json();
    if (sub.error) return new Response(JSON.stringify({ error: sub.error.message }), { status: 400, headers: corsHeaders });

    return new Response(JSON.stringify({ success: true, cancelAt: new Date(sub.cancel_at * 1000).toISOString(), message: 'Your plan will remain active until the end of your billing period.' }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
