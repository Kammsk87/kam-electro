FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .
RUN npm run build --workspace @personaos/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=deps /app/node_modules node_modules
CMD ["npm", "run", "start", "--workspace", "@personaos/web"]
