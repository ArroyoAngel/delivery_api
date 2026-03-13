FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps
COPY dist ./dist
EXPOSE 3002
CMD ["node", "dist/src/main.js"]
