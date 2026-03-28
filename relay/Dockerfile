FROM node:20-alpine

WORKDIR /app

# Copy package manifests first for layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled output (run `npm run build` before docker build)
COPY dist/ ./dist/

# Optional: copy a default model file if present
# COPY public/model.glb ./public/model.glb

EXPOSE 7000

# Healthcheck — confirms the relay is accepting requests
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:7000/health || exit 1

CMD ["node", "dist/server.js"]
