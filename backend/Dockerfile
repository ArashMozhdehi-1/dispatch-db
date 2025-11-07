FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for development)
# This will install olcs and cesium automatically from package.json
# These packages are needed for TypeScript types and build-time support
# The actual runtime libraries are loaded via CDN in the browser
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start in development mode with hot reloading
CMD ["npm", "run", "dev"]
