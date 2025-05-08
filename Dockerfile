FROM node:18

WORKDIR /app

COPY package*.json ./

# Install dependencies and explicitly add bs58
RUN npm install
RUN npm install bs58 --save

COPY . .

EXPOSE 5000

# For production use npm start instead of npm run dev
CMD ["npm", "start"]