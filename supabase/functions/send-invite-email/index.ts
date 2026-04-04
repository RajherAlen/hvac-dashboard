import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "http://localhost:5173";

interface RequestBody {
  email: string;
  full_name: string;
  role: string;
  invitation_id?: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY environment variable not set");
    }

    const { email, full_name, role }: RequestBody = await req.json();

    if (!email || !full_name) {
      return new Response(
        JSON.stringify({ error: "Email and full_name are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const acceptUrl = `${SITE_URL}/accept-invite`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
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
      throw new Error((data as any).message || "Failed to send email");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Invitation email sent successfully",
        data 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Email send error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
