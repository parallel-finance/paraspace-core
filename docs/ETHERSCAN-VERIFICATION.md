# Etherscan Verification

## Setup Environment

```
export ETHERSCAN_KEY="<etherscan_key>"
export NETWORK=mainnet
export ALCHEMY_KEY="<alchemy_key>"
export ETH_RPC_URL="https://eth-$NETWORK.alchemyapi.io/v2/$ALCHEMY_KEY"
export ETHERSCAN_API_KEY="$ETHERSCAN_KEY"
```

## Install proxychains

## Libraries

### SupplyLogic

```
proxychains forge verify-contract 0xedb95460bFD94Ea2Db15e72009C68c974a84c03e \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### BorrowLogic

```
proxychains forge verify-contract 0x2463705ea7432D56387C2959C608c7b86e97cC85 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### LiquidationLogic

```
proxychains forge verify-contract 0xb0F62362abDd3902c684A393045B6F90AdDafff3 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xedb95460bFD94Ea2Db15e72009C68c974a84c03e \
  --compiler-version v0.8.10+commit.fc410830
```

### FlashClaimlogic

```
proxychains forge verify-contract 0x6280760c550b5424F4F25d627D4E52982d0C7905 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### ConfiguratorLogic

```
proxychains forge verify-contract 0x7347FcFa8D44e495AFE71271e78247156E090C9f \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### AuctionLogic

```
proxychains forge verify-contract 0xa9b3f3EbD6aa58D541855cf8997Fb6ad839658a2 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/protocol/libraries/logic/PositionMoverLogic.sol:PositionMoverLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0x7dc12cCe38Fd20393d19d5E4d65b021B35093aAB \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0xBd25Aa1c423cD59662aD1C328f963ce90Afbd94B \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolLogic

```
proxychains forge verify-contract 0x9AAc8FF4De73f54eE6A2c460716A9DD590C3C281 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### MarketplaceLogic

```
proxychains forge verify-contract 0xfb0B010c7828e3D785996897c0c137345d3E5E00 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xedb95460bFD94Ea2Db15e72009C68c974a84c03e \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0x2463705ea7432D56387C2959C608c7b86e97cC85 \
  --compiler-version v0.8.10+commit.fc410830
```

### ApeStakingLogic

```
proxychains forge verify-contract 0x0147154e1Be2E17b6d32D9589A2D8EA78a5cf35a \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### MintableERC721Logic

```
proxychains forge verify-contract 0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic \
  --compiler-version v0.8.10+commit.fc410830
```

### PToken

```
proxychains forge verify-contract 0x0139538b3513782E179ac96c690Bc1e378B42F8F \
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
proxychains forge verify-contract 0x2f34DD450924Aa9bE59422B40933eCaaD644D7Df \
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
proxychains forge verify-contract 0x540d448a1F6E79CF91902e47E1aE030F4F371265 \
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
proxychains forge verify-contract 0x8c17beb69971E127e78C2e60F0408232F7d6340F \
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
proxychains forge verify-contract 0x73A613Bf41284C9721A4dEDce77E85C3444DdEBC \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NTokenBAYC.sol:NTokenBAYC \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9" "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic:0x40266cFA6cD32485a24fE9913ed9dAa3E896b6D4 \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenChromieSquiggle

```
proxychains forge verify-contract 0x3365A57751BE442A84c8d8A6A2995905cB85Da2E \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/tokenization/NTokenChromieSquiggle.sol:NTokenChromieSquiggle \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,uint256,uint256)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x00000000000076A84feF008CDAbe6409d2FE638B" 0 9763) \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenMAYC

```
proxychains forge verify-contract 0x6f56Fc05852e5918DAa3DCfa38524dA589DEAF32 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NTokenMAYC.sol:NTokenMAYC \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9" "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic:0x40266cFA6cD32485a24fE9913ed9dAa3E896b6D4 \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenBAKC

