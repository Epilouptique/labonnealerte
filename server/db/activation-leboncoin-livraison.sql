-- ============================================================================
-- ACTIVATION de la carte leboncoin-livraison — GESTE PRODUIT MANUEL.
--
-- VOLONTAIREMENT HORS init.sql : migrate.js rejoue init.sql à chaque déploiement.
-- Y mettre un `enabled = true` réactiverait la carte automatiquement à chaque
-- redéploiement, y compris après une désactivation délibérée. Décider qu'une alerte
-- est visible du public reste une décision humaine, prise une fois.
--
-- Contexte : bascule du 06/09/2026, la source détecte désormais la promo via Dealabs
-- (cf. server/sources/lib/dealabs-promo.js). La promo est active au moment de la
-- bascule — la carte doit donc passer active dès le premier cycle après déploiement.
--
-- À jouer sur la console PostgreSQL de prod. Les trois blocs sont idempotents.
-- ============================================================================

-- 1. ÉTAT DES LIEUX (à lire AVANT de décider) ────────────────────────────────
SELECT s.id, s.enabled, s.requires_confirmation, s.badge,
       st.source_id IS NOT NULL AS a_une_ligne_source_states,
       st.state, st.since, st.updated_at
  FROM sources s
  LEFT JOIN source_states st ON st.source_id = s.id
 WHERE s.id = 'leboncoin-livraison';

-- 2. LIGNE source_states — filet, ne fait rien si elle existe déjà ────────────
INSERT INTO source_states (source_id)
SELECT 'leboncoin-livraison'
 WHERE NOT EXISTS (SELECT 1 FROM source_states WHERE source_id = 'leboncoin-livraison');

-- 3. ACTIVATION ──────────────────────────────────────────────────────────────
UPDATE sources SET enabled = true
 WHERE id = 'leboncoin-livraison' AND enabled IS DISTINCT FROM true;

-- 4. OPTIONNEL — NOTIFICATION IMMÉDIATE (à jouer SEULEMENT si tu le décides) ──
--
-- Par défaut requires_confirmation = true : la source doit être vue active sur DEUX
-- cycles consécutifs avant de notifier, soit ~30 min de latence supplémentaire
-- (inactive → pending → active). C'est le réglage prudent des scrapers.
--
-- Argument POUR passer à false : Dealabs est du JSON structuré, pas du scraping
-- fragile ; 42 sondes sans faux positif ; et une promo de 67 h notifiée 30 min trop
-- tard reste utile — donc le gain est faible.
-- Argument CONTRE : un thread Dealabs mal étiqueté (isExpired absent, deal reposté)
-- enverrait une notification à TOUS les abonnés sans second avis. La confirmation sur
-- 2 cycles est exactement le filet qui rattrape ça.
--
-- RECOMMANDATION : NE PAS jouer ce bloc. Garder requires_confirmation = true, observer
-- ce premier week-end, décider ensuite sur pièces.
--
-- UPDATE sources SET requires_confirmation = false WHERE id = 'leboncoin-livraison';

-- 5. VÉRIFICATION APRÈS COUP (rejouer le SELECT du bloc 1) ────────────────────
