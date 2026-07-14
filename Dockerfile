# Image de déploiement Railway.
#
# On part de l'image officielle Playwright : elle embarque Chromium (+ le
# « headless shell ») AVEC toutes les dépendances système, à la version EXACTE
# du paquet npm `playwright`. C'est de loin l'option la plus fiable — Nixpacks
# + Playwright oblige à réconcilier à la main les libs système (libnss3, libatk…)
# et casse à chaque mise à jour de Chromium.
#
# ⚠️ La version du tag DOIT suivre la version de `playwright` dans package.json.
#    Ici : playwright 1.61.1 → mcr.microsoft.com/playwright:v1.61.1-jammy.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# Dépendances d'abord (cache Docker). Les navigateurs sont déjà dans l'image
# (PLAYWRIGHT_BROWSERS_PATH est défini), donc pas de téléchargement ici.
COPY package*.json ./
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Railway fournit $PORT ; le serveur l'écoute déjà (server/index.js).
EXPOSE 3000

CMD ["npm", "start"]
