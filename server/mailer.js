const { Resend } = require('resend');

const resend = new Resend((process.env.RESEND_API_KEY || '').trim());

// Domaine alert.labonnealerte.fr vérifié sur Resend : on envoie depuis
// une adresse de ce sous-domaine.
const FROM = 'noreply@alert.labonnealerte.fr';

const SITE_URL = 'https://labonnealerte.fr';
const PROMO_URL = 'https://www.leboncoin.fr/service/bons-plans';
const MYALERTS_URL = 'https://www.labonnealerte.fr/mes-alertes';

// Pied de mail commun : lien discret vers la gestion des alertes (sans token).
const MANAGE_TEXT = `\n\n—\nGérer mes alertes : ${MYALERTS_URL}`;
const MANAGE_HTML =
  `<hr><p style="font-size:12px;color:#888">` +
  `Gérer mes alertes : <a href="${MYALERTS_URL}">${MYALERTS_URL}</a></p>`;

/**
 * Envoie le mail de confirmation d'inscription (double opt-in).
 * @param {string} email
 * @param {string} token
 */
async function sendConfirmation(email, token) {
  const confirmUrl = `${SITE_URL}/confirm/${token}`;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Confirme ton inscription à La Bonne Alerte',
    text:
      `Merci de t'être inscrit à La Bonne Alerte !\n\n` +
      `Confirme ton adresse en cliquant sur ce lien :\n${confirmUrl}\n\n` +
      `Si tu n'es pas à l'origine de cette inscription, ignore cet email.` +
      MANAGE_TEXT,
    html:
      `<p>Merci de t'être inscrit à <strong>La Bonne Alerte</strong> !</p>` +
      `<p>Confirme ton adresse en cliquant sur ce lien :<br>` +
      `<a href="${confirmUrl}">${confirmUrl}</a></p>` +
      `<p>Si tu n'es pas à l'origine de cette inscription, ignore cet email.</p>` +
      MANAGE_HTML,
  });
}

// Gabarit d'email de marque (compatible clients mail : tables + styles inline).
// Palette identité : accent violet #a567e3, encre #0f1419, fond doux #fdfaff.
function emailShell({ heading, intro, button, fallbackUrl, note }) {
  const btn = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0">
         <tr><td style="border-radius:12px;background:#a567e3">
           <a href="${button.url}" target="_blank"
              style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;
                     font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">
             ${button.label}
           </a>
         </td></tr>
       </table>`
    : '';
  const fallback = fallbackUrl
    ? `<p style="margin:0 0 4px;font-size:12px;color:#6b6459">Si le bouton ne fonctionne pas, copie ce lien&nbsp;:</p>
       <p style="margin:0 0 18px;font-size:12px;word-break:break-all">
         <a href="${fallbackUrl}" style="color:#a567e3">${fallbackUrl}</a></p>`
    : '';
  const noteHtml = note
    ? `<p style="margin:18px 0 0;font-size:13px;color:#6b6459;line-height:1.6">${note}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4edfb">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4edfb;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
             style="max-width:480px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;
                    box-shadow:0 4px 18px rgba(30,20,50,.08)">
        <tr><td style="padding:26px 32px 0">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;color:#0f1419;letter-spacing:-0.5px">
            labonne<span style="color:#a567e3">alerte</span><span style="color:#16a34a">.</span><span style="color:#6b6459">fr</span>
          </div>
        </td></tr>
        <tr><td style="padding:22px 32px 34px;font-family:Arial,Helvetica,sans-serif;color:#0f1419">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;letter-spacing:-0.02em">${heading}</h1>
          <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#3a3a42">${intro}</p>
          ${btn}
          ${fallback}
          ${noteHtml}
        </td></tr>
        <tr><td style="padding:0 32px 26px">
          <hr style="border:none;border-top:1px solid #eaddf8;margin:0 0 14px">
          <p style="margin:0;font-size:12px;color:#8a8a92">
            La Bonne Alerte — gratuit, open source, sans spam.<br>
            Gérer mes alertes&nbsp;: <a href="${MYALERTS_URL}" style="color:#a567e3">${MYALERTS_URL}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Envoie le lien magique de gestion des alertes (accès sans mot de passe).
 * @param {string} email
 * @param {string} token
 */
async function sendMagicLink(email, token) {
  const magicUrl = `${MYALERTS_URL}?token=${token}`;

  return resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Ton lien de connexion à La Bonne Alerte',
    text:
      `Bonjour,\n\n` +
      `Voici ton lien de connexion pour gérer tes alertes :\n${magicUrl}\n\n` +
      `Ce lien est valable 24 heures et ne fonctionne qu'une seule fois par demande.\n` +
      `Si tu n'es pas à l'origine de cette demande, ignore cet email.` +
      `\n\n—\nGérer mes alertes : ${MYALERTS_URL}`,
    html: emailShell({
      heading: 'Ton lien de connexion',
      intro: 'Clique sur le bouton ci-dessous pour accéder à tes alertes et gérer tes abonnements. Aucun mot de passe requis.',
      button: { url: magicUrl, label: 'Me connecter à mes alertes →' },
      fallbackUrl: magicUrl,
      note: 'Ce lien est valable <strong>24 heures</strong>. Si tu n\'es pas à l\'origine de cette demande, ignore simplement cet email.',
    }),
  });
}

/**
 * Prévient tous les abonnés que la promo est active.
 * Envoi individuel (un mail par abonné), jamais en CC, pour ne pas
 * exposer les adresses entre elles.
 * @param {string[]} emails
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendPromoAlert(emails) {
  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    try {
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: '🚚 La promo Livraison à 0,99 € est ACTIVE !',
        text:
          `Bonne nouvelle : la promo "Livraison à 0,99 €" est active sur Leboncoin.\n\n` +
          `Fonce ici :\n${PROMO_URL}\n` +
          MANAGE_TEXT,
        html:
          `<p>Bonne nouvelle : la promo <strong>"Livraison à 0,99 €"</strong> ` +
          `est active sur Leboncoin.</p>` +
          `<p><a href="${PROMO_URL}">Fonce en profiter →</a></p>` +
          MANAGE_HTML,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`[mailer] Échec envoi à ${email} :`, err.message);
    }
  }

  return { sent, failed };
}

module.exports = { sendConfirmation, sendPromoAlert, sendMagicLink };
