FROM alpine:3.22

ARG PB_VERSION=0.40.4
ARG PB_SHA256=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa

RUN apk add --no-cache ca-certificates unzip \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pocketbase.zip \
    && echo "${PB_SHA256}  /tmp/pocketbase.zip" | sha256sum -c - \
    && mkdir -p /pb/pb_data /pb/pb_hooks \
    && unzip /tmp/pocketbase.zip -d /pb \
    && rm /tmp/pocketbase.zip

COPY pb_hooks/ /pb/pb_hooks/

RUN addgroup -S pocketbase \
    && adduser -S -G pocketbase -h /pb pocketbase \
    && chown -R pocketbase:pocketbase /pb

USER pocketbase
WORKDIR /pb
EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
