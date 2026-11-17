VAULT_FILE ?= $(HOME)/.dotfiles/omni-desk.env.vault
ENV_OUT    ?= .env.local

.PHONY: help install render-env start dev check build dist-mac dist-win

help:
	@echo "Targets:"
	@echo "  make install     - Install dependencies and Electron binary"
	@echo "  make render-env  - Decrypt VAULT_FILE ($(VAULT_FILE)) to $(ENV_OUT)"
	@echo "  make start       - Run development app (pnpm dev)"
	@echo "  make check       - Run boundary lint, typecheck, and tests"
	@echo "  make build       - Build main, preload, and renderer"
	@echo "  make dist-mac    - Build macOS .dmg package"
	@echo "  make dist-win    - Build Windows .exe package"

install:
	pnpm install
	node apps/desktop/node_modules/electron/install.js

render-env:
	@test -f "$(VAULT_FILE)" || { echo "Vault file not found: $(VAULT_FILE)"; exit 1; }
	ansible-vault view "$(VAULT_FILE)" > "$(ENV_OUT)"
	@chmod 600 "$(ENV_OUT)"
	@echo "Rendered $(ENV_OUT)"

start:
	pnpm dev

dev: start

check:
	pnpm check

build:
	pnpm build

dist-mac:
	pnpm dist:mac

dist-win:
	pnpm dist:win
