FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
RUN npm install
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
RUN npm install --omit=dev
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/apps/web/next.config.mjs apps/web/next.config.mjs
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]

