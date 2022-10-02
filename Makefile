#!make
include .env
export $(shell sed 's/=.*//' .env)

NETWORK                  := goerli
SCRIPT_PATH              := ./tasks/deployments/testnet/full_deployment.ts
TEST_TARGET              := *.spec.ts
RUST_TOOLCHAIN           := nightly-2022-07-24

.PHONY: ci
ci: lint size

.PHONY: size
size:
	yarn size

.PHONY: build
build:
	yarn build

.PHONY: format
format:
	yarn format

.PHONY: lint
lint:
	yarn lint

.PHONY: doc
doc:
	yarn doc

.PHONY: clean
clean:
	yarn cache clean --all
	YARN_CHECKSUM_BEHAVIOR=update yarn
	yarn clean

.PHONY: submodules
submodules:
	git submodule update --init --recursive
	git submodule foreach git pull origin main

.PHONY: test
test:
	TS_NODE_TRANSPILE_ONLY=1 npx hardhat test ./test-suites/__setup__.ts ./test-suites/${TEST_TARGET}

help:
	@grep -E '^[a-zA-Z_-]+:.*?' Makefile | cut -d: -f1 | sort
