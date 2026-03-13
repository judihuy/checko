// Email utility — uses nodemailer for transactional emails
// Falls SMTP nicht konfiguriert: Fallback auf Console-Logging

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

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || "noreply@checko.ch";

  if (!transporter) {
    console.log("=== E-MAIL (SMTP nicht konfiguriert) ===");
    console.log(`An: ${to}`);
    console.log(`Betreff: ${subject}`);
    console.log(`Inhalt: ${html}`);
    console.log("=========================================");
    return false;
  }

  try {
    await transporter.sendMail({ from, to, subject, html });
    return true;
  } catch (error) {
    console.error("E-Mail senden fehlgeschlagen:", error);
    return false;
  }
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  verifyUrl: string
): Promise<boolean> {
  const subject = "Checko — E-Mail-Adresse bestätigen";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="font-size: 40px;">🦎</span>
        <h1 style="color: #059669; margin-top: 10px;">Willkommen bei Checko!</h1>
      </div>
      <p>Hallo ${name},</p>
      <p>vielen Dank für deine Registrierung bei Checko. Bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Button klickst:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          E-Mail bestätigen
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
      <p style="color: #6b7280; font-size: 12px; word-break: break-all;">${verifyUrl}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Checko — Dein Toolkit für alles. Ein Produkt von HuyDigital.
      </p>
    </div>
  `;

  return sendEmail(email, subject, html);
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  resetUrl: string
): Promise<boolean> {
  const subject = "Checko — Passwort zurücksetzen";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <span style="font-size: 40px;">🦎</span>
        <h1 style="color: #059669;">Passwort zurücksetzen</h1>
      </div>
      <p>Hallo ${name},</p>
      <p>du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den folgenden Button, um ein neues Passwort zu wählen:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Neues Passwort wählen
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Der Link ist 1 Stunde gültig. Falls du kein neues Passwort angefordert hast, ignoriere diese E-Mail einfach.</p>
      <p style="color: #6b7280; font-size: 12px; word-break: break-all;">Link: ${resetUrl}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Checko — Dein Toolkit für alles. Ein Produkt von HuyDigital.
      </p>
    </div>
  `;

  return sendEmail(email, subject, html);
}
