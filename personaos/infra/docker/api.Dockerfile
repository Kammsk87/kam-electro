FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .
RUN npm run build --workspace @personaos/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=deps /app/node_modules node_modules
CMD ["node", "apps/api/dist/main.js"]