```
proxychains forge verify-contract 0x10e6B156bfB1Dac6E1891545c0905C7025E0CEe2 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NTokenBAKC.sol:NTokenBAKC \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address,address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9" "0xdb5485C85Bd95f38f9def0cA85499eF67dC581c0" "0xFA51cdc70c512c13eF1e4A3dbf1e99082b242896" "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenOtherdeed

```
proxychains forge verify-contract 0xF7452CbE6a2c87641D27fff5cf0Ae8f8547f9021 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NTokenOtherdeed.sol:NTokenOtherdeed \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0xC3AA9bc72Bd623168860a1e5c6a4530d3D80456c" "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenStakefish

```
proxychains forge verify-contract 0x0719E8D6acBDCECD1B6A4F32Cc7367c8969Ae352 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NTokenStakefish.sol:NTokenStakefish \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x8F3527276f7dB90F1F68d166Df366fA46fD70054 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenMoonbirds

```
proxychains forge verify-contract 0xec1aD73B834677f40f4121b8081abC7c64fF1460 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NTokenMoonBirds.sol:NTokenMoonBirds \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

### NTokenUniswapV3

```
proxychains forge verify-contract 0x8D7429dBeB0532048310DcBF06064d188FF9a5f2 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NTokenUniswapV3.sol:NTokenUniswapV3 \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

### NToken

```
proxychains forge verify-contract 0x39E4c2Fc79D4C39749BaD41D09af4C8901066477 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/NToken.sol:NToken \
  --constructor-args \
  $(cast abi-encode "constructor(address,bool,address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" false "0x00000000000076A84feF008CDAbe6409d2FE638B") \
  --libraries contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic:0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --compiler-version v0.8.10+commit.fc410830
```

## DebtToken

### ATokenDebtToken

```
proxychains forge verify-contract 0xA00D612d9b2719e05eaB67602F8A72E88582c6Cf \
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
proxychains forge verify-contract 0x0f59196757B5BEDb94c149FB20E43D0323c52eA2 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/VariableDebtToken.sol:VariableDebtToken \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee") \
  --compiler-version v0.8.10+commit.fc410830
```

## PoolConfigurator

```
proxychains forge verify-contract 0x21489e1D79f03aFf8119b1E93C18BFEA84A3D24C \
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
proxychains forge verify-contract 0x3168B73fe11BC8589f5b851945F488ac3618a6A2 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "0x59B72FdB45B3182c8502cC297167FE4f821f332d") \
  contracts/protocol/pool/PoolCore.sol:PoolCore \
  --libraries contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic:0x8e70F553f3ADD2e8e2362e0b166725f9C20A0E1A \
  --libraries contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic:0xb0F62362abDd3902c684A393045B6F90AdDafff3 \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xedb95460bFD94Ea2Db15e72009C68c974a84c03e \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0x2463705ea7432D56387C2959C608c7b86e97cC85 \
  --libraries contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic:0x652256d4e10Bce0FeeBf857D41DB5fe3C6A0b113 \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolMarketplace

```
proxychains forge verify-contract 0xaeF900f14710d067Ae96555486232C7189784F50 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d") \
  contracts/protocol/pool/PoolMarketplace.sol:PoolMarketplace \
  --libraries contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic:0xfb0B010c7828e3D785996897c0c137345d3E5E00 \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolApeStaking

```
proxychains forge verify-contract 0xaeF900f14710d067Ae96555486232C7189784F50 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address,address,address,address,uint24,uint24)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d") \
  contracts/protocol/pool/PoolApeStaking.sol:PoolApeStaking \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xedb95460bFD94Ea2Db15e72009C68c974a84c03e \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0x2463705ea7432D56387C2959C608c7b86e97cC85 \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolParameters

```
proxychains forge verify-contract 0x64d0680889A1f6cFF8De6632e2C4B93957169E28 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d") \
  contracts/protocol/pool/PoolParameters.sol:PoolParameters \
  --libraries contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic:0x9AAc8FF4De73f54eE6A2c460716A9DD590C3C281 \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolPositionMover

```
proxychains forge verify-contract 0x10D89AAc6f133DeE5eE65FEE6C862228eC256eB7 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "0x5f6ac80CdB9E87f3Cfa6a90E5140B9a16A361d5C" "0x70b97a0da65c15dfb0ffa02aee6fa36e507c2762") \
  contracts/protocol/pool/PoolPositionMover.sol:PoolPositionMover \
  --libraries contracts/protocol/libraries/logic/PositionMoverLogic.sol:PositionMoverLogic:0xa9b3f3EbD6aa58D541855cf8997Fb6ad839658a2 \
  --compiler-version v0.8.10+commit.fc410830
