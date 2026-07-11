const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

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
    subject: 'Ton lien d\'accès à La Bonne Alerte',
    text:
      `Voici ton lien d'accès pour gérer tes alertes :\n${magicUrl}\n\n` +
      `Ce lien est valable 24 heures. Si tu n'es pas à l'origine de cette demande, ignore cet email.`,
    html:
      `<p>Voici ton lien d'accès pour gérer tes alertes :<br>` +
      `<a href="${magicUrl}">Accéder à mes alertes →</a></p>` +
      `<p style="font-size:12px;color:#888">Ce lien est valable 24 heures. ` +
      `Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>`,
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
