PORT ?= 4173
PYTHON ?= python3

.PHONY: help check test verify smoke serve

help:
	@echo "Targets:"
	@echo "  make check   - Run syntax checks on the main JS files"
	@echo "  make test    - Run the node:test suite"
	@echo "  make verify  - Run check + test"
	@echo "  make smoke   - Run the browser smoke suite headlessly (needs a Chromium-based browser)"
	@echo "  make serve   - Start a local static server for manual browser smoke testing"

check:
	node --check app.js
	node --check config.js
	node --check vergence-core.js
	node --check tests/vergence-core.test.js
	node --check tests/browser-smoke.js
	@if command -v shellcheck >/dev/null 2>&1; then \
		shellcheck tests/smoke-headless.sh; \
	else \
		echo "shellcheck not found; skipping shell lint of tests/smoke-headless.sh"; \
	fi

test:
	node --test

verify: check test

smoke:
	PORT=$(PORT) PYTHON=$(PYTHON) tests/smoke-headless.sh

serve:
	@echo "App:   http://localhost:$(PORT)/"
	@echo "Smoke: http://localhost:$(PORT)/tests/browser-smoke.html"
	$(PYTHON) -m http.server $(PORT)
