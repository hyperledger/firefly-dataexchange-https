FROM node:16-alpine3.15 as firefly-dataexchange-builder
RUN apk add --update python3 make
ADD . /firefly-dataexchange-https
WORKDIR /firefly-dataexchange-https
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
CMD [ "node", "./build/index.js" ]