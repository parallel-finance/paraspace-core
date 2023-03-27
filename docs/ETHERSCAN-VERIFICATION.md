# Etherscan Verification

## Setup Environment

```
export ETHERSCAN_KEY="<etherscan_key>"
export NETWORK=mainnet
export ALCHEMY_KEY="<alchemy_key>"
export ETH_RPC_URL="https://eth-$NETWORK.alchemyapi.io/v2/$ALCHEMY_KEY"
export ETHERSCAN_API_KEY="$ETHERSCAN_KEY"
```

## Libraries

```
forge verify-contract 0xB52b7C8Ad64d6aF115d730c5E016c0Ea0fDf5125 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0x8f4c4ECD4edE01453eac3ed2172C1C273A867812 \
  --compiler-version v0.8.10+commit.fc410830
```

### BorrowLogic

```
forge verify-contract 0xF5474ceD4C3c9a256469947D18e3455aEc2E2344 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### LiquidationLogic

```
forge verify-contract 0xB52b7C8Ad64d6aF115d730c5E016c0Ea0fDf5125 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0x8f4c4ECD4edE01453eac3ed2172C1C273A867812 \
  --compiler-version v0.8.10+commit.fc410830
```

### FlashClaimlogic

```
forge verify-contract 0x6280760c550b5424F4F25d627D4E52982d0C7905 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### ConfiguratorLogic

```
forge verify-contract 0x7347FcFa8D44e495AFE71271e78247156E090C9f \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### AuctionLogic

```
forge verify-contract 0x462FCbD3A16A9a09fE686CDf40d0c0b3E493a3aB \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolLogic

```
forge verify-contract 0xDA4b9E3D30A59eCF5AD669ADC591Ddd176fD80e8 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### MarketplaceLogic

```
forge verify-contract 0xB4bD5f0ac344fae07633eD09D3Db5117e2aaBdBf \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0x044a6b55DEf3BF4292697C02C3A6109520279794 \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0xe89b43deeE592bdd5940c82F8abc7ecF5fB72c96 \
  --compiler-version v0.8.10+commit.fc410830
```

### ApeStakingLogic

```
forge verify-contract 0x0147154e1Be2E17b6d32D9589A2D8EA78a5cf35a \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### MintableERC721Logic

```
forge verify-contract 0xE47109F8dFBEb8af35b47374f6A91190D68F0680 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic \
  --compiler-version v0.8.10+commit.fc410830
```

### PToken

```
forge verify-contract 0x0139538b3513782E179ac96c690Bc1e378B42F8F \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/PToken.sol:PToken \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --compiler-version v0.8.10+commit.fc410830
```

### PTokenAToken

```
forge verify-contract 0x2f34DD450924Aa9bE59422B40933eCaaD644D7Df \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/PTokenAToken.sol:PTokenAToken \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --compiler-version v0.8.10+commit.fc410830
```

### PTokenSApe

```
forge verify-contract 0x540d448a1F6E79CF91902e47E1aE030F4F371265 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/PTokenSApe.sol:PTokenSApe \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0xdb5485C85Bd95f38f9def0cA85499eF67dC581c0" "0xFA51cdc70c512c13eF1e4A3dbf1e99082b242896") \
  --compiler-version v0.8.10+commit.fc410830
```

### PTokenCApe

```
forge verify-contract 0x8c17beb69971E127e78C2e60F0408232F7d6340F \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/PTokenCApe.sol:PTokenCApe \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --compiler-version v0.8.10+commit.fc410830
```

## NToken

### NTokenBAYC

```
forge verify-contract 0xc4e1e2a4Ab406E73d1809016c91D11D50cEe6FAa \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/NTokenBAYC.sol:NTokenBAYC \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9") \
  --libraries contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic:0x0147154e1Be2E17b6d32D9589A2D8EA78a5cf35a \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0xE47109F8dFBEb8af35b47374f6A91190D68F0680 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenMAYC

```
forge verify-contract 0xA43Ba33223e1449A6f901b3E3b75dC22fb29F0ed \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/NTokenMAYC.sol:NTokenMAYC \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9") \
  --libraries contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic:0x0147154e1Be2E17b6d32D9589A2D8EA78a5cf35a \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0xE47109F8dFBEb8af35b47374f6A91190D68F0680 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenBAKC

