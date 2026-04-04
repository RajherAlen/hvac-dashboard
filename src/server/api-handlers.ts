import type { Request, Response } from 'express';

export async function sendInviteHandler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, full_name, role, invitation_id } = req.body;

  if (!email || !full_name) {
    return res.status(400).json({ error: 'Email and full_name are required' });
  }

  const resendApiKey = process.env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error('RESEND_API_KEY not set');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const siteUrl = process.env.VITE_SITE_URL || 'http://localhost:5173';
  const acceptUrl = `${siteUrl}/accept-invite?email=${encodeURIComponent(email)}&invitation_id=${invitation_id}`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: process.env.VITE_EMAIL_FROM || 'onboarding@resend.dev',
        to: email,
        subject: "You've been invited to HVAC Dashboard",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
                .header { background-color: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; background-color: #007bff; color: white; padding: 12px 30px; border-radius: 5px; text-decoration: none; margin: 20px 0; font-weight: bold; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; text-align: center; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h2>Welcome to HVAC Dashboard! 🏢</h2>
                </div>
                <div class="content">
                  <p>Hi <strong>${full_name}</strong>,</p>
                  <p>You've been invited to join the <strong>HVAC Dashboard</strong> as an <strong>${role}</strong>.</p>
                  <p>Click the button below to accept your invitation and create your account:</p>
                  <div style="text-align: center;">
                    <a href="${acceptUrl}" class="button">Accept Invitation</a>
                  </div>
                  <p style="margin-top: 30px; color: #666; font-size: 14px;">
                    Or copy this link in your browser: <br>
                    <code style="background-color: #f0f0f0; padding: 5px 10px; border-radius: 3px; word-break: break-all;">${acceptUrl}</code>
                  </p>
                  <div class="footer">
                    <p>This invitation link will expire in 7 days.</p>
                    <p>If you didn't expect this invitation, you can ignore this email.</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', data);
      return res.status(response.status).json({ error: data.message || 'Failed to send email' });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
