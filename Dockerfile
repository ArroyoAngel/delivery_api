FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build
RUN npx tsc -p tsconfig.migrations.json

FROM node:20-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY --from=builder /app/dist ./dist
COPY database ./database
COPY tsconfig.json tsconfig.typeorm.json ormconfig.ts ormconfig-seed.ts ./
EXPOSE 3002
CMD ["sh", "-c", "npm run setup && node dist/main.js"]
