/**
 * Klynx Reviews Worker
 * ---------------------------------------------------------------
 * Stores visitor-submitted reviews in Workers KV, exposes:
 *   POST /submit          - public, visitor submits a review (status: pending)
 *   GET  /approved         - public, returns only approved reviews (for the site)
 *   GET  /admin/list        - protected, returns ALL reviews (any status)
 *   POST /admin/:id/approve - protected, marks a review approved
 *   POST /admin/:id/reject  - protected, marks a review rejected
 *
 * Protected routes require header:  X-Admin-Key: <ADMIN_KEY secret>
 *
 * Requires a KV namespace binding called REVIEWS (set in wrangler.toml
 * or via the Cloudflare dashboard) and a secret called ADMIN_KEY.
 */

// Lock this down to your real domain once the site is live, e.g.
// const ALLOWED_ORIGIN = 'https://klynx.com';
const ALLOWED_ORIGIN = '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function isAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key');
  return !!env.ADMIN_KEY && key === env.ADMIN_KEY;
}

function sanitizeText(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ---- PUBLIC: submit a new review ----
    if (pathname === '/submit' && method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ success: false, error: 'Invalid JSON body' }, 400);
      }

      const name = sanitizeText(body.name, 80);
      const company = sanitizeText(body.company, 80);
      const text = sanitizeText(body.text, 800);
      const rating = Number(body.rating);

      if (!name || !text) {
        return json({ success: false, error: 'Name and review text are required' }, 400);
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return json({ success: false, error: 'Rating must be between 1 and 5' }, 400);
      }

      const id = crypto.randomUUID();
      const record = {
        id,
        name,
        company,
        rating,
        text,
        status: 'pending', // pending | approved | rejected
        submittedAt: new Date().toISOString(),
      };

      await env.REVIEWS.put(`review:${id}`, JSON.stringify(record));
      return json({ success: true, id });
    }

    // ---- PUBLIC: list approved reviews only ----
    if (pathname === '/approved' && method === 'GET') {
      const list = await env.REVIEWS.list({ prefix: 'review:' });
      const values = await Promise.all(
        list.keys.map((k) => env.REVIEWS.get(k.name, 'json'))
      );
      const approved = values
        .filter((r) => r && r.status === 'approved')
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .map((r) => ({ name: r.name, company: r.company, rating: r.rating, text: r.text }));
      return json({ reviews: approved });
    }

    // ---- ADMIN: list everything (any status) ----
    if (pathname === '/admin/list' && method === 'GET') {
      if (!isAdmin(request, env)) return json({ success: false, error: 'Unauthorized' }, 401);
      const list = await env.REVIEWS.list({ prefix: 'review:' });
      const values = await Promise.all(
        list.keys.map((k) => env.REVIEWS.get(k.name, 'json'))
      );
      const reviews = values
        .filter(Boolean)
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      return json({ reviews });
    }

    // ---- ADMIN: approve / reject a review ----
    const modMatch = pathname.match(/^\/admin\/([a-zA-Z0-9-]+)\/(approve|reject|pending)$/);
    if (modMatch && method === 'POST') {
      if (!isAdmin(request, env)) return json({ success: false, error: 'Unauthorized' }, 401);
      const [, id, action] = modMatch;
      const key = `review:${id}`;
      const record = await env.REVIEWS.get(key, 'json');
      if (!record) return json({ success: false, error: 'Review not found' }, 404);

      record.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
      record.moderatedAt = new Date().toISOString();
      await env.REVIEWS.put(key, JSON.stringify(record));
      return json({ success: true, review: record });
    }

    // ---- ADMIN: delete a review permanently ----
    const delMatch = pathname.match(/^\/admin\/([a-zA-Z0-9-]+)$/);
    if (delMatch && method === 'DELETE') {
      if (!isAdmin(request, env)) return json({ success: false, error: 'Unauthorized' }, 401);
      await env.REVIEWS.delete(`review:${delMatch[1]}`);
      return json({ success: true });
    }

    return json({ success: false, error: 'Not found' }, 404);
  },
};
