# Use Node.js LTS base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy dependency manifests and install (better layer caching)
COPY package*.json ./
RUN npm install --production

# Copy the rest of the app (including server and static files)
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm","start"]