```

### cAPE

```
proxychains forge verify-contract 0x1Ba6891D74b3B1f84b3EdFa6538D99eE979E8B63 \
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
proxychains forge verify-contract 0x549945De284a8cc102D49cE28683ee9E87edE3E3 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,uint256)" "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" 1000000000000000000) \
  contracts/misc/CLBaseCurrencySynchronicityPriceAdapter.sol:CLBaseCurrencySynchronicityPriceAdapter \
  --compiler-version v0.8.10+commit.fc410830
```

### StakefishNFTOracleWrapper

```
proxychains forge verify-contract 0x38759b66f10B82b3180F384d1Ea277FD8d3E7Ee3 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "0xE7BD56364DedF1c5BeBEA9b77A748ab3C5F8c43E" "0x4b15a9c28034dc83db40cd810001427d3bd7163d") \
  contracts/misc/ERC721OracleWrapper.sol:ERC721OracleWrapper \
  --compiler-version v0.8.10+commit.fc410830
```

### CLExchangeRateSynchronicityPriceAdapter

```
proxychains forge verify-contract 0xFCbf6B66dED63D6a8231dB091c16a3481d2E8890 \
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
proxychains forge verify-contract 0x32A880E831814CfD55dC556645Ef06816fE9bE02 \
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
proxychains forge verify-contract 0xBAa0DaA4224d2eb4619FfDC8A50Ef50c754b55F3 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/dependencies/openzeppelin/upgradeability/InitializableAdminUpgradeabilityProxy.sol:InitializableAdminUpgradeabilityProxy \
  --compiler-version v0.8.10+commit.fc410830
```

## Interest Rate Strategy

### DefaultReserveInterestRateStrategy

```
proxychains forge verify-contract 0x41BE4a63035025d79dEbecCE8df682e507fC0A2f \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,uint256,uint256,uint256,uint256)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "450000000000000000000000000" "0" "70000000000000000000000000" "3000000000000000000000000000") \
  contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol:DefaultReserveInterestRateStrategy \
  --compiler-version v0.8.10+commit.fc410830
```

### DefaultReserveAuctionStrategy

```
proxychains forge verify-contract 0xF2Da9Ae8A6f8862AdFf0CaB54D657ED4144f8F83 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(uint256,uint256,uint256,uint256,uint256,uint256)" "3000000000000000000" "1200000000000000000" "800000000000000000" "68750000000000000" "28547400155982200" "900") \
  contracts/protocol/pool/DefaultReserveAuctionStrategy.sol:DefaultReserveAuctionStrategy \
  --compiler-version v0.8.10+commit.fc410830
```

### DefaultReserveTimeLockStrategy

```
proxychains forge verify-contract 0x02f484a201dDF04E0Af41842E6f2D63090Ba16c1 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/misc/DefaultTimeLockStrategy.sol:DefaultTimeLockStrategy \
  --constructor-args \
  $(cast abi-encode "constructor(address,uint256,uint256,uint48,uint48,uint48,uint256,uint48,uint256)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" 10 30 12 7200 21600 100 600 86400) \
  --compiler-version v0.8.10+commit.fc410830
```

## TimeLock

```
proxychains forge verify-contract 0x9321de45f1057caF43d6Af611953976F271e6b42 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/misc/TimeLock.sol:TimeLock \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d" "0xb7F7F6C52F2e2fdb1963Eab30438024864c313F6") \
  --compiler-version v0.8.10+commit.fc410830
```

## Ui

### UiPoolDataProvider

```
proxychains forge verify-contract 0x30E6C173Ff3958a6629258C71Bd161e70BEe0e6D \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/ui/UiPoolDataProvider.sol:UiPoolDataProvider \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419") \
  --compiler-version v0.8.10+commit.fc410830
```
