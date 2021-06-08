FROM node:14-alpine3.11 as firefly-dataexchange-builder
RUN apk add git
RUN git clone https://github.com/kaleido-io/firefly-dataexchange-https.git
WORKDIR /firefly-dataexchange-https
RUN apk add --update python make
RUN npm install
RUN npm run build

FROM node:14-alpine3.11
WORKDIR /firefly-dataexchange-https
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/package.json /firefly-dataexchange-https
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/build /firefly-dataexchange-https/build
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/node_modules /firefly-dataexchange-https/node_modules
EXPOSE 3000
EXPOSE 3001
CMD [ "node", "./build/index.js" ]