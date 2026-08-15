# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ && npm install -g npm@latest
COPY package.json package-lock.json* ./
RUN npm ci

# Prisma-only stage: used directly (via `target: prisma`) as the one-off
# `prisma db push` runner in docker-compose.prod.yml. Deliberately stops
# short of `npm run build` — the migrate job only ever runs `prisma db
# push`, never the compiled app, so making it build the whole Next.js app
# too just wastes time and memory (worse: `docker compose build` builds
# this and the `app` target's `next build` in parallel, doubling peak
# memory on a small instance — this split is what avoids that).
FROM node:22-alpine AS prisma
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Full build stage: continues on to actually compile the Next.js app.
FROM prisma AS builder
WORKDIR /app
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/public/uploads \
  && chown -R nextjs:nodejs /app/public/uploads

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
