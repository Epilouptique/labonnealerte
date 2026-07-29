const { Resend } = require('resend');
const { pool } = require('./db');

const resend = new Resend((process.env.RESEND_API_KEY || '').trim());

// Domaine alert.labonnealerte.fr vérifié sur Resend : on envoie depuis
// une adresse de ce sous-domaine.
const FROM = 'LaBonneAlerte <noreply@alert.labonnealerte.fr>';

const SITE_URL = 'https://labonnealerte.fr';
const PUBLIC_SITE = 'https://labonnealerte.fr';
const PROMO_URL = 'https://www.leboncoin.fr/service/bons-plans';
const MYALERTS_URL = 'https://labonnealerte.fr/connexion';
const ACCENT = '#a567e3';

// Préfixe de marque commun à TOUS les sujets d'emails : garantit la reconnaissance
// de l'émetteur même si le nom d'affichage du From est tronqué (mobile).
const subject = (s) => `LaBonneAlerte · ${s}`;

function monthKey() {
  const d = new Date();
  return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
}
async function incEmailCounters() {
  try {
    await pool.query(
      `INSERT INTO counters (key, value) VALUES ('emails_total', 1)
       ON CONFLICT (key) DO UPDATE SET value = counters.value + 1`
    );
    await pool.query(
      `INSERT INTO counters (key, value) VALUES ($1, 1)
       ON CONFLICT (key) DO UPDATE SET value = counters.value + 1`,
      ['emails_' + monthKey()]
    );
  } catch (err) {
    console.error('[mailer] incEmailCounters :', err.message);
  }
}

