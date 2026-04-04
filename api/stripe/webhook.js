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
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    });
  }

  async function getByCustomer(customerId) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const data = await res.json();
    return data[0]?.id || null;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        if (userId) {
          await supabaseUpdate(userId, {
            stripe_customer_id: session.customer,
            subscription_id: session.subscription,
            subscription_status: 'active',
          });
        }
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = await getByCustomer(sub.customer);
        if (!userId) break;
        const priceId = sub.items.data[0]?.price?.id;
        const plan =
          priceId === process.env.STRIPE_PREMIUM_PRICE_ID ? 'premium'
          : priceId === process.env.STRIPE_BASIC_PRICE_ID ? 'basic'
          : 'free';
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
          plan: 'free', subscription_status: 'canceled',
          subscription_id: null, current_period_end: null,
        });
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
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (computed !== signature) throw new Error('Signature mismatch');
  return JSON.parse(payload);
}
