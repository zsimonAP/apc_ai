# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Add Python for CSV generation helper
RUN apk add --no-cache python3

# Copy built app
COPY --from=build /app /app

EXPOSE 3000
CMD ["npm", "start"]
