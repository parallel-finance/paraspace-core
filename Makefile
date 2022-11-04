#!make
include .env
export $(shell sed 's/=.*//' .env)

NETWORK                  := goerli
SCRIPT_PATH              := ./deploy/tasks/deployments/dev/1.ad-hoc.ts
TASK_NAME                := print-contracts
TEST_TARGET              := *.spec.ts
RUST_TOOLCHAIN           := nightly-2022-09-19

.PHONY: init
init: submodules
	command -v rustup > /dev/null 2>&1 || bash -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_TOOLCHAIN}"
	command -v typos > /dev/null 2>&1 || bash -c "cargo install typos-cli"
	yarn

.PHONY: test
test:
	npx hardhat test ./test-suites/${TEST_TARGET} --network hardhat # --verbose

.PHONY: slow-test
slow-test:
	MOCHA_JOBS=0 DB_PATH=deployed-contracts.json npx hardhat test ./test-suites/${TEST_TARGET} --network hardhat # --verbose

.PHONY: fast-test
fast-test:
	MOCHA_JOBS=4 DB_PATH=:memory: npx hardhat test ./test-suites/${TEST_TARGET} --network hardhat # --verbose

.PHONY: size
size:
	yarn size

.PHONY: build
build: clean
	yarn build

.PHONY: doc
doc:
	yarn doc

.PHONY: lint
lint:
	typos
	yarn lint

.PHONY: coverage
coverage:
	yarn coverage

.PHONY: format
format:
	yarn format

.PHONY: clean
clean:
	# yarn cache clean --all
	# YARN_CHECKSUM_BEHAVIOR=update yarn
	yarn clean

.PHONY: ci
ci: clean build lint doc fast-test

.PHONY: submodules
submodules:
	git submodule update --init --recursive
	git submodule foreach git pull origin main

.PHONY: test-pool-upgrade
test-pool-upgrade:
	make TEST_TARGET=pool-upgrade.spec.ts test

.PHONY: test-ntoken
test-ntoken:
	make TEST_TARGET=ntoken.spec.ts test

.PHONY: test-punk-gateway
test-punk-gateway:
	make TEST_TARGET=_gateway_punk.spec.ts test

.PHONY: test-liquidation
test-liquidation:
	make TEST_TARGET=liquidation.spec.ts test

.PHONY: test-liquidation-nft-with-weth
test-liquidation-nft-with-weth:
	make TEST_TARGET=liquidation-nft-with-weth.spec.ts test

.PHONY: test-liquidation-non-borrowed
test-liquidation-non-borrowed:
	make TEST_TARGET=liquidation-non-borrowed.spec.ts test

.PHONY: test-liquidation-auction
test-liquidation-auction:
	make TEST_TARGET=liquidation-auction.spec.ts test

.PHONY: test-liquidation-edge
test-liquidation-edge:
	make TEST_TARGET=liquidation-edge.spec.ts test

.PHONY: test-liquidation-ptoken
test-liquidation-ptoken:
	make TEST_TARGET=liquidation-ptoken.spec.ts test

.PHONY: test-configurator-edge
test-configurator-edge:
	make TEST_TARGET=configurator-edge.spec.ts test

.PHONY: test-debt-token-delegation-permit
test-debt-token-delegation-permit:
	make TEST_TARGET=debt-token-delegation-permit.spec.ts test

.PHONY: test-ptoken-permit
test-ptoken-permit:
	make TEST_TARGET=ptoken-permit.spec.ts test

.PHONY: test-ptoken-delegation-aware
test-ptoken-delegation-aware:
	make TEST_TARGET=ptoken-delegation-aware.spec.ts test

.PHONY: test-interest-overflow
test-interest-overflow:
	make TEST_TARGET=interest-overflow.spec.ts test

.PHONY: test-ltv-validation
test-ltv-validation:
	make TEST_TARGET=ltv-validation.spec.ts test

.PHONY: test-pausable-reserve
test-pausable-reserve:
	make TEST_TARGET=pausable-reserve.spec.ts test

