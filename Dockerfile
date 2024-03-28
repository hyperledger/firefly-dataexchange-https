FROM node:16-alpine3.15 as firefly-dataexchange-builder
ADD --chown=1001:0 . /firefly-dataexchange-https
WORKDIR /firefly-dataexchange-https
RUN mkdir /.npm \
    && chgrp -R 0 /.npm \
    && chmod -R g+rwX /.npm
USER 1001
RUN npm install
RUN npm run build

FROM alpine:3.19 AS SBOM
WORKDIR /
ADD . /SBOM
RUN apk add --no-cache curl
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin v0.48.3
RUN trivy fs --format spdx-json --output /sbom.spdx.json /SBOM
RUN trivy sbom /sbom.spdx.json --severity UNKNOWN,HIGH,CRITICAL --exit-code 1


FROM node:16-alpine3.15
WORKDIR /firefly-dataexchange-https
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/package.json /firefly-dataexchange-https
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/build /firefly-dataexchange-https/build
COPY --from=firefly-dataexchange-builder /firefly-dataexchange-https/package*.json ./
RUN npm install --production
EXPOSE 3000
EXPOSE 3001
USER 1001
COPY --from=SBOM /sbom.spdx.json /sbom.spdx.json

CMD [ "node", "./build/index.js" ]