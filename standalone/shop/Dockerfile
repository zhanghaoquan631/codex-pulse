FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/server ./server
COPY --from=build /app/worker ./worker
COPY --from=build /app/scripts/start.mjs ./scripts/start.mjs
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
ENV PORT=8787 NODE_ENV=production STORE_PATH=/data/store.json UPLOADS_PATH=/data/uploads
EXPOSE 8787
CMD ["node", "scripts/start.mjs"]
