# Base image: Node 22 on Alpine Linux (small footprint)
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (this layer is cached unless package files change)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy Prisma schema and config, then generate the client
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

# Copy the rest of the application source
COPY . .

# Create a non-root user and ensure the uploads directory exists with correct ownership
RUN addgroup -S app \
    && adduser -S app -G app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app

USER app

EXPOSE 3000

CMD ["node", "app.js"]
