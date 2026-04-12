export const config = { runtime: 'edge' };

export default async function handler(request) {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });

  try {
    const { subscriptionId, customerId } = await request.json();
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    let subId = subscriptionId;

    // If no subscriptionId, look it up via customerId
    if (!subId && customerId) {
      const listRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=1`,
        { headers: { Authorization: `Bearer ${stripeKey}` } }
      );
      const list = await listRes.json();
      subId = list.data?.[0]?.id;
    }

    if (!subId) {
      return new Response(JSON.stringify({ error: 'No active subscription found' }), { status: 404, headers: corsHeaders });
    }

    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'cancel_at_period_end=true',
    });
    const sub = await res.json();
    if (sub.error) return new Response(JSON.stringify({ error: sub.error.message }), { status: 400, headers: corsHeaders });

    const cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null;
    return new Response(JSON.stringify({
      success: true,
      cancelAt,
      message: 'Your plan will remain active until the end of your billing period.',
    }), { status: 200, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
