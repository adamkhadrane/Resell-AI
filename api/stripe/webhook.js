// api/stripe/webhook.js — Vercel Edge Function

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const sig = request.headers.get('stripe-signature');
  const body = await request.text();

  let event;
  try {
    event = await verifyStripeWebhook(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  async function supabaseUpdate(userId, data) {
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Supabase update failed:', res.status, text);
    }
  }

  async function getByCustomer(customerId) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const data = await res.json();
    return data[0]?.id || null;
  }

  function getPlanFromPriceId(priceId) {
    if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return 'premium';
    if (priceId === process.env.STRIPE_BASIC_PRICE_ID) return 'basic';
    return 'basic'; // default to basic for any paid price
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;

        // userId is passed via subscription_data.metadata in create-checkout.js
        // It may also appear in session.metadata depending on Stripe version
        const userId =
          session.metadata?.userId ||
          session.subscription_data?.metadata?.userId ||
          null;

        if (!userId) {
          console.error('checkout.session.completed: no userId found in metadata');
          break;
        }

        // Fetch the subscription so we know the plan and period end right away
        let plan = 'basic';
        let currentPeriodEnd = null;
        if (session.subscription) {
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions/${session.subscription}`,
            { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
          );
          const sub = await subRes.json();
          if (!sub.error) {
            plan = getPlanFromPriceId(sub.items?.data[0]?.price?.id);
            currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
          }
        }

        await supabaseUpdate(userId, {
          stripe_customer_id: session.customer,
          subscription_id: session.subscription,
          subscription_status: 'active',
          plan,
          current_period_end: currentPeriodEnd,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = await getByCustomer(sub.customer);
        if (!userId) break;
        const plan = getPlanFromPriceId(sub.items.data[0]?.price?.id);
        await supabaseUpdate(userId, {
          plan,
          subscription_status: sub.status,
          subscription_id: sub.id,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = await getByCustomer(sub.customer);
        if (!userId) break;
        await supabaseUpdate(userId, {
          plan: 'free',
          subscription_status: 'canceled',
          subscription_id: null,
          current_period_end: null,
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        // Keep plan + period_end fresh on every renewal
        const invoice = event.data.object;
        if (invoice.billing_reason === 'subscription_cycle') {
          const userId = await getByCustomer(invoice.customer);
          if (!userId) break;
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions/${invoice.subscription}`,
            { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
          );
          const sub = await subRes.json();
          if (!sub.error) {
            await supabaseUpdate(userId, {
              plan: getPlanFromPriceId(sub.items?.data[0]?.price?.id),
              subscription_status: 'active',
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const userId = await getByCustomer(invoice.customer);
        if (!userId) break;
        await supabaseUpdate(userId, { subscription_status: 'past_due' });
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

async function verifyStripeWebhook(payload, sigHeader, secret) {
  if (!sigHeader) throw new Error('No signature');
  const parts = sigHeader.split(',');
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const signature = parts.find((p) => p.startsWith('v1='))?.slice(3);
  if (!timestamp || !signature) throw new Error('Invalid signature format');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (computed !== signature) throw new Error('Signature mismatch');
  return JSON.parse(payload);
}
