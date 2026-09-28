# syntax=docker/dockerfile:1.7
# ═══════════════════════════════════════════════════════════════════
# Production obrazi (T-114, 08 §8.3). Kontekst — repo ildizi:
#   docker build -f apps/api/Dockerfile .      # server (Contabo) — amd64
#   docker build --platform linux/arm64 ...    # ARM server bo'lsa
#
# Bosqichlar: build (hamma bog'liqlik, yig'ish) → prod-deps (faqat
# ishlash uchun kerakli paketlar + Prisma klienti) → runtime (root'siz).
# ═══════════════════════════════════════════════════════════════════

FROM node:22-alpine AS build
# argon2/sharp — tayyor binar bo'lmasa manbadan yig'ish uchun (faqat shu bosqichda)
RUN apk add --no-cache python3 make g++ openssl
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @crm/shared \
 && npm run db:generate -w @crm/api \
 && npm run build -w @crm/api

FROM node:22-alpine AS prod-deps
RUN apk add --no-cache python3 make g++ openssl
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# Dev paketlarsiz; `prisma` CLI — ishlash bog'liqligi (migratsiya alohida qadam, 08 §8.4)
RUN npm ci --omit=dev
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN cd apps/api && npx prisma generate

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Root'dan ishlamaymiz
RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=app:app /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=app:app /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
USER app
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# tini — SIGTERM node'ga yetadi (graceful shutdown), zombi jarayon qolmaydi
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
