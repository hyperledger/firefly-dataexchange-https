FROM node:16-alpine3.15 as firefly-dataexchange-builder
ADD --chown=1001:0 . /firefly-dataexchange-https
WORKDIR /firefly-dataexchange-https
RUN mkdir /.npm \
    && chgrp -R 0 /.npm \
    && chmod -R g+rwX /.npm
USER 1001
RUN npm install
RUN npm run build

FROM node:16-alpine3.15
WORKDIR /firefly-dataexchange-https
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/package.json /firefly-dataexchange-https
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/build /firefly-dataexchange-https/build
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/package*.json ./
RUN npm install --production
EXPOSE 3000
EXPOSE 3001
USER 1001

CMD [ "node", "./build/index.js" ]