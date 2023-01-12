#!make

NETWORK                  := hardhat

include .env
export $(shell sed 's/=.*//' .env)  #overwrite NETWORK

SCRIPT_PATH              := ./scripts/dev/1.ad-hoc.ts
TASK_NAME                := print-contracts
TEST_TARGET              := *.spec.ts
RUST_TOOLCHAIN           := nightly-2022-09-19

.PHONY: init
init: submodules
	command -v rustup > /dev/null 2>&1 || bash -c "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_TOOLCHAIN}"
	command -v typos > /dev/null 2>&1 || bash -c "cargo install typos-cli"
	command -v forge > /dev/null 2>&1 || bash -c "curl -L https://foundry.paradigm.xyz | bash"
	[ -d lib/ds-test ] || forge install --no-commit --no-git https://github.com/dapphub/ds-test
	[ -d lib/forge-std ] || forge install --no-commit --no-git https://github.com/foundry-rs/forge-std
	yarn

.PHONY: foundry-setup
foundry-setup: anvil
	MOCHA_JOBS=0 DB_PATH=deployed-contracts.json npx hardhat deploy:all --network anvil # --verbose

.PHONY: foundry-test
foundry-test:
	forge test -vvvv

.PHONY: test
test:
	npx hardhat test ./test/${TEST_TARGET} --network ${NETWORK} # --verbose

.PHONY: local-test
local-test:
	make MOCHA_JOBS=0 DB_PATH=deployed-contracts.json DEPLOY_START=21 NETWORK=localhost test

.PHONY: slow-test
slow-test:
	MOCHA_JOBS=0 DB_PATH=deployed-contracts.json npx hardhat test ./test/${TEST_TARGET} --network ${NETWORK} # --verbose

.PHONY: fast-test
fast-test:
	MOCHA_JOBS=4 DB_PATH=:memory: npx hardhat test ./test/${TEST_TARGET} --network ${NETWORK} # --verbose

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
	[ -d lib/ds-test ] && cd lib/ds-test && git pull origin master

.PHONY: test-pool-upgrade
test-pool-upgrade:
	make TEST_TARGET=pool-upgrade.spec.ts test

.PHONY: test-pool-initialization
test-pool-initialization:
	make TEST_TARGET=_pool_initialization.spec.ts test

.PHONY: test-ntoken
test-ntoken:
	make TEST_TARGET=_xtoken_ntoken.spec.ts test

.PHONY: test-ntoken-punk
test-ntoken-punk:
	make TEST_TARGET=ntoken-punk.spec.ts test

.PHONY: test-ptoken
test-ptoken:
	make TEST_TARGET=_xtoken_ptoken.spec.ts test

.PHONY: test-punk-gateway
test-punk-gateway:
	make TEST_TARGET=_gateway_punk.spec.ts test

.PHONY: test-erc20-liquidation
test-erc20-liquidation:
	make TEST_TARGET=_pool_core_erc20_liquidation.spec.ts test

.PHONY: test-erc20-borrow
test-erc20-borrow:
	make TEST_TARGET=_pool_core_erc20_borrow.spec.ts test

.PHONY: test-erc20-supply
test-erc20-supply:
	make TEST_TARGET=_pool_core_erc20_supply.spec.ts test

.PHONY: test-erc20-withdraw
test-erc20-withdraw:
	make TEST_TARGET=_pool_core_erc20_withdraw.spec.ts test

.PHONY: test-erc20-repay
test-erc20-repay:
	make TEST_TARGET=_pool_core_erc20_repay.spec.ts test

.PHONY: test-erc721-liquidation
test-erc721-liquidation:
	make TEST_TARGET=_pool_core_erc721_liquidation.spec.ts test

.PHONY: test-erc721-auction-liquidation
test-erc721-auction-liquidation:
	make TEST_TARGET=_pool_core_erc721_auction_liquidation.spec.ts test

.PHONY: test-configurator
test-configurator:
	make TEST_TARGET=_pool_configurator.spec.ts test

.PHONY: test-rescue-tokens
test-rescue-tokens:
	make TEST_TARGET=_pool_parameters_rescue_tokens.spec.ts test

.PHONY: test-upgradeability
test-upgradeability:
	make TEST_TARGET=_base_upgradeability.spec.ts test

.PHONY: test-flash-claim
test-flash-claim:
	make TEST_TARGET=_pool_core_flash_claim.spec.ts test

.PHONY: test-paraspace-oracle-aggregator
test-paraspace-oracle-aggregator:
	make TEST_TARGET=_oracle_aggregator.spec.ts test

.PHONY: test-nft-floor-price-oracle-without-deploy
test-nft-floor-price-oracle-without-deploy:
	make TEST_TARGET=_oracle_nft_floor_price.spec.ts local-test

.PHONY: test-nft-floor-price-oracle
test-nft-floor-price-oracle:
	make TEST_TARGET=_oracle_nft_floor_price.spec.ts test

