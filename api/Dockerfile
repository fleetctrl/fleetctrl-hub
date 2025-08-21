FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -ldflags="-X 'main.runningInDocker=true'" -o fleetctrl-api ./

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/fleetctrl-api .
EXPOSE 8080
ENV PORT=8080
ENV RUNNING_IN_DOCKER=true
CMD ["./fleetctrl-api"]