```
forge verify-contract 0x6192C2FCF4e8eB97c51d6771aB6C39691F3fAf34 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/NTokenBAKC.sol:NTokenBAKC \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9" "0xdb5485C85Bd95f38f9def0cA85499eF67dC581c0" "0xFA51cdc70c512c13eF1e4A3dbf1e99082b242896") \
  --libraries contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic:0x0147154e1Be2E17b6d32D9589A2D8EA78a5cf35a \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0xE47109F8dFBEb8af35b47374f6A91190D68F0680 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenOtherdeed

```
forge verify-contract 0x0ab07E037Aeae1af2fF991Af239855087939f05d \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/NTokenOtherdeed.sol:NTokenOtherdeed \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0xC3AA9bc72Bd623168860a1e5c6a4530d3D80456c") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x8F3527276f7dB90F1F68d166Df366fA46fD70054 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenMoonbirds

```
forge verify-contract 0x5962CA824E31992453BF1CD8569c6dEf6F89D0Db \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/NTokenMoonBirds.sol:NTokenMoonBirds \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0xE47109F8dFBEb8af35b47374f6A91190D68F0680 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenUniswapV3

```
forge verify-contract 0xE30968b619b2C34462ac63268f1CA35ad72Ce3F0 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/NTokenUniswapV3.sol:NTokenUniswapV3 \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0xE47109F8dFBEb8af35b47374f6A91190D68F0680 \
  --compiler-version v0.8.10+commit.fc410830
```

### NToken

```
forge verify-contract 0x64c79b88911e674458011E1d5795d41FfB74F358 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/NToken.sol:NToken \
  --constructor-args \
  $(cast abi-encode "constructor(address,bool)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" false) \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0xE47109F8dFBEb8af35b47374f6A91190D68F0680 \
  --compiler-version v0.8.10+commit.fc410830
```

## DebtToken

### ATokenDebtToken

```
forge verify-contract 0xA00D612d9b2719e05eaB67602F8A72E88582c6Cf \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/ATokenDebtToken.sol:ATokenDebtToken \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --compiler-version v0.8.10+commit.fc410830
```

### VariableDebtToken

```
forge verify-contract 0x3A0Bde0893A60D139d26C2E5C29799f923173341 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/tokenization/VariableDebtToken.sol:VariableDebtToken \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --compiler-version v0.8.10+commit.fc410830
```

## PoolConfigurator

```
forge verify-contract 0x21489e1D79f03aFf8119b1E93C18BFEA84A3D24C \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/protocol/pool/PoolConfigurator.sol:PoolConfigurator \
  --libraries contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic:0x7347FcFa8D44e495AFE71271e78247156E090C9f \
  --compiler-version v0.8.10+commit.fc410830
```

## Pool

### PoolCore

```
forge verify-contract 0x8e1f8B5c9ae49a9B13084c4BD071efC03a7c3Da8 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "0x59B72FdB45B3182c8502cC297167FE4f821f332d") \
  contracts/protocol/pool/PoolCore.sol:PoolCore \
  --libraries contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic:0xF82De5E02EEa885b7941Bd261504185845AB99E0 \
  --libraries contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic:0xd4b1CCb7576e43e3856b72f063C4A9bD43194004 \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0x044a6b55DEf3BF4292697C02C3A6109520279794 \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0xe89b43deeE592bdd5940c82F8abc7ecF5fB72c96 \
  --libraries contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic:0x5AdE08EdcB5ea1f39e3D877f7065593E7D66cdaa \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolMarketplace

```
forge verify-contract 0xB0A9B618c23c196C2cD51Da3d7A8CF176c353a5d \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d") \
  contracts/protocol/pool/PoolMarketplace.sol:PoolMarketplace \
  --libraries contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic:0x1fE34BF51E802Adba9b1cBc0E216EFAeb1FE226B \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolApeStaking

```
forge verify-contract 0xcB820d544513636a70dF9A42fC6Cc535730AA606 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address,address,address,address,uint24,uint24)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "0xC5c9fB6223A989208Df27dCEE33fC59ff5c26fFF" "0x4d224452801ACEd8B2F0aebE155379bb5D594381" "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" "0xE592427A0AEce92De3Edee1F18E0157C05861564" "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" 3000 500) \
  contracts/protocol/pool/PoolApeStaking.sol:PoolApeStaking \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0x3FDDCD604b5797D75D129CB6514792de60Bb1EF7 \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0xF5474ceD4C3c9a256469947D18e3455aEc2E2344 \
  --compiler-version v0.8.10+commit.fc410830
