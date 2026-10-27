# Imagen para Easypanel: sin dependencias, solo Node 22.
# Las claves (THESPORTSDB_API_KEY, ODDS_API_KEY...) se definen en la pestaña Environment de Easypanel, no en .env.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
