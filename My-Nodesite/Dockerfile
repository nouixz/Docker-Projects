# Use Node.js LTS base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json . 

RUN npm install && \
    npm cache clean --force

# Copy the rest of the app (including server.js)
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
