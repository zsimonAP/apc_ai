FROM node:20-alpine


WORKDIR /app


# Install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --only=production


# Copy source
COPY . .


ENV PORT=3000
EXPOSE 3000


# Note: running as root to read Docker secrets at /run/secrets
CMD ["node", "server.js"]