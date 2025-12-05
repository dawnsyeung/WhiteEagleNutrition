import { Resend } from 'resend';

const requiredEnvVars = ['RESEND_API_KEY', 'CONTACT_TO_EMAIL', 'CONTACT_FROM_EMAIL'];
const missingEnv = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnv.length) {
  console.warn(
    `Contact form email handler is missing environment variables: ${missingEnv.join(', ')}. ` +
      'Requests will fail until they are configured.'
  );
}

const resendClient = new Resend(process.env.RESEND_API_KEY || '');
const canUseBuffer = typeof Buffer !== 'undefined';

const sanitize = (value = '') => String(value).trim();
const escapeHtml = (unsafe = '') =>
  unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const respond = (res, status, payload) => {
  const body = JSON.stringify(payload);

  if (!res) {
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json' }
    });
  }

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }

  if (res.setHeader) {
    res.setHeader('Content-Type', 'application/json');
  }

  res.statusCode = status;
  res.end(body);
};

const parseBody = async (source) => {
  if (!source) return {};

  if (typeof source.text === 'function' && typeof source.json === 'function') {
    const text = await source.text();
    return text ? JSON.parse(text) : {};
  }

  if (source.body !== undefined && source.body !== null) {
    if (typeof source.body === 'string') {
      return source.body ? JSON.parse(source.body) : {};
    }

    if (canUseBuffer && Buffer.isBuffer(source.body)) {
      const text = source.body.toString('utf8');
      return text ? JSON.parse(text) : {};
    }

    if (typeof source.body === 'object') {
      return source.body;
    }
  }

  if (typeof source.rawBody === 'string') {
    return source.rawBody ? JSON.parse(source.rawBody) : {};
  }

  if (canUseBuffer && Buffer.isBuffer(source.rawBody)) {
    const text = source.rawBody.toString('utf8');
    return text ? JSON.parse(text) : {};
  }

  if (typeof source.on === 'function') {
    const raw = await new Promise((resolve, reject) => {
      let data = '';
      source.on('data', (chunk) => {
        data += chunk;
      });
      source.on('end', () => resolve(data));
      source.on('error', reject);
    });
    return raw ? JSON.parse(raw) : {};
  }

  return {};
};

const buildHtmlBody = (payload) => {
  const { name, email, phone, topic, message, submittedAt, formName, source } = payload;
  const formattedMessage = escapeHtml(message || '').replace(/\n/g, '<br />');

  return `
    <h2>New contact form submission</h2>
    <p><strong>Form:</strong> ${escapeHtml(formName || 'contact-form')}</p>
    <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt || new Date().toISOString())}</p>
    <p><strong>Source page:</strong> ${escapeHtml(source || 'unknown')}</p>
    <hr />
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
    <p><strong>Topic:</strong> ${escapeHtml(topic)}</p>
    <p><strong>Message:</strong></p>
    <p>${formattedMessage}</p>
  `;
};

const buildTextBody = (payload) => {
  const { name, email, phone, topic, message, submittedAt, formName, source } = payload;

  return [
    'New contact form submission',
    `Form: ${formName || 'contact-form'}`,
    `Submitted at: ${submittedAt || new Date().toISOString()}`,
    `Source page: ${source || 'unknown'}`,
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || 'Not provided'}`,
    `Topic: ${topic}`,
    '',
    'Message:',
    message || ''
  ].join('\n');
};

const validatePayload = (payload) => {
  const errors = [];
  const requiredFields = ['name', 'email', 'topic', 'message'];

  requiredFields.forEach((field) => {
    if (!sanitize(payload[field])) {
      errors.push(`${field} is required`);
    }
  });

  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push('email must be valid');
  }

  if (payload.topic && !['nutrition', 'subscription', 'wholesale', 'press'].includes(payload.topic)) {
    errors.push('topic is not supported');
  }

  return errors;
};

const handleContactSubmission = async (req, res) => {
  const method = (req?.method || req?.request?.method || req?.requestContext?.http?.method || '').toUpperCase();

  if (method && method !== 'POST') {
    return respond(res, 405, { error: 'Method not allowed' });
  }

  if (missingEnv.length) {
    return respond(res, 500, {
      error: 'Contact form is not configured. Please try again later.'
    });
  }

  let payload;
  try {
    payload = await parseBody(req);
  } catch (error) {
    console.error('Unable to parse contact payload', error);
    return respond(res, 400, { error: 'Invalid JSON payload' });
  }

  if (sanitize(payload.company)) {
    return respond(res, 202, { status: 'ok' });
  }

  const normalizedPayload = {
    formName: payload.formName || 'contact-form',
    source: payload.source || payload.location || '',
    name: sanitize(payload.name),
    email: sanitize(payload.email).toLowerCase(),
    phone: sanitize(payload.phone),
    topic: sanitize(payload.topic),
    message: payload.message?.trim() || '',
    submittedAt: payload.submittedAt || new Date().toISOString()
  };

  const errors = validatePayload(normalizedPayload);
  if (errors.length) {
    return respond(res, 422, { error: 'Validation failed', details: errors });
  }

  try {
    const emailResponse = await resendClient.emails.send({
      from: process.env.CONTACT_FROM_EMAIL,
      to: process.env.CONTACT_TO_EMAIL,
      reply_to: normalizedPayload.email,
      subject: `Contact form: ${normalizedPayload.topic} inquiry from ${normalizedPayload.name}`,
      html: buildHtmlBody(normalizedPayload),
      text: buildTextBody(normalizedPayload)
    });

    if (emailResponse.error) {
      throw emailResponse.error;
    }

    return respond(res, 200, {
      status: 'ok',
      message: 'Message delivered to the nutrition team.'
    });
  } catch (error) {
    console.error('Resend email delivery failed', error);
    return respond(res, 502, {
      error: 'We could not deliver your message. Please email dawn@whiteeaglenutrition.com.'
    });
  }
};

export default handleContactSubmission;
export const POST = handleContactSubmission;
