// api/stripe/activate.js
// Called by frontend after successful Stripe checkout.
// Verifies the session with Stripe, then updates Supabase directly.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id, plan } = req.body;

  if (!session_id || !session_id.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session_id' });
  }

  const validPlans = ['basic', 'premium'];
  const resolvedPlan = validPlans.includes(plan) ? plan : 'basic';

  try {
    // 1. Verify with Stripe
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${session_id}?expand[]=subscription`,
      { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } }
    );
    const session = await stripeRes.json();

    if (session.error) {
      return res.status(400).json({ error: 'Invalid Stripe session: ' + session.error.message });
    }
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // 2. Find user in Supabase by userId metadata or email
    const email = session.customer_details?.email || session.customer_email;
    const userId = session.metadata?.userId || null;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    let profileId = userId;

    if (!profileId && email) {
      const lookupRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      const profiles = await lookupRes.json();
      profileId = profiles?.[0]?.id || null;
    }

    if (!profileId) {
      return res.status(404).json({ error: 'User not found for email: ' + email });
    }

    // 3. Build update — only set fields that have real values
    const sub = session.subscription;
    const updateData = {
      plan: resolvedPlan,
      subscription_status: 'active',
      stripe_customer_id: session.customer,
      updated_at: new Date().toISOString(),
    };

    if (sub?.id) updateData.subscription_id = sub.id;

    if (sub?.current_period_end) {
      updateData.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
    } else {
      // No subscription object (e.g. test with coupon) — set 1 month from now
      const oneMonthFromNow = new Date();
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
      updateData.current_period_end = oneMonthFromNow.toISOString();
    }

    // 4. Update Supabase
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${profileId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      return res.status(500).json({ error: 'DB update failed: ' + err });
    }

    console.log(`Activated: userId=${profileId} plan=${resolvedPlan} session=${session_id}`);
    return res.status(200).json({ success: true, plan: resolvedPlan });

  } catch (err) {
    console.error('activate error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
