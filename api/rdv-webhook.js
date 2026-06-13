const DEFAULT_WEBHOOK_URL = 'https://orkhan-manager.vercel.app/api/rdv-webhook';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function lireBodyJson(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const webhookUrl = process.env.ORKHAN_MANAGER_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  const token = process.env.RDV_WEBHOOK_TOKEN;

  if (!token) {
    return sendJson(res, 500, { ok: false, error: 'Missing RDV_WEBHOOK_TOKEN' });
  }

  let payload;

  try {
    payload = await lireBodyJson(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  try {
    const reponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rdv-token': token
      },
      body: JSON.stringify(payload)
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      return sendJson(res, 502, {
        ok: false,
        error: 'Orkhan Manager webhook rejected request',
        detail
      });
    }

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return sendJson(res, 502, {
      ok: false,
      error: 'Unable to reach Orkhan Manager webhook'
    });
  }
};
