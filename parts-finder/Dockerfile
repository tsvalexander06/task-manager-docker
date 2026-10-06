# Core web app (catalog + deep-link search + comparison worksheet).
# Note: the optional auto-fetch / interactive login needs a real browser and a
# display, so for that feature run with Node directly on your machine instead
# (see README). This image is for the always-works core.
FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional --no-audit --no-fund
COPY src ./src
COPY public ./public
EXPOSE 8080
ENV PORT=8080
CMD ["node", "src/server.js"]
