FROM --platform=$BUILDPLATFORM golang:1.27.1-alpine3.24 AS build
RUN apk add --no-cache ca-certificates
WORKDIR /src/collector
COPY collector/go.mod collector/go.sum ./
RUN go mod download
COPY savereader/go.mod /src/savereader/
RUN cd /src/savereader && go mod download
COPY package.json /src/package.json
COPY collector/ ./
COPY savereader/ /src/savereader/
ARG VERSION
ARG TARGETOS
ARG TARGETARCH
RUN version="${VERSION:-$(sed -n 's/^  "version": "\(.*\)",$/\1/p' /src/package.json)}" \
 && CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -trimpath -ldflags "-s -w -X github.com/oddessentials/magpie/collector/internal/buildinfo.Version=${version}" -o /out/magpie-collector ./cmd/magpie-collector \
 && cd /src/savereader \
 && CGO_ENABLED=0 GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -trimpath -ldflags "-s -w -X main.version=${version}" -o /out/magpie-savereader ./cmd/magpie-savereader \
 && mkdir -p /out/data

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/magpie-collector /magpie-collector
COPY --from=build /out/magpie-savereader /magpie-savereader
COPY --from=build /out/data /data
ENV MAGPIE_JOURNAL_DIR=/data \
    MAGPIE_LOGS_SOURCE=docker
VOLUME ["/data"]
ENTRYPOINT ["/magpie-collector"]
