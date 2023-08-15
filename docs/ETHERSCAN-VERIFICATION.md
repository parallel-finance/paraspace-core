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
  --compiler-version v0.8.17+commit.8df45f5f
```

### BorrowLogic

```
proxychains forge verify-contract 0x2Cdd46Ea306771DF11CDfc8be8daBC4fe4C42000 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/BorrowLogic.sol:BorrowLogic \
  --compiler-version v0.8.17+commit.8df45f5f
```

### LiquidationLogic

```
proxychains forge verify-contract 0x9e3FF2c3C7B72493B37321D447e6BBE932Af054D \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/LiquidationLogic.sol:LiquidationLogic \
  --libraries contracts/protocol/libraries/logic/SupplyLogic.sol:SupplyLogic:0xC0fe2dbe75B8908073B14BF19Af71B1B181f8984 \
  --compiler-version v0.8.17+commit.8df45f5f
```

### FlashClaimlogic

```
proxychains forge verify-contract 0x70a226448d9095F4c0ca6Fbe55bBd4da0C75a0A5 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/FlashClaimLogic.sol:FlashClaimLogic \
  --compiler-version v0.8.17+commit.8df45f5f
```

### ConfiguratorLogic

```
proxychains forge verify-contract 0xe8bcFDd8E9d22653a2dA7FE881A12E56aF8983C7 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic \
  --compiler-version v0.8.17+commit.8df45f5f
```

### AuctionLogic

```
proxychains forge verify-contract 0xCE05EFdC79cE8Fb6D0Ed5A4a223b45ab6a51754e \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/libraries/logic/AuctionLogic.sol:AuctionLogic \
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
```

### PoolLogic

```
proxychains forge verify-contract 0xDA4b9E3D30A59eCF5AD669ADC591Ddd176fD80e8 \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
  contracts/protocol/libraries/logic/PoolLogic.sol:PoolLogic \
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
```

### ApeStakingLogic

```
proxychains forge verify-contract 0x0147154e1Be2E17b6d32D9589A2D8EA78a5cf35a \
  --chain-id 1 \
  --num-of-optimizations 1000 \
  --watch \
contracts/protocol/tokenization/libraries/ApeStakingLogic.sol:ApeStakingLogic \
  --compiler-version v0.8.17+commit.8df45f5f
```

### MintableERC721Logic

```
proxychains forge verify-contract 0x03734D476Ed3e158c969780F58A7537Dc7cE7F13 \
  --chain-id 1 \
  --num-of-optimizations 1 \
  --watch \
  contracts/protocol/tokenization/libraries/MintableERC721Logic.sol:MintableERC721Logic \
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
```

## PoolConfigurator

```
proxychains forge verify-contract 0x1a5191C39D354e52cB60ef060707568931233184 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/protocol/pool/PoolConfigurator.sol:PoolConfigurator \
  --libraries contracts/protocol/libraries/logic/ConfiguratorLogic.sol:ConfiguratorLogic:0xe8bcFDd8E9d22653a2dA7FE881A12E56aF8983C7 \
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
```

## Oracle

### ParaSpaceOracle

```
proxychains forge verify-contract 0x075bC485a618873e7Fb356849Df30C0c1eDca2Bc \
 --chain-id 1 \
 --num-of-optimizations 800 \
 --watch \
 contracts/misc/ParaSpaceOracle.sol:ParaSpaceOracle \
 --constructor-args \
 $(cast abi-encode "constructor(address,address[],address[],address,address,uint256)" "0x45a35124749B061a29f91cc8ddf85606586dcf24" "["0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1","0x82aF49447D8a07e3bd95BD0d56f35241523fBab1","0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8","0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9","0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F","0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f","0x5979d7b546e38e414f7e9822514be443a4800529","0x912ce59144191c1204e64559fe8253a0e49e6548","0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a","0xf97f4df75117a78c1a5a0dbb814af92458539fb4","0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0","0x040d1edc9569d4bab2d15287dc5a4f10f56a56b8","0xba5ddd1f9d7f570dc94a51479a000e3bce967196","0x3082cc23568ea640225c2467653db90e9250aaa0","0xC36442b4a4522E871399CD717aBDD847Ab11FE88"]" "["0xc5c8e77b397e531b8ec06bfb0048328b30e9ecfb","0x639fe6ab55c921f74e7fac1ee960c0b6293ba612","0x50834f3163758fcc1df9973b6e91f0f0f0434ad3","0x3f3f5df88dc9f13eac63df89ec16ef6e7e25dde7","0x0809e3d38d1b4214958faf06d8b1b1a2b73f2ab8","0xd0c7101eacbb49f3decccc166d238410d6d46d57","0x230E0321Cf38F09e247e50Afc7801EA2351fe56F","0x912CE59144191C1204E64559FE8253a0e49E6548","0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a","0x86e53cf1b870786351da77a57575e79cb55812cb","0x9c917083fdb403ab5adbec26ee294f6ecada2720","0xbe5ea816870d11239c543f84b71439511d70b94f","0xad1d5344aade45f43e596773bcc4c423eabdd034","0x20d0fcab0ecfd078b036b6caf1fac69a6453b352","0xBc5ee94c86d9be81E99Cffd18050194E51B8B435"]" "0x0000000000000000000000000000000000000000" "0x0000000000000000000000000000000000000000" "100000000") \
 --compiler-version v0.8.10+commit.fc410830
