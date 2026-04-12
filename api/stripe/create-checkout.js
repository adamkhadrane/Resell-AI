// api/stripe/create-checkout.js — Vercel Edge Function

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const { plan, userId, email } = await request.json();

    const priceId =
      plan === 'premium'
        ? process.env.STRIPE_PREMIUM_PRICE_ID
        : process.env.STRIPE_BASIC_PRICE_ID;

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400, headers: corsHeaders,
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const params = new URLSearchParams({
      'payment_method_types[0]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: 'https://resell-ai-rust.vercel.app/dashboard.html?success=true',
      cancel_url: 'https://resell-ai-rust.vercel.app/pricing.html?canceled=true',
      // Pass userId in BOTH places so the webhook always finds it
      'metadata[userId]': userId,
      'subscription_data[metadata][userId]': userId,
      customer_email: email || '',
      allow_promotion_codes: 'true',
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders,
    });
  }
}
