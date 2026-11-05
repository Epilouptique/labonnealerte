// scripts/test-account-deletion.js — suppression de compte effective (exigence Google Play).
//
// Teste la VRAIE route DELETE /api/my-alerts/account sur la VRAIE base, dans UNE transaction
// TOUJOURS annulée (ROLLBACK forcé, aucune option ne commit) :
//   0. avant migration (état actuel possible de la prod) : la route doit échouer proprement
//      (503, rien d'effacé, rien de partiellement anonymisé) ;
//   1. le bloc de migration de server/db/init.sql est appliqué DANS la transaction ;
//   2. compte A complet (forum, signalement, communauté, favori, abonnement, échéance, session,
//      push) + compte B qui a répondu dans le sujet de A : suppression de A → 200, A disparu,
//      contenu public anonymisé, réponse de B intacte, rendus HTML et API corrects, aucun orphelin ;
//   3. compte C membre d'organisation et auteur d'un événement municipal : 200, traces anonymisées ;
//   4. contrôle : aucune FK vers subscribers(id) en NO ACTION.
//
// Méthode (fil « intégrité likes ») : pool patché AVANT tout require de routeur ; toutes les
// requêtes passent par un seul client ; BEGIN/COMMIT/ROLLBACK de la route deviennent des
// SAVEPOINT. Usage : node scripts/test-account-deletion.js [--check] (--check = défaut).
'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const db = require('../server/db');

const realPool = db.pool;
let client;
let sp = 0;

function wrapClient(c) {
  return {
    query(text, params) {
      const t = typeof text === 'string' ? text.trim().toUpperCase() : '';
      if (t === 'BEGIN') { sp += 1; return c.query(`SAVEPOINT route_${sp}`); }
      if (t === 'COMMIT') return c.query(`RELEASE SAVEPOINT route_${sp}`);
      if (t === 'ROLLBACK') return c.query(`ROLLBACK TO SAVEPOINT route_${sp}`);
      return c.query(text, params);
    },
    release() {},
  };
}

