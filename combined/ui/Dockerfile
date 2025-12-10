FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --legacy-peer-deps || true
COPY . .
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3004"]


