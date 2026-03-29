.DEFAULT_GOAL := help
ZSH_LOGIN     := zsh -lc

help:  ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

# ── Dev ──────────────────────────────────────────────────────────────────────

install:  ## Install dependencies
	@bun install

test:  ## Run tests
	@bun test

# ── Build & Publish ───────────────────────────────────────────────────────────

build:  ## Bundle with bun
	@bun run build

publish: build  ## Publish to npm (requires NPM_TOKEN via bw-env)
	@$(ZSH_LOGIN) 'if ! env | grep -q "^NPM_TOKEN="; then \
		echo "NPM_TOKEN missing — run bw-env first"; exit 1; fi; \
	bun publish'

release: test build publish push  ## Full release: test → build → publish → push

# ── Git ───────────────────────────────────────────────────────────────────────

push:  ## Push current branch to all remotes (github + gitlab)
	@branch="$$(git branch --show-current)"; \
	for remote in $$(git remote); do \
		echo "==> pushing $$branch to $$remote"; \
		git push "$$remote" "$$branch"; \
	done

push-tags:  ## Push all tags to all remotes
	@for remote in $$(git remote); do git push "$$remote" --tags; done

status:  ## git status --short
	@git status --short

log:  ## Last 10 commits oneline
	@git log --oneline -10