.PHONY: test-weth-gateway
test-weth-gateway:
	make TEST_TARGET=_gateway_weth.spec.ts test

.PHONY: test-mock-token-faucet
test-mock-token-faucet:
	make TEST_TARGET=_mock_token_faucet.spec.ts test

.PHONY: test-moonbirds
test-moonbirds:
	make TEST_TARGET=_xtoken_ntoken_moonbirds.spec.ts test

.PHONY: test-marketplace-buy
test-marketplace-buy:
	make TEST_TARGET=_pool_marketplace_buy_with_credit.spec.ts test

.PHONY: test-marketplace-accept-bid
test-marketplace-accept-bid:
	make TEST_TARGET=_pool_marketplace_accept_bid_with_credit.spec.ts test

.PHONY: test-marketplace-adapter
test-marketplace-adapter:
	make TEST_TARGET=_pool_marketplace_adapter.spec.ts test

.PHONY: test-uniswap-v3-oracle
test-uniswap-v3-oracle:
	make TEST_TARGET=_uniswap-v3-oracle.spec.ts test

.PHONY: test-uniswap-v3-ltv-validation
test-uniswap-v3-ltv-validation:
	make TEST_TARGET=_uniswap_ltv_validation.spec.ts test

.PHONY: test-uniswap-v3-pool-operation
test-uniswap-v3-pool-operation:
	make TEST_TARGET=_uniswapv3_pool_operation.spec.ts test

.PHONY: test-uniswap-v3-position-control
test-uniswap-v3-position-control:
	make TEST_TARGET=_uniswapv3_position_control.spec.ts test

.PHONY: test-auction-strategy
test-auction-strategy:
	make TEST_TARGET=_base_auction_strategy.spec.ts test

.PHONY: test-variable-debt-token
test-variable-debt-token:
	make TEST_TARGET=_xtoken_variable_debt_token.spec.ts test

.PHONY: test-atomic-tokens-limit
test-atomic-tokens-limit:
	make TEST_TARGET=_xtoken_ntoken_atomic-token-balance_limit.spec.ts test

.PHONY: test-mint-to-treasury
test-mint-to-treasury:
	make TEST_TARGET=_pool_parameters_mint_to_treasury.spec.ts test

.PHONY: test-rebasing-tokens
test-rebasing-tokens:
	make TEST_TARGET=_xtoken_rebasing.spec.ts test

.PHONY: test-steth
test-steth:
	make TEST_TARGET=_xtoken_steth.spec.ts test

.PHONY: test-addresses-provider
test-addresses-provider:
	make TEST_TARGET=_base_addresses_provider.spec.ts test

.PHONY: test-addresses-provider-registry
test-addresses-provider-registry:
	make TEST_TARGET=_base_addresses_provider_registry.spec.ts test

.PHONY: test-oracle-sentinel
test-oracle-sentinel:
	make TEST_TARGET=_oracle_sentinel.spec.ts test

.PHONY: test-user-configurator-used-as-collateral
test-user-configurator-used-as-collateral:
	make TEST_TARGET=_pool_core_use_as_collateral.spec.ts test

.PHONY: test-rate-strategy
test-rate-strategy:
	make TEST_TARGET=_base_interest_rate_strategy.spec.ts test

.PHONY: test-reserve-configuration
test-reserve-configuration:
	make TEST_TARGET=_base_reserve_configuration.spec.ts test

.PHONY: test-scenario
test-scenario:
	make TEST_TARGET=scenario.spec.ts test

.PHONY: test-data-providers
test-data-providers:
	make TEST_TARGET=_data_providers.spec.ts test

.PHONY: test-ape-staking
test-ape-staking:
	make TEST_TARGET=_pool_ape_staking.spec.ts test

.PHONY: test-auto-compound-ape
test-auto-compound-ape:
	make TEST_TARGET=auto_compound_ape.spec.ts test

.PHONY: test-sape-operation
test-sape-operation:
	make TEST_TARGET=_sape_pool_operation.spec.ts test

.PHONY: test-acl-manager
test-acl-manager:
	make TEST_TARGET=acl-manager.spec.ts test

.PHONY: test-time-lock
test-time-lock:
	make TEST_TARGET=time_lock_executor.spec.ts test

.PHONY: run
run:
	npx hardhat run $(SCRIPT_PATH) --network $(NETWORK)

.PHONY: run-task
run-task:
	DB_PATH=deployed-contracts.json npx hardhat $(TASK_NAME) $(ARG0) ${ARG1} ${ARG2} ${ARG3} --network $(NETWORK)

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

.PHONY: deploy-oracle
deploy-oracle:
	make TASK_NAME=deploy:oracle run-task

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

.PHONY: deploy-blur-exchange
deploy-blur-exchange:
	make TASK_NAME=deploy:blur-exchange run-task

