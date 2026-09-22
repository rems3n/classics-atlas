FROM node:24-bookworm-slim
WORKDIR /app
COPY index.html home.html server.cjs ./
COPY data/catalog.json data/reading-paths.json ./data/
COPY docker-entrypoint.sh /usr/local/bin/atlas-entrypoint
RUN chmod +x /usr/local/bin/atlas-entrypoint
ENV NODE_ENV=production
ENV ATLAS_DB=/data/atlas.sqlite
EXPOSE 3000
ENTRYPOINT ["atlas-entrypoint"]
