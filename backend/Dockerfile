FROM node:20-alpine AS builder
WORKDIR /app
COPY sdk/core ./sdk/core
COPY backend ./backend
RUN cd sdk/core && npm ci && npm run build
RUN cd backend && npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/sdk/core ./sdk/core
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/
RUN cd sdk/core && npm ci --omit=dev
RUN cd backend && npm ci --omit=dev
WORKDIR /app/backend
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
