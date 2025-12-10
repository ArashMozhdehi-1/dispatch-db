FROM node:18-alpine

WORKDIR /app

# Install Python and dependencies for Turn Path API
RUN apk add --no-cache python3 py3-pip py3-psycopg2

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
