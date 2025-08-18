FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o fleetctrl-api main.go

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/fleetctrl-api .
EXPOSE 8080
ENV PORT=8080
CMD ["./fleetctrl-api"]