```

### CLFixedPriceSynchronicityPriceAdapter

```
proxychains forge verify-contract 0x6D09f55aae5489D664203Fb8aD72A8d520A87470 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  --constructor-args \
  $(cast abi-encode "constructor(uint256)" 10000000000000000) \
  contracts/misc/CLFixedPriceSynchronicityPriceAdapter.sol:CLFixedPriceSynchronicityPriceAdapter \
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
```

## Proxy

### InitializableAdminUpgradeabilityProxy

```
proxychains forge verify-contract 0xBAa0DaA4224d2eb4619FfDC8A50Ef50c754b55F3 \
  --chain-id 1 \
  --num-of-optimizations 200 \
  --watch \
  contracts/dependencies/openzeppelin/upgradeability/InitializableAdminUpgradeabilityProxy.sol:InitializableAdminUpgradeabilityProxy \
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
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
  --compiler-version v0.8.17+commit.8df45f5f
```

## UI

### UiPoolDataProvider

```
proxychains forge verify-contract 0x94bDD135ccC48fF0440D750300A4e4Ba9B216B3A \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/ui/UiPoolDataProvider.sol:UiPoolDataProvider \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x50834f3163758fcc1df9973b6e91f0f0f0434ad3" "0x50834f3163758fcc1df9973b6e91f0f0f0434ad3") \
  --compiler-version v0.8.10+commit.fc410830
```

### UiIncentiveDataProvider

```
proxychains forge verify-contract 0x94bDD135ccC48fF0440D750300A4e4Ba9B216B3A \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/ui/UiIncentiveDataProvider.sol:UiIncentiveDataProvider \
  --compiler-version v0.8.10+commit.fc410830
```

### WETHGateway

```
proxychains forge verify-contract 0xCCEaDe52890f49C212B0f993d8a1096eD57Cf747 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/ui/WETHGateway.sol:WETHGateway \
  --constructor-args \
  $(cast abi-encode "constructor(address,address)" "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" "0x9E96e796493f630500B1769ff6232b407c8435A3") \
  --compiler-version v0.8.10+commit.fc410830
```

## Seaport

### Seaport

```
proxychains forge verify-contract 0x1B85e8E7a75Bc68e28823Ce7CCD3fAdEA551040c \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/dependencies/seaport/contracts/Seaport.sol:Seaport \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x5C2e1E5F0F614C4C3443E98680130191de80dC93") \
  --compiler-version v0.8.10+commit.fc410830
```

### SeaportAdapter

```
proxychains forge verify-contract 0xaE40779759Cc4Bf261f12C179A80df728c8d0c75 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/misc/marketplaces/SeaportAdapter.sol:SeaportAdapter \
  --constructor-args \
  $(cast abi-encode "constructor(address)" "0x45a35124749B061a29f91cc8ddf85606586dcf24") \
  --compiler-version v0.8.10+commit.fc410830
```

### Conduit

```
proxychains forge verify-contract 0x7A558886Fee0DeF217405C18cb19Eda213C72019 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/dependencies/seaport/contracts/conduit/Conduit.sol:Conduit \
  --compiler-version v0.8.10+commit.fc410830
```

### PausableZone

```
proxychains forge verify-contract 0x3EBf80B51A4f1560Ebc64937A326a809Eb86A5B4 \
  --chain-id 1 \
  --num-of-optimizations 800 \
  --watch \
  contracts/dependencies/seaport/contracts/zones/PausableZone.sol:PausableZone \
  --compiler-version v0.8.10+commit.fc410830
```
