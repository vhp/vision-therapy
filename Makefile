PORT ?= 4173
PYTHON ?= python3

.PHONY: help check test verify serve

help:
	@echo "Targets:"
	@echo "  make check   - Run syntax checks on the main JS files"
	@echo "  make test    - Run the node:test suite"
	@echo "  make verify  - Run check + test"
	@echo "  make serve   - Start a local static server for manual browser smoke testing"

check:
	node --check app.js
	node --check config.js
	node --check vergence-core.js
	node --check tests/vergence-core.test.js
	node --check tests/browser-smoke.js

test:
	node --test

verify: check test

serve:
	@echo "App:   http://localhost:$(PORT)/"
	@echo "Smoke: http://localhost:$(PORT)/tests/browser-smoke.html"
	$(PYTHON) -m http.server $(PORT)
