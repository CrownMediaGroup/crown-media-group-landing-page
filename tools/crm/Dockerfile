FROM node:22-alpine
WORKDIR /app
COPY crm/package*.json ./
RUN npm ci --only=production
COPY crm/ .
COPY kingdom-reach/ /kingdom-reach/
EXPOSE 3001
ENV DATA_DIR=/data
ENV NODE_ENV=production
CMD ["node", "server.js"]
