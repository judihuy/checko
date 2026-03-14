# Checko — Production Dockerfile
# ⚠️ NICHT ÄNDERN! OpenSSL, nodemailer, NEXT_PUBLIC_APP_URL sind kritisch!
# Node.js 22, multi-stage build

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Stage 2: Build
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# NEXT_PUBLIC_* must be set at build time!
ARG NEXT_PUBLIC_APP_URL=http://31.97.180.225:3100
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js
RUN npm run build

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app

# ⚠️ OpenSSL ist PFLICHT für Prisma Engine!
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# ⚠️ nodemailer muss explizit kopiert werden (Standalone enthält es nicht!)
COPY --from=builder /app/node_modules/nodemailer ./node_modules/nodemailer
# undici für Proxy-Support
COPY --from=builder /app/node_modules/undici ./node_modules/undici

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
