// functions/api/stripe/cancel.js

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const { subscriptionId } = await request.json();

    if (!subscriptionId) {
      return new Response(JSON.stringify({ error: "Missing subscription ID" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Cancel at period end (user keeps access until billing cycle ends)
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "cancel_at_period_end=true",
    });

    const sub = await res.json();

    if (sub.error) {
      return new Response(JSON.stringify({ error: sub.error.message }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        cancelAt: new Date(sub.cancel_at * 1000).toISOString(),
        message: "Your plan will remain active until the end of your billing period.",
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

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
