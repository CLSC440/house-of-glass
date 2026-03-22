const nodemailer = require('nodemailer');
const { getAdmin, getDb } = require('./_firebaseAdmin');

function normalizeBaseUrl(req) {
    const envBaseUrl = (process.env.APP_BASE_URL || '').trim();
    if (envBaseUrl) {
        return envBaseUrl.replace(/\/$/, '');
    }

    const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const protoHeader = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();

    if (hostHeader) {
        return `${protoHeader}://${hostHeader}`.replace(/\/$/, '');
    }

    return 'http://localhost:8000';
}

function buildResetAppLink(firebaseLink, baseUrl) {
    const actionUrl = new URL(firebaseLink);
    const query = new URLSearchParams(actionUrl.search);
    return `${baseUrl}/reset-password?${query.toString()}`;
}

function buildEmailSubject(lang) {
    return lang === 'ar'
        ? 'اعادة تعيين كلمة المرور | House Of Glass'
        : 'Reset your password | House Of Glass';
}

function buildEmailText({ resetLink, recipientName, lang }) {
    if (lang === 'ar') {
        return [
            `مرحباً ${recipientName || ''}`.trim(),
            '',
            'تلقينا طلباً لاعادة تعيين كلمة المرور الخاصة بحسابك في House Of Glass.',
            'استخدم الرابط التالي لاكمال العملية:',
            resetLink,
            '',
            'اذا لم تطلب اعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.',
            '',
            'House Of Glass'
        ].join('\n');
    }

    return [
        `Hello${recipientName ? ` ${recipientName}` : ''},`,
        '',
        'We received a request to reset your House Of Glass password.',
        'Use the link below to continue:',
        resetLink,
        '',
        'If you did not request this change, you can safely ignore this email.',
        '',
        'House Of Glass'
    ].join('\n');
}

function buildEmailHtml({ resetLink, recipientName, baseUrl, lang }) {
    const logoUrl = `${baseUrl}/logo.png`;
    const title = lang === 'ar' ? 'اعادة تعيين كلمة المرور' : 'Reset Your Password';
    const intro = lang === 'ar'
        ? 'طلبنا لك رسالة انيقة وآمنة لاعادة ضبط كلمة المرور الخاصة بحسابك.'
        : 'A secure reset link for your House Of Glass account is ready.';
    const bodyText = lang === 'ar'
        ? 'اضغط على الزر بالاسفل لاعادة تعيين كلمة المرور. هذا الرابط يفتح صفحة House Of Glass مباشرة.'
        : 'Use the button below to choose a new password. The link opens your House Of Glass reset page directly.';
    const cta = lang === 'ar' ? 'اعادة تعيين كلمة المرور' : 'Reset Password';
    const expiry = lang === 'ar'
        ? 'يفضل استخدام الرابط خلال اقرب وقت. اذا لم تطلب ذلك، يمكنك تجاهل الرسالة بأمان.'
        : 'For your security, use this link as soon as possible. If you did not request it, you can ignore this email.';
    const alt = lang === 'ar' ? 'او انسخ هذا الرابط' : 'Or copy this link';
    const greeting = lang === 'ar'
        ? `مرحباً${recipientName ? ` ${recipientName}` : ''}`
        : `Hello${recipientName ? ` ${recipientName}` : ''},`;
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    const align = lang === 'ar' ? 'right' : 'left';
    const logoMargin = lang === 'ar' ? '0 0 0 auto' : '0 auto 0 0';
    const ctaMargin = lang === 'ar' ? '0 0 0 auto' : '0 auto 0 0';

    return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#060a16;font-family:Arial,'Segoe UI',sans-serif;color:#f8fafc;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#060a16;padding:32px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:linear-gradient(180deg,#161f35 0%,#0c1223 100%);border:1px solid rgba(212,175,55,0.24);border-radius:28px;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,0.45);">
          <tr>
            <td style="padding:28px 28px 10px;background:radial-gradient(circle at top, rgba(212,175,55,0.16), transparent 35%);text-align:${align};">
              <img src="${logoUrl}" alt="House Of Glass" width="76" height="76" style="display:block;margin:${logoMargin};filter:drop-shadow(0 0 18px rgba(212,175,55,0.28));" />
              <p style="margin:28px 0 0;font-size:12px;letter-spacing:0.38em;text-transform:uppercase;color:#d4af37;font-weight:700;">House Of Glass</p>
              <h1 style="margin:14px 0 10px;font-size:36px;line-height:1.1;color:#f8fafc;font-weight:800;">${title}</h1>
              <p style="margin:0;font-size:18px;line-height:1.7;color:#cbd5e1;">${intro}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 34px;text-align:${align};">
              <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:22px;padding:22px;">
                <p style="margin:0 0 14px;font-size:22px;line-height:1.4;font-weight:700;color:#ffffff;">${greeting}</p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.9;color:#d7deea;">${bodyText}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:${ctaMargin};">
                  <tr>
                    <td align="center" bgcolor="#d4af37" style="border-radius:999px;">
                      <a href="${resetLink}" style="display:inline-block;padding:16px 28px;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#121926;text-decoration:none;border-radius:999px;">${cta}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:14px;line-height:1.8;color:#a8b3c7;">${expiry}</p>
              </div>
              <div style="margin-top:18px;padding:18px 20px;border-radius:20px;background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.18);">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#d4af37;font-weight:700;">${alt}</p>
                <p style="margin:0;font-size:13px;line-height:1.8;word-break:break-word;color:#d7deea;">
                  <a href="${resetLink}" style="color:#9ec5ff;text-decoration:underline;">${resetLink}</a>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        const error = new Error('Password reset email service is not configured. Add SMTP_HOST, SMTP_USER and SMTP_PASS.');
        error.status = 500;
        throw error;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE || port === 465).toLowerCase() === 'true',
        auth: { user, pass }
    });
}

async function findRecipientName(email) {
    try {
        const snapshot = await getDb().collection('users').where('email', '==', email).limit(1).get();
        if (!snapshot.empty) {
            const userData = snapshot.docs[0].data() || {};
            return userData.firstName || userData.name || '';
        }
    } catch (error) {
        console.warn('Could not resolve recipient name for reset email:', error.message);
    }

    return '';
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        getAdmin();

        const { email, lang } = req.body || {};
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedLang = String(lang || 'en').toLowerCase() === 'ar' ? 'ar' : 'en';

        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ error: 'A valid email address is required.' });
        }

        let firebaseLink;
        try {
            firebaseLink = await getAdmin().auth().generatePasswordResetLink(normalizedEmail);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                return res.status(200).json({ ok: true });
            }
            throw error;
        }

        const baseUrl = normalizeBaseUrl(req);
        const resetLink = buildResetAppLink(firebaseLink, baseUrl);
        const recipientName = await findRecipientName(normalizedEmail);
        const transporter = createTransporter();
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
        const fromName = process.env.SMTP_FROM_NAME || 'House Of Glass';

        await transporter.sendMail({
            from: `${fromName} <${fromEmail}>`,
            to: normalizedEmail,
            subject: buildEmailSubject(normalizedLang),
            text: buildEmailText({
                resetLink,
                recipientName,
                lang: normalizedLang
            }),
            html: buildEmailHtml({
                resetLink,
                recipientName,
                baseUrl,
                lang: normalizedLang
            })
        });

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error('Password reset email error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Failed to send password reset email.'
        });
    }
};