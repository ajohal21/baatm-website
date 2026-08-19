import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { name, email, message, recaptchaToken } = data;

    // 1. Basic validation
    if (!name || !email || !message || !recaptchaToken) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      );
    }

    // 2. Verify reCAPTCHA token with Google
    const recaptchaSecret = import.meta.env.RECAPTCHA_SECRET_KEY;
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${recaptchaSecret}&response=${recaptchaToken}`;

    const recaptchaRes = await fetch(verifyUrl, { method: 'POST' });
    const recaptchaData = await recaptchaRes.json();

    if (!recaptchaData.success) {
      return new Response(
        JSON.stringify({ error: 'Failed reCAPTCHA verification' }),
        { status: 400 }
      );
    }

    // 3. Send email via Resend
    const resendApiKey = import.meta.env.RESEND_API_KEY;
    const toEmail = import.meta.env.CONTACT_TO_EMAIL;

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: 'Before & After the Movies <onboarding@resend.dev>', // Resend's free test domain
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