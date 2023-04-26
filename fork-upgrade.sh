#!/bin/bash

set -e
set -x

## 0. release port 8545
lsof -t -i:8545 && kill $(lsof -t -i:8545);

## 1. env setup
echo '
NETWORK=localhost
ETHERSCAN_KEY=test
ETHERSCAN_VERIFICATION=false
ALCHEMY_KEY=v2H0jMbFK2BAlezbtzdYwdm9P_p38yOZ
DB_PATH=deployed-contracts.json
FORK=mainnet
FORK_BLOCK_NUMBER=17122998
#DEPLOYER_MNEMONIC=sick craft gate simple copy poverty coast concert age depart organ number
DRY_RUN=TimeLock
#IMPERSONATE_ADDRESS=0xe965198731cddb2f06e91dd0cdff74b71e4b3714
#RPC_URL=https://mainnet.infura.io/v3/87d194279ade4d20b8e7a0b881c47692
RECEIVER=0xbF0135be6a39257c659fd1955324dc3CDb342f29
' > .env

## 2. sync contracts artifact
curl -s -O https://paraspace-static-files.s3.amazonaws.com/contracts/mainnet/v1.4.8/deployed-contracts.json

## 3. hardhat
make hardhat &

sleep 5

## 4. upgrade hv-mtl
npx hardhat run ./scripts/dev/14.release-hv-mtl.ts
make RPC_URL=http://localhost:8545 queue-buffered-txs
make increase-to-execution-time
#make RPC_URL=http://localhost:8545 execute-buffered-txs

## 5. upgrade timelock
DRY_RUN= make upgrade-timelock

## 6. money
DRY_RUN="" npx hardhat run ./scripts/dev/2.transfer-tokens.ts
