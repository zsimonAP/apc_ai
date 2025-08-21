FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./server.js
COPY public ./public

# Run as non-root
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