.PHONY: test-upgradeability
test-upgradeability:
	make TEST_TARGET=upgradeability.spec.ts test

.PHONY: test-erc20
test-erc20:
	make TEST_TARGET=erc20.spec.ts test

.PHONY: test-flash-claim
test-flash-claim:
	make TEST_TARGET=flash-claim.spec.ts test

.PHONY: test-price-oracle-update
test-price-oracle-update:
	make TEST_TARGET=price-oracle-update.spec.ts test

.PHONY: test-nft-floor-price-oracle
test-nft-floor-price-oracle:
	make TEST_TARGET=nft-floor-price-oracle.spec.ts test

.PHONY: test-weth-gateway
test-weth-gateway:
	make TEST_TARGET=_gateway_weth.spec.ts test

.PHONY: test-mock-token-faucet
test-mock-token-faucet:
	make TEST_TARGET=mock-token-faucet.spec.ts test

.PHONY: test-moonbird
test-moonbird:
	make TEST_TARGET=moonbird.spec.ts test

.PHONY: test-marketplace
test-marketplace:
	make TEST_TARGET=marketplace.spec.ts test

.PHONY: test-uniswap-v3
test-uniswap-v3:
	make TEST_TARGET=uniswap-v3.spec.ts test

.PHONY: test-uniswap-v3-oracle
test-uniswap-v3-oracle:
	make TEST_TARGET=uniswap-v3-oracle.spec.ts test

.PHONY: test-auction-strategy
test-auction-strategy:
	make TEST_TARGET=auction-strategy.spec.ts test

.PHONY: test-auction-configuration
test-auction-configuration:
	make TEST_TARGET=auction-configuration.spec.ts test

.PHONY: test-ptoken-transfer
test-ptoken-transfer:
	make TEST_TARGET=ptoken-transfer.spec.ts test

.PHONY: test-ptoken-repay
test-ptoken-repay:
	make TEST_TARGET=ptoken-repay.spec.ts test

.PHONY: test-variable-debt-token
test-variable-debt-token:
	make TEST_TARGET=variable-debt-token.spec.ts test

.PHONY: test-paraspace-oracle
test-paraspace-oracle:
	make TEST_TARGET=paraspace-oracle.spec.ts test

.PHONY: test-no-incentives-controller
test-no-incentives-controller:
	make TEST_TARGET=no-incentives-controller.spec.ts test

.PHONY: test-atomic-tokens-limit
test-atomic-tokens-limit:
	make TEST_TARGET=atomic-tokens-limit.spec.ts test

.PHONY: test-rebasing-tokens
test-rebasing-tokens:
	make TEST_TARGET=rebasing.spec.ts test

.PHONY: test-pool-addresses-provider
test-pool-addresses-provider:
	make TEST_TARGET=pool-addresses-provider.spec.ts test

.PHONY: test-pausable-pool
test-pausable-pool:
	make TEST_TARGET=pausable-pool.spec.ts test

.PHONY: test-pool-drop-reserve
test-pool-drop-reserve:
	make TEST_TARGET=pool-drop-reserve.spec.ts test

.PHONY: test-price-oracle-sentinel
test-price-oracle-sentinel:
	make TEST_TARGET=price-oracle-sentinel.spec.ts test

.PHONY: test-user-configurator-used-as-collateral
test-user-configurator-used-as-collateral:
	make TEST_TARGET=user-configurator-used-as-collateral.spec.ts test

.PHONY: test-rate-strategy
test-rate-strategy:
	make TEST_TARGET=rate-strategy.spec.ts test

.PHONY: test-reserve-configuration
test-reserve-configuration:
	make TEST_TARGET=reserve-configuration.spec.ts test

.PHONY: test-dynamic-configs-strategy
test-dynamic-configs-strategy:
	make TEST_TARGET=dynamic-configs-strategy.spec.ts test

.PHONY: test-scenario
test-scenario:
	make TEST_TARGET=scenario.spec.ts test

.PHONY: test-ui-providers
test-ui-providers:
	make TEST_TARGET=_ui_providers.spec.ts test

