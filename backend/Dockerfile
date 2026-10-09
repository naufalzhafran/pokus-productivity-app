FROM alpine:3.22

ARG PB_VERSION=0.40.4
ARG PB_SHA256_AMD64=9042ec818570e79c3628dadcd0a756c1496d9e1173918ec409d133c02f82e5fa
ARG PB_SHA256_ARM64=86095bf8ed9345954f0d2bf0a5fb9b57584ae60b77ebf3b6cd23a8003a3fd418
# Set by BuildKit for the target platform; defaults to amd64 for the classic builder.
ARG TARGETARCH=amd64

RUN case "${TARGETARCH}" in \
      amd64) PB_SHA256="${PB_SHA256_AMD64}" ;; \
      arm64) PB_SHA256="${PB_SHA256_ARM64}" ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && apk add --no-cache ca-certificates unzip \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -O /tmp/pocketbase.zip \
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
