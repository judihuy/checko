// E-Mail-Benachrichtigungen für Preisradar-Alerts
// Nutzt das bestehende Nodemailer-Setup

import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Sende E-Mail bei neuen Preisradar-Treffern
 */
export async function sendPreisradarAlertEmail(
  email: string,
  name: string,
  query: string,
  alertCount: number
): Promise<boolean> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || "noreply@checko.ch";
  const baseUrl = process.env.NEXTAUTH_URL || "https://checko.ch";

  const subject = `🦎 Preisradar: ${alertCount} neue${alertCount === 1 ? "r" : ""} Treffer für "${query}"`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="font-size: 40px;">🦎</span>
        <h1 style="color: #059669; margin-top: 10px;">Preisradar-Alert</h1>
      </div>
      <p>Hallo ${name},</p>
      <p>dein Preisradar hat <strong>${alertCount} neue${alertCount === 1 ? "n" : ""} Treffer</strong> für "<strong>${query}</strong>" gefunden!</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${baseUrl}/dashboard/preisradar/alerts"
           style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Treffer ansehen →
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        Schau dir die Treffer an und entdecke die besten Angebote. Jeder Treffer wurde von unserer KI auf Preis-Leistung analysiert.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Checko — Dein Toolkit für alles. Ein Produkt von HuyDigital.<br />
        <a href="${baseUrl}/dashboard/preisradar" style="color: #9ca3af;">Preisradar verwalten</a>
      </p>
    </div>
  `;

  if (!transporter) {
    console.log("=== PREISRADAR E-MAIL (SMTP nicht konfiguriert) ===");
    console.log(`An: ${email}`);
    console.log(`Betreff: ${subject}`);
    console.log(`${alertCount} neue Treffer für "${query}"`);
    console.log("====================================================");
    return false;
  }

  try {
    await transporter.sendMail({ from, to: email, subject, html });
    return true;
  } catch (error) {
    console.error("Preisradar E-Mail senden fehlgeschlagen:", error);
    return false;
  }
}
