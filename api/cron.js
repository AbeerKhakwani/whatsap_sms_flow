// api/cron.js
// Unified cron dispatcher — routes to the correct job via ?job= query param.
// Vercel Hobby plan allows max 12 serverless functions, so all crons share one file.
//
// Cron schedule (vercel.json):
//   /api/cron?job=health-check      → 8 AM daily
//   /api/cron?job=shipping-reminders → 9 AM daily
//   /api/cron?job=process-payouts    → 10 AM daily

export default async function handler(req, res) {
  // Auth check
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const job = req.query.job;

  switch (job) {
    case 'health-check':
      return (await import('../lib/cron/health-check.js')).default(req, res);
    case 'shipping-reminders':
      return (await import('../lib/cron/shipping-reminders.js')).default(req, res);
    case 'process-payouts':
      return (await import('../lib/cron/process-payouts.js')).default(req, res);
    case 'ownership-drift':
      return (await import('../lib/cron/ownership-drift.js')).default(req, res);
    default:
      return res.status(400).json({
        error: 'Missing or invalid job parameter',
        valid: ['health-check', 'shipping-reminders', 'process-payouts', 'ownership-drift']
      });
  }
}
