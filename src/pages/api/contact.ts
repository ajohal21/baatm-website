import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

/**
 * Field length caps. These bound the size of anything we forward to Resend,
 * which keeps a single request from burning quota or function time.
 */
const LIMITS = {
  name: 100,
  email: 254, // RFC 5321 maximum length of a forward-path
  message: 5000,
  recaptchaToken: 2048,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** reCAPTCHA tokens are URL-safe base64. */
const RECAPTCHA_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Matches C0/C1 control characters, which have no place in a name or address. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface ContactFields {
  name: string;
  email: string;
  message: string;
  recaptchaToken: string;
}

/**
 * Validates an untrusted request body. Returns the trimmed fields on success,
 * or a human-readable reason on failure.
 *
 * The browser performs the same checks, but it is not a security boundary:
 * requests reach this endpoint directly, so every constraint is re-applied here.
 */
function validate(data: unknown): { ok: true; fields: ContactFields } | { ok: false; reason: string } {
  if (typeof data !== 'object' || data === null) {
    return { ok: false, reason: 'Request body must be a JSON object' };
  }

  const raw = data as Record<string, unknown>;
  const fields: Partial<ContactFields> = {};

  for (const key of ['name', 'email', 'message', 'recaptchaToken'] as const) {
    const value = raw[key];

    if (typeof value !== 'string') {
      return { ok: false, reason: `Field "${key}" must be a string` };
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return { ok: false, reason: `Field "${key}" is required` };
    }

    if (trimmed.length > LIMITS[key]) {
      return { ok: false, reason: `Field "${key}" exceeds ${LIMITS[key]} characters` };
    }

    fields[key] = trimmed;
  }

  const { name, email, message, recaptchaToken } = fields as ContactFields;

  // `name` becomes the subject line and `email` becomes the Reply-To header.
  // Control characters there are a header-injection vector.
  if (CONTROL_CHARS.test(name)) {
    return { ok: false, reason: 'Field "name" contains invalid characters' };
  }

  if (CONTROL_CHARS.test(email) || !EMAIL_PATTERN.test(email)) {
    return { ok: false, reason: 'Field "email" is not a valid email address' };
  }

  // Restricting the token to its documented alphabet also prevents it from
  // injecting extra parameters into the verification URL below.
  if (!RECAPTCHA_TOKEN_PATTERN.test(recaptchaToken)) {
    return { ok: false, reason: 'Invalid reCAPTCHA token' };
  }

  return { ok: true, fields: { name, email, message, recaptchaToken } };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return json({ error: 'Request body must be valid JSON' }, 400);
    }

    const result = validate(data);
    if (!result.ok) {
      return json({ error: result.reason }, 400);
    }

    const { name, email, message, recaptchaToken } = result.fields;

    // 2. Verify reCAPTCHA token with Google
    const recaptchaSecret = import.meta.env.RECAPTCHA_SECRET_KEY;
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}`;

    const recaptchaRes = await fetch(verifyUrl, { method: 'POST' });
    const recaptchaData = await recaptchaRes.json();

    if (!recaptchaData.success) {
      return json({ error: 'Failed reCAPTCHA verification' }, 400);
    }

    // 3. Send email via Resend
    const resendApiKey = import.meta.env.RESEND_API_KEY;
    const toEmail = import.meta.env.CONTACT_TO_EMAIL;

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
    from: 'Before & After the Movies <contact@beforeandafterthemovies.com>',
    to: [toEmail],
    replyTo: email,
    subject: `New Podcast Contact Message from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    });

    if (error) {
      console.error('Resend failed to send contact email:', error);
      return json({ error: 'Unable to send message. Please try again later.' }, 500);
    }

    return json({ success: true, message: 'Message sent successfully!' }, 200);
  } catch (err) {
    console.error('Unexpected error in contact endpoint:', err);
    return json({ error: 'Internal server error' }, 500);
  }
};
    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
    from: 'Before & After the Movies <contact@beforeandafterthemovies.com>',
    to: [toEmail],
    replyTo: email,
    subject: `New Podcast Contact Message from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Message sent successfully!' }),
      { status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500 }
    );
  }
};
