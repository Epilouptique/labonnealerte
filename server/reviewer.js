// Compte de démonstration pour la validation Google Play (examen de l'app).
//
// POURQUOI : la connexion de l'app se fait par e-mail + code à 6 chiffres reçu par mail.
// Le relecteur Google ne peut pas recevoir ce mail. On autorise donc UNE adresse précise
// à se connecter avec un code FIXE, sans qu'aucun e-mail ne parte.
//
// SÉCURITÉ / PÉRIMÈTRE :
//  · entièrement piloté par deux variables d'environnement (aucune valeur en dur ici) ;
//    REVIEWER_EMAIL et REVIEWER_CODE (exactement 6 chiffres). Si l'une manque ou est
//    invalide, la fonction est INACTIVE (classifyReviewerLogin ⇒ 'disabled').
//  · ne concerne QUE cette adresse : toute autre adresse suit le flux normal.
//  · le code fixe ne contourne pas l'anti-force-brute : la route verify garde le comptage
//    d'essais par adresse et la limite par IP (cf. app-api.js).
'use strict';
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function norm(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Adresse du relecteur (normalisée) si elle est définie et bien formée, sinon ''.
function reviewerEmail() {
  const e = norm(process.env.REVIEWER_EMAIL);
  return e && e.length <= 254 && EMAIL_RE.test(e) ? e : '';
}

// Code fixe à 6 chiffres si défini et valide, sinon ''.
function reviewerCode() {
  const c = String(process.env.REVIEWER_CODE || '');
  return /^\d{6}$/.test(c) ? c : '';
}

// La fonction est active seulement si les DEUX variables sont présentes et valides.
function isEnabled() {
  return !!(reviewerEmail() && reviewerCode());
}

// Vrai si `email` est l'adresse du relecteur ET que la fonction est active.
// Sert à n'envoyer AUCUNE notification réelle (mail/push) vers cette adresse.
function isReviewerEmail(email) {
  return isEnabled() && norm(email) === reviewerEmail();
}

// Verdict PUR de la connexion relecteur (testable sans base) :
//   'disabled'     → fonction inactive (variable absente) → flux normal
//   'not-reviewer' → ce n'est pas l'adresse relecteur       → flux normal
//   'match'        → bonne adresse + bon code               → ouvrir une session
//   'mismatch'     → bonne adresse, mauvais code            → refuser (et compter l'échec)
function classifyReviewerLogin(email, code) {
  if (!isEnabled()) return 'disabled';
  if (norm(email) !== reviewerEmail()) return 'not-reviewer';
  const a = Buffer.from(String(code));
  const b = Buffer.from(reviewerCode());
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return ok ? 'match' : 'mismatch';
}

module.exports = { reviewerEmail, isEnabled, isReviewerEmail, classifyReviewerLogin };
