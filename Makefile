#!make
include .env
export $(shell sed 's/=.*//' .env)

NETWORK                  := goerli
SCRIPT_PATH              := ./deploy/tasks/deployments/testnet/full_deployment.ts
TEST_TARGET              := *.spec.ts
RUST_TOOLCHAIN           := nightly-2022-07-24

.PHONY: init
init: submodules
	command -v rustup > /dev/null 2>&1 || bash -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_TOOLCHAIN}"
	command -v typos > /dev/null 2>&1 || bash -c "cargo install typos-cli"
	yarn

.PHONY: test
test:
	TS_NODE_TRANSPILE_ONLY=1 npx hardhat test ./test-suites/__setup__.ts ./test-suites/${TEST_TARGET}

.PHONY: size
size:
	yarn size

.PHONY: build
build:
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
	yarn cache clean --all
	YARN_CHECKSUM_BEHAVIOR=update yarn
	yarn clean

.PHONY: ci
ci: lint test

.PHONY: submodules
submodules:
	git submodule update --init --recursive
	git submodule foreach git pull origin main

.PHONY: test-ntoken
test-ntoken:
	make TEST_TARGET=ntoken.spec.ts test

.PHONY: test-ntoken-punk
test-ntoken-punk:
	make TEST_TARGET=ntoken-punk.spec.ts test

.PHONY: test-liquidation
test-liquidation:
	make TEST_TARGET=liquidation.spec.ts test

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
	make TEST_TARGET=weth-gateway.spec.ts test

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

.PHONY: test-dynamic-configs-strategy
test-dynamic-configs-strategy:
	make TEST_TARGET=dynamic-configs-strategy.spec.ts test

.PHONY: run
run:
	TS_NODE_TRANSPILE_ONLY=1 npx hardhat run $(SCRIPT_PATH) --network $(NETWORK)

.PHONY: print
print:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/run_printContracts.ts run

.PHONY: verify
verify:
	yarn clean
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/run_verifyContracts.ts run

.PHONY: deploy
deploy: run

.PHONY: dev-deploy
dev-deploy:
	make NETWORK=hardhat run

.PHONY: deploy-mockERC20Tokens
deploy-mockERC20Tokens:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/0A_mockERC20Tokens.ts run

.PHONY: deploy-mockERC721Tokens
deploy-mockERC721Tokens:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/0B_mockERC721Tokens.ts run

.PHONY: deploy-faucet
deploy-faucet:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/01_faucet.ts run

.PHONY: deploy-addressProvider
deploy-addressProvider:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/02_addressProvider.ts run

.PHONY: deploy-aclManager
deploy-aclManager:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/03_aclManager.ts run

.PHONY: deploy-poolAddressesProviderRegistry
deploy-poolAddressesProviderRegistry:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/04_poolAddressesProviderRegistry.ts run

.PHONY: deploy-pool
deploy-pool:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/05_pool.ts run

.PHONY: deploy-poolConfigurator
deploy-poolConfigurator:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/06_poolConfigurator.ts run

.PHONY: deploy-reservesSetupHelper
deploy-reservesSetupHelper:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/07_reservesSetupHelper.ts run

.PHONY: deploy-priceOracle
deploy-priceOracle:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/08_priceOracle.ts run

.PHONY: deploy-allMockAggregators
deploy-allMockAggregators:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/09_allMockAggregators.ts run

.PHONY: deploy-uiIncentiveDataProvider
deploy-uiIncentiveDataProvider:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/10_uiIncentiveDataProvider.ts run

.PHONY: deploy-wethGateway
deploy-wethGateway:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/11_wethGateway.ts run

.PHONY: deploy-punkGateway
deploy-punkGateway:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/12_punkGateway.ts run

.PHONY: deploy-moonbirdsGateway
deploy-moonbirdsGateway:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/13_moonbirdsGateway.ts run

.PHONY: deploy-uniswapV3Gateway
deploy-uniswapV3Gateway:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/14_uniswapV3Gateway.ts run

.PHONY: deploy-seaport
deploy-seaport:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/15_seaport.ts run

.PHONY: deploy-looksrare
deploy-looksrare:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/16_looksrare.ts run

.PHONY: deploy-x2y2
deploy-x2y2:
	make SCRIPT_PATH=./deploy/tasks/deployments/testnet/steps/run-steps/17_x2y2.ts run

.PHONY: ad-hoc
ad-hoc:
	make SCRIPT_PATH=./deploy/tasks/deployments/dev/1.ad-hoc.ts run

.PHONY: fork
fork:
	npx ganache \
	-d \
	--chain.chainId 522 \
	--fork ${RPC_URL}

help:
	@grep -E '^[a-zA-Z_-]+:.*?' Makefile | cut -d: -f1 | sort
