# Use Node.js LTS base image
FROM node:18

# Set working directory
WORKDIR /app

# Set env for production
ENV NODE_ENV=production

# Copy dependency manifests and install (better layer caching)
COPY package.json package-lock.json* ./

RUN npm ci --only=production || npm install --only=production && \
    npm cache clean --force

# Copy the rest of the app (including server and static files)
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
