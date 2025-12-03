FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy application files
COPY . .

# Expose port 3002
EXPOSE 3002

# Start application
CMD ["npm", "run", "dev"]
