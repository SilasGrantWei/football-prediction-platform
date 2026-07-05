FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY services/api/package.json services/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
COPY services/api services/api
WORKDIR /app/services/api
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY services/api/package.json services/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --omit=dev
COPY --from=build /app/services/api/dist services/api/dist
WORKDIR /app/services/api
EXPOSE 4000
CMD ["npm", "run", "start"]