```

### cAPE

```
forge verify-contract 0x1Ba6891D74b3B1f84b3EdFa6538D99eE979E8B63 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x4d224452801ACEd8B2F0aebE155379bb5D594381" "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9" "0x42b0C49130162F949e82ba855C4eFF0C3Fd4C5cC") \
  contracts/misc/AutoCompoundApe.sol:AutoCompoundApe \
  --compiler-version v0.8.10+commit.fc410830
```

## Oracle

### CLBaseCurrencySynchronicityPriceAdapter

```
forge verify-contract 0x549945De284a8cc102D49cE28683ee9E87edE3E3 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,uint256)" "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" 1000000000000000000) \
  contracts/misc/CLBaseCurrencySynchronicityPriceAdapter.sol:CLBaseCurrencySynchronicityPriceAdapter \
  --compiler-version v0.8.10+commit.fc410830
```

### CLExchangeRateSynchronicityPriceAdapter

```
forge verify-contract 0xFCbf6B66dED63D6a8231dB091c16a3481d2E8890 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0xae78736cd615f374d3085123a210448e74fc6393") \
  contracts/misc/CLExchangeRateSynchronicityPriceAdapter.sol:CLExchangeRateSynchronicityPriceAdapter \
  --compiler-version v0.8.10+commit.fc410830
```

### UniswapV3TwapOracleWrapper

```
forge verify-contract 0x32A880E831814CfD55dC556645Ef06816fE9bE02 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,int32)" "0x824a30f2984f9013f2c8d0a29c0a3cc5fd5c0673" "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" "1800") \
  contracts/misc/UniswapV3TwapOracleWrapper.sol:UniswapV3TwapOracleWrapper \
  --compiler-version v0.8.10+commit.fc410830
```

### UniswapV3OracleWrapper

```
TBD
```

## Proxy

### InitializableAdminUpgradeabilityProxy

```
forge verify-contract 0xBAa0DaA4224d2eb4619FfDC8A50Ef50c754b55F3 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/dependencies/openzeppelin/upgradeability/InitializableAdminUpgradeabilityProxy.sol:InitializableAdminUpgradeabilityProxy \
  --compiler-version v0.8.10+commit.fc410830
```

## Interest Rate Strategy

### DefaultReserveInterestRateStrategy

```
forge verify-contract 0xCC07D35c011d565F4089A86a2D08369439632125 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,uint256,uint256,uint256,uint256)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "850000000000000000000000000" "180000000000000000000000000" "80000000000000000000000000" "600000000000000000000000000") \
  contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol:DefaultReserveInterestRateStrategy \
  --compiler-version v0.8.10+commit.fc410830
```

### DefaultReserveAuctionStrategy

```
forge verify-contract 0x86FDEc54ec867bad1d0Ee47aa818948F6A1E5dB8 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(uint256,uint256,uint256,uint256,uint256,uint256)" "3000000000000000000" "1900000000000000000" "800000000000000000" "68750000000000000" "28547400155982200" "900") \
  contracts/protocol/pool/DefaultReserveAuctionStrategy.sol:DefaultReserveAuctionStrategy \
  --compiler-version v0.8.10+commit.fc410830
```

### DefaultReserveTimeLockStrategy

```
forge verify-contract 0x27046296E0fB79100FC9Efd6Be95C8422DBCE78C \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/misc/contracts/misc/DefaultTimeLockStrategy.sol:DefaultTimeLockStrategy \
  --constructor-args \
  $(cast abi-encode "constructor(address,uint256,uint256,uint48,uint48,uint48,uint256,uint48,uint256)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d") \
  --compiler-version v0.8.10+commit.fc410830
```

## TimeLock

```
forge verify-contract 0x27046296E0fB79100FC9Efd6Be95C8422DBCE78C \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/misc/TimeLock.sol:TimeLock \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d") \
  --compiler-version v0.8.10+commit.fc410830
```
