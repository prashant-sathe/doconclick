# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ && npm install -g npm@latest
COPY package.json package-lock.json* ./
RUN npm ci

# Full build stage: also used directly (via `target: builder`) as the
# one-off `prisma db push` runner in docker-compose.prod.yml, since it
# still has the full node_modules (including the Prisma CLI + engines)
# that the pruned standalone output below intentionally drops.
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
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
