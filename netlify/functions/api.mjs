// W Project POS: forwards requests from the POS page to the Google Apps Script web app,
// so phones only ever talk to this Netlify site.
const ALLOWED = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export default async (req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get('u') || '';
  if (!ALLOWED.test(target)) {
    return Response.json({ ok: false, error: 'bad_target' }, { status: 400 });
  }
  url.searchParams.delete('u');
  const qs = url.searchParams.toString();
  const init = { redirect: 'follow' };
  if (req.method === 'POST') {
    init.method = 'POST';
    init.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    init.body = await req.text();
  }
  try {
    const res = await fetch(target + (qs ? '?' + qs : ''), init);
    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return Response.json({ ok: false, error: 'google_unreachable' }, { status: 502 });
  }
};

export const config = { path: '/api' };
