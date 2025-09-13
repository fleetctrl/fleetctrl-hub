include .env
# Vygeneruje migraci z aktuální databáze
.PHONY: pull-schema
diff-schema:
	@echo "Generuji migraci z databáze"
	npx supabase db diff -f "migration" --db-url ${POSTGRES_URL}
	@echo "Migrace vygenerována úspěšně!"

.PHONY: create-schema
create-schema:
	@echo "Generuji migraci z databáze"
	npx supabase migration new migration
	@echo "Migrace vygenerována úspěšně!"

.PHONY: reset-schema
reset-schema:
	@echo "Generuji migraci z databáze"
	npx supabase db reset --db-url ${POSTGRES_URL}
	@echo "Databáze resetována!"

.PHONY: push-schema
push-schema:
	@echo "Pushuj migrace do databáze"
	npx supabase db push --db-url ${POSTGRES_URL}
	@echo "Migrace vygenerována úspěšně!"