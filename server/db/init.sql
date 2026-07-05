CREATE TABLE IF NOT EXISTS promo_status (
  id SERIAL PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT false,
  pending BOOLEAN NOT NULL DEFAULT false,
  date_debut TIMESTAMPTZ,
  date_fin TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO promo_status (active, pending)
SELECT false, false
WHERE NOT EXISTS (SELECT 1 FROM promo_status);

CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  confirmed BOOLEAN DEFAULT false,
  token VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
