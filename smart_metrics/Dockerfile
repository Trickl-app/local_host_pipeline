# Stage 1 - builder: compile TypeScript into JS
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# install all deps including devDependencies (typescript compiler needed here)
RUN npm install

# copy source after installing deps so Docker cache reuses the install layer on code-only changes
COPY . .
# compile TypeScript — outputs to dist/
RUN npm run build

# Stage 2 - production: lean runtime image, no source or dev tools
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
# --omit=dev skips devDependencies — no typescript compiler in the final image
RUN npm install --omit=dev

# pull only the compiled output from the builder stage, discarding everything else
COPY --from=builder /app/dist ./dist

# start the compiled app — matches the "start" script in package.json
CMD ["node", "dist/index.js"]
