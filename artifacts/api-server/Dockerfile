FROM node:22-alpine
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Install ffmpeg and python for youtube-dl-exec
RUN apk add --no-cache ffmpeg python3 py3-pip && pip3 install yt-dlp

COPY package.json pnpm-lock.yaml* ./ # Copy package.json and lockfile
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 8080
CMD ["pnpm", "start"]
