.PHONY: ci
ci: lint test

.PHONY: size
size:
	yarn size

.PHONY: build
build:
	yarn build

.PHONY: coverage
coverage:
	yarn coverage

.PHONY: format
format:
	yarn format

.PHONY: lint
lint:
	yarn lint

.PHONY: clean
clean:
	yarn cache clean --all
	YARN_CHECKSUM_BEHAVIOR=update yarn
	yarn clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?' Makefile | cut -d: -f1 | sort
