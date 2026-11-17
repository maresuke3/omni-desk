VAULT_FILE      ?= $(CURDIR)/ansible/group_vars/all/secrets.yml
VAULT_PASS_FILE ?=
ENV_OUT         ?= $(CURDIR)/.env.local

ANSIBLE_DIR     := $(CURDIR)/ansible
VAULT_FLAGS     := $(if $(VAULT_PASS_FILE),--vault-password-file "$(VAULT_PASS_FILE)",--ask-vault-pass)

.PHONY: help setup install render-env vault-init vault-encrypt vault-edit start dev check build dist-mac dist-win

help:
	@echo "Targets:"
	@echo "  make setup         - Run Ansible setup playbook (deps, Electron, WSL fonts)"
	@echo "  make install       - Install dependencies and Electron binary"
	@echo "  make vault-init    - Create secrets.yml from secrets.yml.example"
	@echo "  make vault-encrypt - Encrypt VAULT_FILE with ansible-vault"
	@echo "  make vault-edit    - Edit encrypted VAULT_FILE with ansible-vault"
	@echo "  make render-env    - Render $(ENV_OUT) from VAULT_FILE via Ansible"
	@echo "  make start         - Run development app (pnpm dev)"
	@echo "  make check         - Run boundary lint, typecheck, and tests"
	@echo "  make build         - Build main, preload, and renderer"
	@echo "  make dist-mac      - Build macOS .dmg package"
	@echo "  make dist-win      - Build Windows .exe package"

setup:
	cd $(ANSIBLE_DIR) && ANSIBLE_CONFIG=$(ANSIBLE_DIR)/ansible.cfg ansible-playbook playbooks/setup.yml

install:
	pnpm install
	node apps/desktop/node_modules/electron/install.js

vault-init:
	@test ! -f "$(VAULT_FILE)" || { echo "Already exists: $(VAULT_FILE)"; exit 1; }
	cp ansible/group_vars/all/secrets.yml.example "$(VAULT_FILE)"
	@echo "Created $(VAULT_FILE). Fill in values and run 'make vault-encrypt'."

vault-encrypt:
	ansible-vault encrypt "$(VAULT_FILE)"

vault-edit:
	ansible-vault edit "$(VAULT_FILE)"

render-env:
	cd $(ANSIBLE_DIR) && ANSIBLE_CONFIG=$(ANSIBLE_DIR)/ansible.cfg VAULT_FILE="$(VAULT_FILE)" \
		ansible-playbook playbooks/render-env.yml $(VAULT_FLAGS)

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
