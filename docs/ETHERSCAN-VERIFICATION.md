# Etherscan Verification

## Setup Environment

```
export ETHERSCAN_KEY="<etherscan_key>"
export NETWORK=mainnet
export ALCHEMY_KEY="<alchemy_key>"
export ETH_RPC_URL="https://eth-$NETWORK.alchemyapi.io/v2/$ALCHEMY_KEY"
export ETHERSCAN_API_KEY="$ETHERSCAN_KEY"
export VERIFIER_URL="https://api.etherscan.io"
```

## Install proxychains

## Libraries

### SupplyLogic

```
proxychains forge verify-contract 0xC0fe2dbe75B8908073B14BF19Af71B1B181f8984 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### BorrowLogic

```
proxychains forge verify-contract 0x2Cdd46Ea306771DF11CDfc8be8daBC4fe4C42000 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### LiquidationLogic

```
proxychains forge verify-contract 0x9e3FF2c3C7B72493B37321D447e6BBE932Af054D \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xC0fe2dbe75B8908073B14BF19Af71B1B181f8984 \
  --compiler-version v0.8.10+commit.fc410830
```

### FlashClaimlogic

```
proxychains forge verify-contract 0x70a226448d9095F4c0ca6Fbe55bBd4da0C75a0A5 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### ConfiguratorLogic

```
proxychains forge verify-contract 0xe8bcFDd8E9d22653a2dA7FE881A12E56aF8983C7 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### AuctionLogic

```
proxychains forge verify-contract 0xCE05EFdC79cE8Fb6D0Ed5A4a223b45ab6a51754e \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### AuctionLogic

```
proxychains forge verify-contract 0xCE05EFdC79cE8Fb6D0Ed5A4a223b45ab6a51754e \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/PositionMoverLogic.sol:PositionMoverLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0x7dc12cCe38Fd20393d19d5E4d65b021B35093aAB \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0xBd25Aa1c423cD59662aD1C328f963ce90Afbd94B \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolLogic

```
proxychains forge verify-contract 0xDA4b9E3D30A59eCF5AD669ADC591Ddd176fD80e8 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic \
  --compiler-version v0.8.10+commit.fc410830
```

### MarketplaceLogic

```
proxychains forge verify-contract 0x90c3B619a9714394d45f7CA4D0509A58C991ad02 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xC0fe2dbe75B8908073B14BF19Af71B1B181f8984 \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0x2Cdd46Ea306771DF11CDfc8be8daBC4fe4C42000 \
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
proxychains forge verify-contract 0x1a5191C39D354e52cB60ef060707568931233184 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/pool/PoolConfigurator.sol:PoolConfigurator \
  --libraries contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic:0xe8bcFDd8E9d22653a2dA7FE881A12E56aF8983C7 \
  --compiler-version v0.8.10+commit.fc410830
```

## Pool

### PoolCore

```
proxychains forge verify-contract 0xE8932402560a13d9519649103d091c009e21778b \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x45a35124749B061a29f91cc8ddf85606586dcf24" "0x9F55EaBD8496380BecfB9465d69ADD22eA6Aa7a2") \
  contracts/protocol/pool/PoolCore.sol:PoolCore \
  --libraries contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic:0xCE05EFdC79cE8Fb6D0Ed5A4a223b45ab6a51754e \
  --libraries contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic:0x9e3FF2c3C7B72493B37321D447e6BBE932Af054D \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xC0fe2dbe75B8908073B14BF19Af71B1B181f8984 \
  --libraries contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic:0x2Cdd46Ea306771DF11CDfc8be8daBC4fe4C42000 \
  --libraries contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic:0x70a226448d9095F4c0ca6Fbe55bBd4da0C75a0A5 \
  --compiler-version v0.8.10+commit.fc410830
```

### PoolMarketplace

```
proxychains forge verify-contract 0x6B58baa08a91f0F08900f43692a9796045454A17 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x6cD30e716ADbE47dADf7319f6F2FB83d507c857d") \
  contracts/protocol/pool/PoolMarketplace.sol:PoolMarketplace \
  --libraries contracts/protocol/libraries/logic/MarketplaceLogic.sol:MarketplaceLogic:0x1fE34BF51E802Adba9b1cBc0E216EFAeb1FE226B \
  --compiler-version v0.8.10+commit.fc410830
```

### PositionMover

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

### CLFixedPriceSynchronicityPriceAdapter

```
proxychains forge verify-contract 0x6D09f55aae5489D664203Fb8aD72A8d520A87470 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(uint256)" 10000000000000000) \
  contracts/misc/CLFixedPriceSynchronicityPriceAdapter.sol:CLFixedPriceSynchronicityPriceAdapter \
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
proxychains forge verify-contract 0xc0A1AACb2D3B98b5d1050A14de60725D46D4404f \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(address,address,address)" "0x4893376342d5d7b3e31d4184c08b265e5ab2a3f6" "0x622e4726a167799826d1e1d150b076a7725f5d81" "0x5419C015B2D3f1e4600204eD7A67b8A97Fdf0429") \
  contracts/misc/UniswapV3OracleWrapper.sol:UniswapV3OracleWrapper \
  --compiler-version v0.8.10+commit.fc410830
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
proxychains forge verify-contract 0xB1A4B17e33e164b826e213c8CeF448Bc82afdb5a \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(uint256,uint256,uint256,uint256,uint256,uint256)" "10000000000000000000" "1100000000000000000" "800000000000000000" "6250000000000000" "45984894024785900" "900") \
  contracts/protocol/pool/DefaultReserveAuctionStrategy.sol:DefaultReserveAuctionStrategy \
  --compiler-version v0.8.10+commit.fc410830
```

### DefaultReserveTimeLockStrategy

```
proxychains forge verify-contract 0x0bCc9C5F95833F37317C4F3Fb62bB4e9A7e8C8aa \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/misc/DefaultTimeLockStrategy.sol:DefaultTimeLockStrategy \
  --constructor-args \
  $(cast abi-encode "constructor(address,uint256,uint256,uint48,uint48,uint48,uint256,uint48,uint256)" "0x638a98BBB92a7582d07C52ff407D49664DC8b3Ee" 4 12 12 7200 43200 10 600 86400) \
  --compiler-version v0.8.10+commit.fc410830
```

## TimeLock

```
proxychains forge verify-contract 0x3F736F58F3c51a7C92d8b6996B77Df19a0b5394F \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/misc/TimeLock.sol:TimeLock \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x45a35124749B061a29f91cc8ddf85606586dcf24" "0x0000000000000000000000000000000000000000") \
  --compiler-version v0.8.10+commit.fc410830
```