.PHONY: deploy-flashClaimRegistry
deploy-flashClaimRegistry:
	make TASK_NAME=deploy:flash-claim-registry run-task

.PHONY: deploy-renounceOwnership
deploy-renounceOwnership:
	make TASK_NAME=deploy:renounce-ownership run-task

.PHONY: ad-hoc
ad-hoc:
	make SCRIPT_PATH=./scripts/dev/1.ad-hoc.ts run

.PHONY: info
info:
	make SCRIPT_PATH=./scripts/dev/3.info.ts run

.PHONY: wallet
wallet:
	make SCRIPT_PATH=./scripts/dev/4.wallet.ts run

.PHONY: rate-strategy
rate-strategy:
	make SCRIPT_PATH=./scripts/dev/5.rate-strategy.ts run

.PHONY: auction-strategy
auction-strategy:
	make SCRIPT_PATH=./scripts/dev/6.auction-strategy.ts run

.PHONY: transfer-tokens
transfer-tokens:
	make SCRIPT_PATH=./scripts/dev/2.transfer-tokens.ts run

.PHONY: market-info
market-info:
	make TASK_NAME=market-info run-task

.PHONY: account-data
account-data:
	make TASK_NAME=account-data run-task

.PHONY: next-execution-time
next-execution-time:
	make TASK_NAME=next-execution-time run-task

.PHONY: queue-tx
queue-tx:
	make TASK_NAME=queue-tx run-task

.PHONY: execute-tx
execute-tx:
	make TASK_NAME=execute-tx run-task

.PHONY: cancel-tx
cancel-tx:
	make TASK_NAME=cancel-tx run-task

.PHONY: list-queued-txs
list-queued-txs:
	make TASK_NAME=list-queued-txs run-task

.PHONY: set-ltv
set-ltv:
	make TASK_NAME=set-ltv run-task

.PHONY: set-liquidation-threshold
set-liquidation-threshold:
	make TASK_NAME=set-liquidation-threshold run-task

.PHONY: set-reserve-factor
set-reserve-factor:
	make TASK_NAME=set-reserve-factor run-task

.PHONY: set-interest-rate-strategy
set-interest-rate-strategy:
	make TASK_NAME=set-interest-rate-strategy run-task

.PHONY: set-auction-strategy
set-auction-strategy:
	make TASK_NAME=set-auction-strategy run-task

.PHONY: set-supply-cap
set-supply-cap:
	make TASK_NAME=set-supply-cap run-task

.PHONY: set-borrow-cap
set-borrow-cap:
	make TASK_NAME=set-borrow-cap run-task

.PHONY: list-facets
list-facets:
	make TASK_NAME=list-facets run-task

.PHONY: list-facet-addresses
list-facet-addresses:
	make TASK_NAME=list-facet-addresses run-task

.PHONY: facet-address
facet-address:
	make TASK_NAME=facet-address run-task

.PHONY: facet-function-selectors
facet-function-selectors:
	make TASK_NAME=facet-function-selectors run-task

.PHONY: upgrade
upgrade:
	make TASK_NAME=upgrade:all run-task

.PHONY: upgrade-pool
upgrade-pool:
	make TASK_NAME=upgrade:pool run-task

.PHONY: upgrade-configurator
upgrade-configurator:
	make TASK_NAME=upgrade:configurator run-task

.PHONY: upgrade-auto-compound-ape
upgrade-auto-compound-ape:
	make TASK_NAME=upgrade:auto-compound-ape run-task

.PHONY: upgrade-ntoken
upgrade-ntoken:
	make TASK_NAME=upgrade:ntoken run-task

.PHONY: upgrade-ptoken
upgrade-ptoken:
	make TASK_NAME=upgrade:ptoken run-task

.PHONY: upgrade-debt-token
upgrade-debt-token:
	make TASK_NAME=upgrade:debt-token run-task

.PHONY: hardhat
hardhat:
	npx hardhat node --hostname 0.0.0.0

.PHONY: anvil
anvil:
	sudo pkill anvil || true
	anvil &
	sleep 30

.PHONY: image
image:
	DOCKER_BUILDKIT=1 docker build \
		-c 512 \
		-t parallelfinance/paraspace:latest \
		-f Dockerfile .

.PHONY: launch
launch: shutdown
	docker-compose \
		up \
		-d --build
	docker-compose logs -f hardhat

.PHONY: shutdown
shutdown:
	sudo pkill anvil || true
	docker-compose \
		down \
		--remove-orphans > /dev/null 2>&1 || true
	docker volume prune -f
	sudo rm -fr redis-data || true
	sudo rm -fr logs || true

.PHONY: copy
copy:
	docker cp paraspace-core_hardhat_1:/paraspace/deployed-contracts.json .

help:
	@grep -E '^[a-zA-Z_-]+:.*?' Makefile | cut -d: -f1 | sort
