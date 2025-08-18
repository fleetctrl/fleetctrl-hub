# fleetctrl-hub

## Start

1. Nainstalujte node moduly

```
npm install
```

2. Vygeneruj anon a service key

```
node ./supabase/scripts/gen_anon.cjs

node ./supabase/scripts/gen_service.cjs
```

3. Nainstalujte makefile

4. spusť supabase a webserver

```
docker compose up -d
```

5. pushni db schema

```
make push-schema
```

## Go API

V adresáři `api` je jednoduché Go API nahrazující postgres funkce Supabase. API očekává proměnné prostředí `SUPABASE_URL`, `SUPABASE_KEY` a `API_TOKEN`.
Token se předává v hlavičce `Authorization: Bearer <token>` a je ověřován middlewarem.

```bash
go run ./api
# nebo
docker compose up api
```

## Vytvoření migrace

```
make diff-schema
```

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
See the [LICENSE](./LICENSE) file for details.