// Pied de mail commun : lien discret vers la gestion des alertes (sans token).
const MANAGE_TEXT = `\n\n—\nGérer ma collection : ${MYALERTS_URL}`;
const MANAGE_HTML =
  `<hr><p style="font-size:12px;color:#888">` +
  `Gérer ma collection : <a href="${MYALERTS_URL}">${MYALERTS_URL}</a></p>`;

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
    subject: subject('Confirme ton inscription'),
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
            Gérer ma collection&nbsp;: <a href="${MYALERTS_URL}" style="color:#a567e3">${MYALERTS_URL}</a>
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
    subject: subject('Ton lien de connexion'),
    text:
      `Bonjour,\n\n` +
      `Voici ton lien de connexion pour gérer tes alertes :\n${magicUrl}\n\n` +
      `Ce lien est valable 30 minutes et ne peut être utilisé qu'une fois.\n` +
      `Si tu n'es pas à l'origine de cette demande, ignore cet email.` +
      `\n\n—\nGérer ma collection : ${MYALERTS_URL}`,
    html: emailShell({
      heading: 'Ton lien de connexion',
      intro: 'Clique sur le bouton ci-dessous pour accéder à tes alertes et gérer tes abonnements. Aucun mot de passe requis.',
      button: { url: magicUrl, label: 'Me connecter à ma collection →' },
      fallbackUrl: magicUrl,
      note: 'Ce lien est valable <strong>30 minutes</strong> et ne peut être utilisé qu\'une fois. Si tu n\'es pas à l\'origine de cette demande, ignore simplement cet email.',
    }),
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// Gabarit HTML email-safe de l'alerte (tables, styles inline, max 600px).
function alertEmailHtml(info, target, statusUrl, hhmm) {
  const name = esc(info.name || 'Votre alerte');
  const context = info.message
    ? `${esc(info.message)} · détectée à ${hhmm}`
    : `Alerte déclenchée · détectée à ${hhmm}`;
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4edfb">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4edfb;padding:28px 14px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(30,20,50,.08)">
        <tr><td style="background:${ACCENT};padding:16px 24px">
          <table role="presentation" width="100%"><tr>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800"><span style="color:#ffffff !important;text-decoration:none">labonnealerte.fr</span></td>
            <td align="right"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#22c55e"></span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#0f1419">
          <h1 style="margin:0 0 10px;font-size:21px;font-weight:800;letter-spacing:-0.02em">🔔 ${name}</h1>
          <p style="margin:0;font-size:14.5px;line-height:1.6;color:#4a4a52">${context}</p>
        </td></tr>
        <tr><td style="padding:18px 28px 30px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:12px;background:#a567e3">
              <a href="${esc(target)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">Voir →</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 28px 24px">
          <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">
          <p style="margin:0;font-size:12px;color:#8a8a92;line-height:1.6">
            Vous recevez cet email car vous suivez cette alerte · <a href="${esc(statusUrl)}" style="color:#8a8a92">voir le statut</a><br>
            se désinscrire en 1 clic depuis <a href="${MYALERTS_URL}" style="color:#8a8a92">gérer ma collection</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Prévient tous les abonnés qu'une alerte est active.
 * Envoi individuel (un mail par abonné), jamais en CC.
 * @param {Array<string|{email,token}>} recipients  emails, ou objets {email, token}
 * @param {{id,name,message,url}} info  contexte de la source
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendPromoAlert(recipients, info = {}) {
  let sent = 0;
  let failed = 0;

  // info.statusUrl (posé par le poller) porte la combinaison paramétrée
  // (?departement=XX) ; repli sur l'URL générique de la source.
  const statusUrl = info.statusUrl || (info.id ? `${PUBLIC_SITE}/source/${info.id}/statut` : PUBLIC_SITE);
  const target = info.url || statusUrl; // lien de l'alerte, sinon la page de statut
  const name = info.name || 'Votre alerte';
  const hhmm = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const context = info.message ? `${info.message} · détectée à ${hhmm}` : `détectée à ${hhmm}`;
  const html = alertEmailHtml(info, target, statusUrl, hhmm);
  const text =
    `${name}\n\n${context}\n\n` +
    `Voir : ${target}\n\n` +
    `—\nVous recevez cet email car vous suivez cette alerte.\n` +
    `Statut de la source : ${statusUrl}\n` +
    `Se désinscrire en 1 clic : ${MYALERTS_URL}`;

  for (const r of recipients) {
    const email = typeof r === 'string' ? r : r.email;
    const token = typeof r === 'string' ? null : r.token;
    const payload = { from: FROM, to: email, subject: subject(`🔔 ${name}`), text, html };
    // Désinscription native (Gmail « Se désinscrire ») + délivrabilité.
    if (token) {
      const unsubUrl = `${SITE_URL}/unsubscribe/${token}`;
      payload.headers = {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }
    try {
      await resend.emails.send(payload);
      sent += 1;
      await incEmailCounters();
    } catch (err) {
      failed += 1;
      console.error(`[mailer] Échec envoi à ${email} :`, err.message);
    }
  }

  return { sent, failed };
}

/**
 * Digest « heures de veille » : UN email récapitulant les alertes différées
 * pendant la plage silencieuse de l'abonné, envoyé à sa sortie de veille.
 * Les alertes redevenues inactives entre-temps sont présentées comme
 * « terminée entre-temps » (honnêteté), pas comme actives.
 * N'est JAMAIS lui-même différé.
 * @param {{email, token}} recipient
 * @param {Array<{name, message, url, statusUrl, obsolete}>} items
 */
async function sendDeferredDigest(recipient, items = []) {
  const email = typeof recipient === 'string' ? recipient : recipient.email;
  const token = typeof recipient === 'string' ? null : recipient.token;
  if (!email || items.length === 0) return { sent: 0, failed: 0 };

  const n = items.length;
  const heading = `😴 Pendant votre veille : ${n} alerte${n > 1 ? 's' : ''}`;
  const intro = `Voici ce qui s'est passé pendant vos heures de veille. Les alertes déjà terminées sont signalées.`;

  const rowsHtml = items.map((it) => {
    const name = esc(it.name || 'Votre alerte');
    const link = esc(it.url || it.statusUrl || PUBLIC_SITE);
    if (it.obsolete) {
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;color:#8a8a92;font-size:14px">
        <strong style="color:#6b6459">${name}</strong> — terminée entre-temps${it.message ? ' · ' + esc(it.message) : ''}</td></tr>`;
    }
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f1419">
      <strong>${name}</strong>${it.message ? ' — ' + esc(it.message) : ''}<br>
      <a href="${link}" style="color:#a567e3;font-size:13px">Voir →</a></td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4edfb">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4edfb;padding:28px 14px"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(30,20,50,.08)">
      <tr><td style="background:${ACCENT};padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800"><span style="color:#fff">labonnealerte.fr</span></td></tr>
      <tr><td style="padding:26px 28px 8px;font-family:Arial,Helvetica,sans-serif;color:#0f1419">
        <h1 style="margin:0 0 10px;font-size:20px;font-weight:800">${heading}</h1>
        <p style="margin:0 0 8px;font-size:14px;color:#4a4a52;line-height:1.6">${intro}</p></td></tr>
      <tr><td style="padding:6px 28px 20px"><table role="presentation" width="100%">${rowsHtml}</table></td></tr>
      <tr><td style="padding:0 28px 24px">
        <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">
        <p style="margin:0;font-size:12px;color:#8a8a92;line-height:1.6">Vous recevez ce récapitulatif car vos heures de veille sont actives. Réglez-les dans « Mon compte ».<br>
        Gérer ma collection : <a href="${MYALERTS_URL}" style="color:#8a8a92">${MYALERTS_URL}</a></p></td></tr>
    </table></td></tr></table>
</body></html>`;

  const textLines = items.map((it) => {
    const base = it.name || 'Votre alerte';
    if (it.obsolete) return `- ${base} — terminée entre-temps`;
    return `- ${base}${it.message ? ' — ' + it.message : ''} : ${it.url || it.statusUrl || PUBLIC_SITE}`;
  });
  const text = `${heading}\n\n${intro}\n\n${textLines.join('\n')}\n\n—\nGérer ma collection : ${MYALERTS_URL}`;

  const payload = { from: FROM, to: email, subject: subject(heading), text, html };
  if (token) {
    const unsubUrl = `${SITE_URL}/unsubscribe/${token}`;
    payload.headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  try {
    await resend.emails.send(payload);
    await incEmailCounters();
    return { sent: 1, failed: 0 };
  } catch (err) {
    console.error(`[mailer] Échec digest veille à ${email} :`, err.message);
    return { sent: 0, failed: 1 };
  }
}

/**
 * Relance « échéance qui approche » d'une tâche à échéance glissante (V3).
 * Le bouton confirme la réalisation : il décale l'échéance et invalide le lien
 * (le token est régénéré côté route). Un seul envoi par échéance — la garde est
 * dans le job appelant (user_tasks.last_notified_at), pas ici.
 * @param {{email: string, token: ?string}} recipient
 * @param {{id: number, label: string, next_due: (Date|string), confirm_token: string}} task
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendTaskDueReminder(recipient, task) {
  const email = typeof recipient === 'string' ? recipient : recipient.email;
  const token = typeof recipient === 'string' ? null : recipient.token;
  if (!email || !task || !task.confirm_token) return { sent: 0, failed: 0 };

  const confirmUrl = `${SITE_URL}/tache/${task.id}/confirmer/${task.confirm_token}`;
  // Libellé = texte UTILISATEUR : échappé avant toute interpolation HTML.
  const label = esc(task.label);
  const dueFr = task.next_due
    ? new Date(task.next_due).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const quand = dueFr ? `Échéance prévue le ${dueFr}.` : 'Échéance prévue prochainement.';

  const payload = {
    from: FROM,
    to: email,
    subject: subject(`⏳ ${task.label}`),
    text:
      `${task.label}\n\n${quand}\n\n` +
      `Déjà fait ? Confirme en un clic, l'échéance repart pour un tour :\n${confirmUrl}\n\n` +
      `—\nTu reçois cet email car tu suis cette échéance.` +
      MANAGE_TEXT,
    html: emailShell({
      heading: 'Une échéance approche',
      intro: `<strong>${label}</strong> — ${quand}`,
      button: { url: confirmUrl, label: "C'est fait ✓" },
      // Pas de fallbackUrl : le lien contient un token de 64 caractères, la ligne de
      // repli était plus longue que le reste de l'email pour un gain quasi nul.
      note: "En confirmant, l'échéance repart pour la même durée à partir d'aujourd'hui.",
    }),
  };
  if (token) {
    const unsubUrl = `${SITE_URL}/unsubscribe/${token}`;
    payload.headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  try {
    await resend.emails.send(payload);
    await incEmailCounters();
    return { sent: 1, failed: 0 };
  } catch (err) {
    console.error(`[mailer] Échec relance échéance à ${email} :`, err.message);
    return { sent: 0, failed: 1 };
  }
}

/**
 * Notifie l'auteur d'un sujet qu'une nouvelle réponse a été postée.
 * Calqué sur sendTaskDueReminder (même FROM/subject/emailShell/compteurs).
 * @param {{email: string, token: ?string}} recipient
 * @param {{topicTitle: string, topicUrl: string, replierName: ?string}} info
 * @returns {Promise<{sent: number, failed: number}>}
 */
async function sendForumReplyNotification(recipient, info) {
  const email = typeof recipient === 'string' ? recipient : recipient.email;
  const token = typeof recipient === 'string' ? null : recipient.token;
  if (!email || !info || !info.topicUrl) return { sent: 0, failed: 0 };

  const title = esc(info.topicTitle || 'votre sujet');
  const who = info.replierName ? esc(info.replierName) : 'Quelqu\'un';
  const payload = {
    from: FROM,
    to: email,
    subject: subject(`💬 Nouvelle réponse : ${info.topicTitle || 'votre sujet'}`),
    text:
      `${who} a répondu à votre sujet « ${info.topicTitle || 'votre sujet'} » sur le forum.\n\n` +
      `Lire la réponse :\n${info.topicUrl}\n\n` +
      `—\nVous recevez cet email car vous avez ouvert ce sujet.` +
      MANAGE_TEXT,
    html: emailShell({
      heading: 'Nouvelle réponse sur le forum',
      intro: `<strong>${who}</strong> a répondu à votre sujet « ${title} ».`,
      button: { url: info.topicUrl, label: 'Lire la réponse →' },
      fallbackUrl: info.topicUrl,
      note: 'Vous recevez cet email car vous avez ouvert ce sujet sur le forum de La Bonne Alerte.',
    }),
  };
  if (token) {
    const unsubUrl = `${SITE_URL}/unsubscribe/${token}`;
    payload.headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  try {
    await resend.emails.send(payload);
    await incEmailCounters();
    return { sent: 1, failed: 0 };
  } catch (err) {
    console.error(`[mailer] Échec notif forum à ${email} :`, err.message);
    return { sent: 0, failed: 1 };
  }
}

module.exports = {
  sendConfirmation, sendPromoAlert, sendMagicLink, sendDeferredDigest,
  sendTaskDueReminder, sendForumReplyNotification,
};
