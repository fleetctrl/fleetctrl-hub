# Vygeneruje migraci z aktuální databáze
.PHONY: pull-schema
pull-schema:
	@echo "Generuji migraci z databáze $(DB_HOST):$(DB_PORT)/$(DB_NAME)..."
	supabase db pull --db-url "$(DB_URL)"
	@echo "Migrace vygenerována úspěšně!"