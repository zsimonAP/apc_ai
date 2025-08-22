# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# copy both files so npm ci can run
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# then copy the rest
COPY . .

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "start"]
