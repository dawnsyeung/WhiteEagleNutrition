const META_GRAPH_VERSION = 'v20.0';
const DEFAULT_PIXEL_ID = '1022347530218534';
const MAX_BODY_BYTES = 64 * 1024;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const trimString = (value, maxLen = 1024) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
};

const parseJsonBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  let bytes = 0;
  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('error', reject);
  });

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body.');
  }
};

const getClientIp = (req) => {
  const forwardedFor = trimString(req.headers?.['x-forwarded-for']);
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return trimString(req.socket?.remoteAddress);
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const accessToken = trimString(process.env.META_CAPI_ACCESS_TOKEN, 2048);
    if (!accessToken) {
      json(res, 503, { error: 'META_CAPI_ACCESS_TOKEN is not configured.' });
      return;
    }

    const pixelId = trimString(process.env.META_PIXEL_ID, 64) || DEFAULT_PIXEL_ID;
    const body = await parseJsonBody(req);

    const eventName = trimString(body?.event_name, 64) || 'PageView';
    const eventId = trimString(body?.event_id, 128);
    const eventSourceUrl = trimString(body?.event_source_url, 2048);
    const fbp = trimString(body?.fbp, 128);
    const fbc = trimString(body?.fbc, 128);

    if (!eventId) {
      json(res, 400, { error: 'Missing event_id.' });
      return;
    }

    const userData = {
      client_ip_address: getClientIp(req),
      client_user_agent: trimString(req.headers?.['user-agent'], 1024)
    };
    if (fbp) userData.fbp = fbp;
    if (fbc) userData.fbc = fbc;

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'website',
          event_source_url: eventSourceUrl,
          user_data: userData
        }
      ]
    };

    const testEventCode = trimString(process.env.META_TEST_EVENT_CODE, 128);
    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const endpoint = `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      json(res, 502, {
        error: 'Meta CAPI request failed.',
        details: responseJson?.error?.message || 'Unknown error from Meta.'
      });
      return;
    }

    json(res, 200, {
      ok: true,
      events_received: responseJson?.events_received ?? null
    });
  } catch (error) {
    json(res, 500, { error: error?.message || 'Server error.' });
  }
};
