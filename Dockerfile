# Use Node.js LTS base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json first (for caching)
COPY package.json .

# Install dependencies (none here, but good practice)
RUN npm install

# Copy rest of the code
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
