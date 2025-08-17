# Supabase Docker

This is a minimal Docker Compose setup for self-hosting Supabase. Follow the steps [here](https://supabase.com/docs/guides/hosting/docker) to get started.

## Start

1. Nainstalujte node moduly ve složce `web`

```
cd ..
npm install
```

2. Vygeneruj anon a service key

```
node ./scripts/gen_anon.js
```

```
node ./scripts/gen_service.js
```

3. Nainstalujte makefile

## Vytvoření migrace

```
make diff-schema
```
