# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
RUN apk add --no-cache python3 ffmpeg py3-pip && pip3 install yt-dlp
COPY package.json pnpm-lock.yaml ./ # Copy package.json and lockfile
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Stage 2: Runner
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/index.js"]