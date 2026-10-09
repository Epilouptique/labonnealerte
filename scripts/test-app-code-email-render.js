// scripts/test-app-code-email-render.js — TEST DE RENDU (aucun envoi réel) de l'e-mail de code
// de connexion de l'application (fil APP-05). Vérifie que l'e-mail ne contient AUCUN lien vers
// le site (ni bouton, ni lien de repli, ni lien de pied de page) et que le jeton du lien magique
// n'est PAS envoyé. On STUBBE le client Resend : son `emails.send` capture le payload sans
// rien envoyer ; aucun accès réseau, aucun accès base.
//
// Lancer : node scripts/test-app-code-email-render.js

require('dotenv').config();
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'stub-non-utilise';

const assert = require('assert');

// Stub du module 'resend' AVANT que mailer.js ne le require.
const resendPath = require.resolve('resend');
const sent = [];
require.cache[resendPath] = {
  id: resendPath, filename: resendPath, loaded: true, children: [],
  exports: {
    Resend: class {
      constructor() { this.emails = { send: (p) => { sent.push(p); return Promise.resolve({ id: 'stub' }); } }; }
    },
  },
};

const mailer = require('../server/mailer');

let passed = 0;
function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  ✓ ' + name); })
    .catch((e) => { console.error('  ✗ ' + name + '\n    ' + (e.message || e)); process.exitCode = 1; });
}

(async () => {
  console.log('TEST rendu e-mail de code app (APP-05, sans lien ; aucun envoi réel)');

  const MAGIC_TOKEN = 'a'.repeat(64); // jeton du lien magique : généré côté serveur, NON envoyé
  await mailer.sendAppLoginCode('test@example.com', MAGIC_TOKEN, '123456');

  const payload = sent[sent.length - 1];
  assert.ok(payload, 'le mailer aurait dû appeler resend.emails.send');
  const html = String(payload.html || '');
  const text = String(payload.text || '');

  test('aucun lien <a href> dans le HTML (ni bouton, ni repli, ni pied de page)', () => {
    assert.ok(!/<a\s+href/i.test(html), 'un <a href> est présent');
  });

  test("aucune URL vers le site dans le HTML (pas de lien MYALERTS/connexion)", () => {
    assert.ok(!/https?:\/\/labonnealerte\.fr/i.test(html), 'une URL du site est présente dans le HTML');
  });

  test('aucune URL http(s) dans la version texte', () => {
    assert.ok(!/https?:\/\//i.test(text), 'une URL est présente dans le texte');
  });

  test('le code à 6 chiffres est bien présent (HTML + texte)', () => {
    assert.ok(/123456/.test(html) && /123456/.test(text));
  });

  test("le jeton du lien magique n'est PAS envoyé (ni HTML ni texte)", () => {
    assert.ok(!html.includes(MAGIC_TOKEN) && !text.includes(MAGIC_TOKEN), 'le jeton magique fuite dans l\'e-mail');
  });

  // Laisse les assertions asynchrones s'exécuter puis conclut.
  setImmediate(() => {
    console.log(`\n${passed} test(s) réussi(s)` + (process.exitCode ? ' — ÉCHECS présents.' : '.'));
  });
})();