.PHONY: run
run:
	npx hardhat run $(SCRIPT_PATH) --network $(NETWORK)

.PHONY: run-task
run-task:
	DB_PATH=deployed-contracts.json npx hardhat $(TASK_NAME) --network $(NETWORK)

.PHONY: print
print:
	make TASK_NAME=print-contracts run-task

.PHONY: verify
verify:
	make TASK_NAME=verify-contracts run-task

.PHONY: deploy
deploy:
	make TASK_NAME=deploy:all run-task

.PHONY: deploy-ERC20Tokens
deploy-ERC20Tokens:
	make TASK_NAME=deploy:erc20-tokens run-task

.PHONY: deploy-ERC721Tokens
deploy-ERC721Tokens:
	make TASK_NAME=deploy:erc721-tokens run-task

.PHONY: deploy-faucet
deploy-faucet:
	make TASK_NAME=deploy:faucet run-task

.PHONY: deploy-addressProvider
deploy-addressProvider:
	make TASK_NAME=deploy:address-provider run-task

.PHONY: deploy-aclManager
deploy-aclManager:
	make TASK_NAME=deploy:acl-manager run-task

.PHONY: deploy-pool
deploy-pool:
	make TASK_NAME=deploy:pool run-task

.PHONY: deploy-poolConfigurator
deploy-poolConfigurator:
	make TASK_NAME=deploy:pool-configurator run-task

.PHONY: deploy-reservesSetupHelper
deploy-reservesSetupHelper:
	make TASK_NAME=deploy:reserves-setup-helper run-task

.PHONY: deploy-fallbackOracle
deploy-fallbackOracle:
	make TASK_NAME=deploy:fallback-oracle run-task

.PHONY: deploy-allAggregators
deploy-allAggregators:
	make TASK_NAME=deploy:all-aggregators run-task

.PHONY: deploy-allReserves
deploy-allReserves:
	make TASK_NAME=deploy:all-allReserves run-task

.PHONY: deploy-uiIncentiveDataProvider
deploy-uiIncentiveDataProvider:
	make TASK_NAME=deploy:ui-incentive-data-provider run-task

.PHONY: deploy-wethGateway
deploy-wethGateway:
	make TASK_NAME=deploy:weth-gateway run-task

.PHONY: deploy-punkGateway
deploy-punkGateway:
	make TASK_NAME=deploy:punk-gateway run-task

.PHONY: deploy-seaport
deploy-seaport:
	make TASK_NAME=deploy:seaport run-task

.PHONY: deploy-looksrare
deploy-looksrare:
	make TASK_NAME=deploy:looksrare run-task

.PHONY: deploy-x2y2
deploy-x2y2:
	make TASK_NAME=deploy:x2y2 run-task

.PHONY: deploy-flashClaimRegistry
deploy-flashClaimRegistry:
	make TASK_NAME=deploy:flash-claim-registry run-task

.PHONY: ad-hoc
ad-hoc:
	make SCRIPT_PATH=./deploy/tasks/deployments/dev/1.ad-hoc.ts run

.PHONY: fork
fork:
	npx ganache \
	-d \
	--chain.chainId 522

.PHONY: upgrade
upgrade:
	make TASK_NAME=upgrade:all run-task

.PHONY: upgrade-pool
upgrade-pool:
	make TASK_NAME=upgrade:pool run-task

.PHONY: upgrade-ptoken
upgrade-ptoken:
	make TASK_NAME=upgrade:ptoken run-task

.PHONY: upgrade-ntoken
upgrade-ntoken:
	make TASK_NAME=upgrade:ntoken run-task

.PHONY: upgrade-ntoken-uniswapv3
upgrade-ntoken-uniswapv3:
	make TASK_NAME=upgrade:ntoken_uniswapv3 run-task

.PHONY: upgrade-ntoken-moonbirds
upgrade-ntoken-moonbirds:
	make TASK_NAME=upgrade:ntoken_moonbirds run-task

help:
	@grep -E '^[a-zA-Z_-]+:.*?' Makefile | cut -d: -f1 | sort