async function main() {
  client = await realPool.connect();
  await client.query('BEGIN');
  // Jamais d'attente longue sur un verrou de la prod : on échoue vite plutôt que bloquer.
  await client.query("SET LOCAL lock_timeout = '3s'");
  await client.query("SET LOCAL statement_timeout = '20s'");
  const shared = wrapClient(client);
  // Patch AVANT require des routeurs : tout (y compris effets de bord « fire and forget »)
  // passe par le client de la transaction.
  realPool.query = (text, params) => client.query(text, params);
  realPool.connect = async () => shared;

  const express = require('express');
  const { authTransport } = require('../server/auth-transport');
  const { createSession } = require('../server/sessions');
  const { apiRouter: myAlerts } = require('../server/routes/myalerts');
  const app = express();
  app.use(express.json());
  app.use(authTransport);
  app.use('/api', myAlerts);
  app.use('/api', require('../server/routes/community-reports'));
  app.use('/api', require('../server/routes/app-api'));
  app.use('/', require('../server/routes/forum'));
  const server = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, token, body) => {
    const r = await fetch(base + url, {
      method,
      headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
      body: body ? JSON.stringify(body) : (method === 'DELETE' ? JSON.stringify({ token }) : undefined),
    });
    return { status: r.status, text: await r.text() };
  };
  const q = (t, p) => client.query(t, p);
  const one = async (t, p) => (await q(t, p)).rows[0];
  const stamp = Date.now();
  const ok = (cond, msg) => { assert.ok(cond, msg); console.log('  OK', msg); };

  const mkUser = async (tag) => one(
    `INSERT INTO subscribers (email, confirmed, token, pseudo, display_name)
     VALUES ($1, true, $2, $3, $4) RETURNING id`,
    [`test-suppr-${tag}-${stamp}@exemple.invalid`, `tok${tag}${stamp}`, `testsuppr${tag}${stamp % 100000}`, `testsuppr${tag}${stamp % 100000}`]);
  const source = (await one("SELECT id FROM sources WHERE id = 'vigilance-meteo'"))?.id
    || (await one('SELECT id FROM sources LIMIT 1')).id;

  async function fillAccount(a, b) {
    const t = await one(`INSERT INTO forum_topics (category, title, slug, author_subscriber_id)
      VALUES ('discussion', 'Sujet de test suppression', $1, $2) RETURNING id, slug`, ['test-suppr-' + stamp, a]);
    const p = await one('INSERT INTO forum_posts (topic_id, author_subscriber_id, body) VALUES ($1, $2, $3) RETURNING id',
      [t.id, a, 'Message de A (test suppression)']);
    const reply = await one('INSERT INTO forum_posts (topic_id, author_subscriber_id, body) VALUES ($1, $2, $3) RETURNING id',
      [t.id, b, 'Réponse de B (test suppression)']);
    await q('INSERT INTO forum_reports (post_id, reporter_subscriber_id, reporter_ip_hash) VALUES ($1, $2, $3)', [reply.id, a, 'h' + stamp]);
    const cr = await one(`INSERT INTO community_reports (commune_nom, lat, lon, radius_km, description, author_subscriber_id, expires_at)
      VALUES ('Gap', 44.56, 6.08, 15, 'Chat de test suppression', $1, NOW() + INTERVAL '7 days') RETURNING id`, [a]);
    const cr2 = await one(`INSERT INTO community_reports (commune_nom, lat, lon, radius_km, description, author_subscriber_id, expires_at)
      VALUES ('Gap', 44.56, 6.08, 15, 'Chat de B', $1, NOW() + INTERVAL '7 days') RETURNING id`, [b]);
    await q('INSERT INTO community_report_spots (report_id, subscriber_id) VALUES ($1, $2)', [cr2.id, a]);
    await q('INSERT INTO community_report_subscriptions (report_id, subscriber_id) VALUES ($1, $2)', [cr2.id, a]);
    await q('INSERT INTO favorites (subscriber_id, source_id) VALUES ($1, $2)', [a, source]);
    await q('INSERT INTO subscriptions (subscriber_id, source_id) VALUES ($1, $2)', [a, source]);
    await q(`INSERT INTO user_tasks (subscriber_id, label, tracking_mode, confirm_token, counter_unit, counter_threshold)
      VALUES ($1, 'Test suppression', 'counter', $2, 'km', 1000)`, [a, 'ct' + stamp]);
    await q('INSERT INTO push_subscriptions (subscriber_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)',
      [a, 'https://push.exemple.invalid/' + stamp, 'p', 'a']);
    return { topic: t, post: p, reply, cr, cr2 };
  }

  // ---------- 0. État actuel (avant migration) : échec propre ----------
  console.log('0. Avant migration (si la base n\'est pas encore migrée)');
  await q('SAVEPOINT pre');
  const pending = await one(`SELECT COUNT(*)::int AS n FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'subscribers'::regclass AND confdeltype = 'a'`);
  if (pending.n > 0) {
    const a0 = (await mkUser('a0')).id;
    const b0 = (await mkUser('b0')).id;
    const d0 = await fillAccount(a0, b0);
    const tok0 = await createSession(a0);
    const r0 = await call('DELETE', '/api/my-alerts/account', tok0);
    ok(r0.status === 503 && !/sql|constraint|violat/i.test(r0.text), `503 sans détail SQL (${r0.text})`);
    ok((await one('SELECT COUNT(*)::int n FROM subscribers WHERE id = $1', [a0])).n === 1, 'compte intact');
    ok((await one('SELECT author_subscriber_id a FROM forum_topics WHERE id = $1', [d0.topic.id])).a === a0, 'aucune anonymisation partielle (ROLLBACK)');
  } else {
    console.log('  (base déjà migrée : étape sans objet)');
  }
  await q('ROLLBACK TO SAVEPOINT pre');

  // ---------- 1. Migration dans la transaction ----------
  console.log('1. Migration (bloc de server/db/init.sql)');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'init.sql'), 'utf8');
  const start = sql.indexOf('-- Suppression de compte effective');
  const block = sql.slice(sql.indexOf('DO $$', start), sql.indexOf('END $$;', start) + 'END $$;'.length);
  await q(block);
  await q(block); // idempotence
  ok(true, 'bloc appliqué deux fois sans erreur');

  // ---------- 2. Compte complet + second compte ----------
  console.log('2. Compte A (forum, communauté, favori, abonnement, échéance, session, push) + B');
  const a = (await mkUser('a')).id;
  const b = (await mkUser('b')).id;
  const d = await fillAccount(a, b);
  const tokA = await createSession(a);
  const tokB = await createSession(b);
  const r = await call('DELETE', '/api/my-alerts/account', tokA);
  ok(r.status === 200 && JSON.parse(r.text).ok === true, `200 {ok:true} (${r.text})`);
  ok((await one('SELECT COUNT(*)::int n FROM subscribers WHERE id = $1', [a])).n === 0, 'abonné A disparu');
  ok((await one('SELECT author_subscriber_id x FROM forum_topics WHERE id = $1', [d.topic.id])).x === null, 'sujet conservé, auteur NULL');
  ok((await one('SELECT author_subscriber_id x FROM forum_posts WHERE id = $1', [d.post.id])).x === null, 'message conservé, auteur NULL');
  ok((await one('SELECT author_subscriber_id x, body FROM forum_posts WHERE id = $1', [d.reply.id])).x === b, 'réponse de B intacte');
  ok((await one('SELECT reporter_subscriber_id x FROM forum_reports WHERE post_id = $1', [d.reply.id])).x === null, 'signalement conservé, signaleur NULL');
  ok((await one('SELECT author_subscriber_id x, description FROM community_reports WHERE id = $1', [d.cr.id])).x === null, 'signalement communautaire conservé, auteur NULL');
  for (const t of ['community_report_spots', 'community_report_subscriptions', 'favorites', 'subscriptions', 'user_tasks', 'push_subscriptions', 'sessions', 'deferred_notifications', 'source_likes', 'points_ledger']) {
    ok((await one(`SELECT COUNT(*)::int n FROM ${t} WHERE subscriber_id = $1`, [a])).n === 0, `${t} : aucune ligne restante`);
  }
  const page = await call('GET', `/forum/t/${d.topic.slug}`);
  ok(page.status === 200 && page.text.includes('Membre supprimé') && page.text.includes('Réponse de B'), 'HTML /forum/t/:slug : « Membre supprimé » et réponse de B');
  ok(!/href="\/u\/[^"]*"[^>]*>@?Membre supprimé/.test(page.text), '« Membre supprimé » non cliquable');
  const appT = await call('GET', `/api/app/forum/topics/${d.topic.slug}`);
  ok(appT.status === 200 && appT.text.includes('Membre supprimé'), 'API app /api/app/forum/topics/:slug OK');
  const cr = await call('GET', '/api/community-reports', tokB);
  ok(cr.status === 200, `GET /api/community-reports OK (${cr.status})`);
  const orphans = await one(`SELECT
      (SELECT COUNT(*) FROM forum_posts fp LEFT JOIN subscribers s ON s.id = fp.author_subscriber_id WHERE fp.author_subscriber_id IS NOT NULL AND s.id IS NULL)
    + (SELECT COUNT(*) FROM community_report_spots x LEFT JOIN subscribers s ON s.id = x.subscriber_id WHERE s.id IS NULL) AS n`);
  ok(Number(orphans.n) === 0, 'aucune ligne orpheline');

  // ---------- 3. Membre d'organisation, auteur d'un événement municipal ----------
  console.log('3. Compte C : organisation et événement municipal');
  const c = (await mkUser('c')).id;
  const org = await one("INSERT INTO organizations (name, requester_subscriber_id) VALUES ('Commune de test suppression', $1) RETURNING id", [c]);
  await q("INSERT INTO organization_members (org_id, subscriber_id, role, status) VALUES ($1, $2, 'admin', 'actif')", [org.id, c]);
  const ev = await one(`INSERT INTO municipal_events (org_id, author_subscriber_id, notify_requested_by, title, body, commune_insee)
    VALUES ($1, $2, $2, 'Coupure test', 'Test suppression', '05061') RETURNING id`, [org.id, c]);
  await q("INSERT INTO municipal_event_notifications (event_id, kind, actor_subscriber_id) VALUES ($1, 'test', $2)", [ev.id, c]);
  const tokC = await createSession(c);
  const rc = await call('DELETE', '/api/my-alerts/account', tokC);
  ok(rc.status === 200, `200 (${rc.text})`);
  const e = await one('SELECT author_subscriber_id a, notify_requested_by n FROM municipal_events WHERE id = $1', [ev.id]);
  ok(e && e.a === null && e.n === null, 'événement conservé, auteur et demandeur NULL');
  ok((await one('SELECT actor_subscriber_id x FROM municipal_event_notifications WHERE event_id = $1', [ev.id])).x === null, 'journal conservé, acteur NULL');
  ok((await one('SELECT requester_subscriber_id x FROM organizations WHERE id = $1', [org.id])).x === null, 'organisation conservée, demandeur NULL');
  ok((await one('SELECT COUNT(*)::int n FROM organization_members WHERE org_id = $1', [org.id])).n === 0, 'adhésion effacée (organisation sans membre, signalée au rapport)');

  // ---------- 4. Contrôle des FK ----------
  console.log('4. Contrôle : FK vers subscribers(id) en NO ACTION');
  const na = await q(`SELECT conrelid::regclass AS t, conname FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'subscribers'::regclass AND confdeltype = 'a'`);
  ok(na.rows.length === 0, `0 ligne (${na.rows.map((x) => x.t + '.' + x.conname).join(', ') || 'aucune'})`);

  server.close();
  console.log('\nTOUS LES TESTS PASSENT (transaction annulée, base inchangée)');
}

main()
  .catch((err) => { console.error('ECHEC :', err.message); process.exitCode = 1; })
  .finally(async () => {
    if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
    await realPool.end().catch(() => {});
  });
