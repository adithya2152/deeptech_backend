import nodemailer from 'nodemailer';

const isMailerConfigured = () => {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

const getTransporter = () => {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) throw new Error('Email recipient is required');
  if (!subject) throw new Error('Email subject is required');

  if (!isMailerConfigured()) {
    console.warn('[mailer] SMTP not configured; skipping email send.', {
      to,
      subject,
    });
    return { sent: false, reason: 'SMTP not configured' };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return { sent: true };
};
