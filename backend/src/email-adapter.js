import nodemailer from 'nodemailer';

export function createEmailAdapter(config, logger = console) {
  if (config.emailDeliveryMode === 'smtp') {
    if (!config.smtpHost || !config.smtpFrom) return { enabled: false, sendVerification: async () => { throw new Error('SMTP email delivery is not configured.'); } };
    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword } : undefined
    });
    return {
      enabled: true,
      async sendVerification({ email, url }) {
        await transport.sendMail({
          from: config.smtpFrom,
          to: email,
          subject: 'Verify your Miroir account',
          text: `Verify your Miroir account by opening this link: ${url}\n\nThis link expires shortly. If you did not request it, ignore this message.`
        });
      }
    };
  }

  if (config.emailDeliveryMode === 'console' && config.nodeEnv !== 'production') {
    return {
      enabled: true,
      async sendVerification({ email, url }) {
        logger.info?.({ email, url }, 'Miroir email verification link (development only)');
      }
    };
  }

  return { enabled: false, async sendVerification() { throw new Error('Email delivery is not configured.'); } };
}
