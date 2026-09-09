const { Pool } = require('pg');

// Pool PostgreSQL. La connexion n'est réellement tentée qu'à la première requête,
// donc l'absence de DB ne bloque pas le démarrage du serveur. `min` ci-dessous ne
// change PAS cette propriété : pg-pool ne lit `min` que dans _isAboveMin(), appelé
// uniquement au moment de rendre une connexion au pool (_release), pour décider si
// elle a le droit d'expirer. Il n'ouvre jamais de connexion à la construction —
// vérifié dans pg-pool 3.14, dont le constructeur n'initialise que des tableaux vides.
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  // Railway impose le SSL sur ses connexions publiques ; le certificat est
  // auto-signé côté proxy d'où rejectUnauthorized: false.
  ssl: { rejectUnauthorized: false },

  // POURQUOI CES VALEURS. Mesuré en production : un aller-retour SQL coûte ~145 ms
  // (l'applicatif et la base ne sont pas colocalisés), et l'ÉTABLISSEMENT d'une
  // connexion coûte ~0,8 à 1,6 s. Avec le défaut de pg (idleTimeoutMillis: 10000,
  // min: 0), toute connexion était fermée après 10 s d'inactivité : dès que deux
  // visiteurs étaient espacés de plus de 10 s, le premier repayait l'établissement.
  // Mesure de contrôle : après 30 s de pause, le premier /api/sources sortait à
  // 1,69 s contre 0,23 s à chaud, deux fois de suite, pendant que /sw.js (sans SQL)
  // répondait en 71 ms — le conteneur ne dormait pas, seule la connexion était morte.
  idleTimeoutMillis: 300000, // 5 min : couvre les creux de trafic réels.
  min: 2,                    // deux connexions ne sont jamais fermées une fois ouvertes.
                             // C'est la pièce décisive : relever idleTimeoutMillis seul
                             // déplacerait le mur à 5 min au lieu de le supprimer.
  max: 10,                   // explicite (c'était déjà le défaut implicite). Nécessaire
                             // aux lectures en Promise.all : 5 requêtes = 5 connexions.
  keepAlive: true,           // sans keepalive TCP, une connexion longue distance restée
                             // inactive se fait couper par un équipement intermédiaire,
                             // et min: 2 garderait des connexions mortes.
  connectionTimeoutMillis: 10000, // borne l'attente si un établissement se bloque.
});

pool.on('error', (err) => {
  console.error('[db] Erreur inattendue du pool PostgreSQL :', err.message);
});

module.exports = { pool };
