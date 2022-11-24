pragma solidity ^0.8.10;

import "../helpers/Common.sol";
import "forge-std/Test.sol";

import {PoolCore} from "../../../contracts/protocol/pool/PoolCore.sol";
import {PoolParameters} from "../../../contracts/protocol/pool/PoolParameters.sol";
import {PoolMarketplace} from "../../../contracts/protocol/pool/PoolMarketplace.sol";
import {PoolApeStaking} from "../../../contracts/protocol/pool/PoolApeStaking.sol";
import {IPoolAddressesProvider} from "../../../contracts/interfaces/IPoolAddressesProvider.sol";
import {IParaProxy} from "../../../contracts/interfaces/IParaProxy.sol";

contract PoolDeployer is Deployer {
    constructor (ParaspaceConfig _config) Deployer(_config) {}

    function deploy() public override FromDeployer {
        IPoolAddressesProvider provider = IPoolAddressesProvider(config.contractAddresses("PoolAddressesProvider"));
        PoolCore poolCore = new PoolCore(provider); 
        PoolParameters poolParameters = new PoolParameters(provider);
        PoolMarketplace poolMarketplace = new PoolMarketplace(provider);
        PoolApeStaking poolApeStaking = new PoolApeStaking(provider);

        bytes4[] memory poolCoreSignatures = new bytes4[](32);
        poolCoreSignatures[0] = poolCore.initialize.selector;
        poolCoreSignatures[1] = poolCore.supply.selector;
        poolCoreSignatures[2] = poolCore.supplyERC721.selector;
        poolCoreSignatures[3] = poolCore.supplyERC721FromNToken.selector;
        poolCoreSignatures[4] = poolCore.supplyWithPermit.selector;
        poolCoreSignatures[5] = poolCore.withdraw.selector;
        poolCoreSignatures[6] = poolCore.withdrawERC721.selector;
        poolCoreSignatures[7] = poolCore.decreaseUniswapV3Liquidity.selector;
        poolCoreSignatures[8] = poolCore.borrow.selector;
        poolCoreSignatures[9] = poolCore.repay.selector;
        poolCoreSignatures[10] = poolCore.repayWithPTokens.selector;
        poolCoreSignatures[11] = poolCore.repayWithPermit.selector;
        poolCoreSignatures[12] = poolCore.setUserUseERC20AsCollateral.selector;
        poolCoreSignatures[13] = poolCore.setUserUseERC721AsCollateral.selector;
        poolCoreSignatures[14] = poolCore.liquidateERC20.selector;
        poolCoreSignatures[15] = poolCore.liquidateERC721.selector;
        poolCoreSignatures[16] = poolCore.startAuction.selector;
        poolCoreSignatures[17] = poolCore.endAuction.selector;
        poolCoreSignatures[18] = poolCore.flashClaim.selector;
        poolCoreSignatures[19] = poolCore.getReserveData.selector;
        poolCoreSignatures[20] = poolCore.getConfiguration.selector;
        poolCoreSignatures[21] = poolCore.getUserConfiguration.selector;
        poolCoreSignatures[22] = poolCore.getReserveNormalizedIncome.selector;
        poolCoreSignatures[23] = poolCore.getReserveNormalizedVariableDebt.selector;
        poolCoreSignatures[24] = poolCore.getReservesList.selector;
        poolCoreSignatures[25] = poolCore.getReserveAddressById.selector;
        poolCoreSignatures[26] = poolCore.MAX_NUMBER_RESERVES.selector;
        poolCoreSignatures[27] = poolCore.AUCTION_RECOVERY_HEALTH_FACTOR.selector;
        poolCoreSignatures[28] = poolCore.finalizeTransfer.selector;
        poolCoreSignatures[29] = poolCore.finalizeTransferERC721.selector;
        poolCoreSignatures[30] = poolCore.getAuctionData.selector;
        poolCoreSignatures[31] = poolCore.onERC721Received.selector;



        bytes4[] memory poolParametersSignatures = new bytes4[](11);
        poolParametersSignatures[0] = poolParameters.mintToTreasury.selector;
        poolParametersSignatures[1] = poolParameters.initReserve.selector;
        poolParametersSignatures[2] = poolParameters.dropReserve.selector;
        poolParametersSignatures[3] = poolParameters.setReserveInterestRateStrategyAddress.selector;
        poolParametersSignatures[4] = poolParameters.setReserveAuctionStrategyAddress.selector;
        poolParametersSignatures[5] = poolParameters.setConfiguration.selector;
        poolParametersSignatures[6] = poolParameters.rescueTokens.selector;
        poolParametersSignatures[7] = poolParameters.setAuctionRecoveryHealthFactor.selector;
        poolParametersSignatures[8] = poolParameters.getUserAccountData.selector;
        poolParametersSignatures[9] = poolParameters.getAssetLtvAndLT.selector;
        poolParametersSignatures[10] = poolParameters.setAuctionValidityTime.selector;

        bytes4[] memory poolMarketplaceSignatures = new bytes4[](4);
        poolMarketplaceSignatures[0] = poolMarketplace.buyWithCredit.selector;
        poolMarketplaceSignatures[1] = poolMarketplace.batchBuyWithCredit.selector;
        poolMarketplaceSignatures[2] = poolMarketplace.acceptBidWithCredit.selector;
        poolMarketplaceSignatures[3] = poolMarketplace.batchAcceptBidWithCredit.selector;

        bytes4[] memory poolApeStakingSignatures = new bytes4[](7);
        poolApeStakingSignatures[0] = poolApeStaking.withdrawApeCoin.selector;
        poolApeStakingSignatures[1] = poolApeStaking.claimApeCoin.selector;
        poolApeStakingSignatures[2] = poolApeStaking.withdrawBAKC.selector;
        poolApeStakingSignatures[3] = poolApeStaking.claimBAKC.selector;
        poolApeStakingSignatures[4] = poolApeStaking.borrowApeAndStake.selector;
        poolApeStakingSignatures[5] = poolApeStaking.unstakeApePositionAndRepay.selector;
        poolApeStakingSignatures[6] = poolApeStaking.repayAndSupply.selector;


        IParaProxy.ProxyImplementation[]
            memory implementationParams0 = new IParaProxy.ProxyImplementation[](
                1
            );

        // update poolParameters impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolParameters),
            IParaProxy.ProxyImplementationAction.Add,
            poolParametersSignatures
        );
        provider.updatePoolImpl(implementationParams0, address(0), bytes(""));

        // update poolMarketplace impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolMarketplace),
            IParaProxy.ProxyImplementationAction.Add,
            poolMarketplaceSignatures
        );
        provider.updatePoolImpl(implementationParams0, address(0), bytes(""));

        // update poolApeStaking impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolApeStaking),
            IParaProxy.ProxyImplementationAction.Add,
            poolApeStakingSignatures
        );
        provider.updatePoolImpl(implementationParams0, address(0), bytes(""));

        // update poolCore impl
        implementationParams0[0] = IParaProxy.ProxyImplementation(
            address(poolCore),
            IParaProxy.ProxyImplementationAction.Add,
            poolCoreSignatures
        );
        bytes memory _calldata = abi.encodeWithSelector(
            poolCore.initialize.selector,
            address(provider)
        );
        address poolAddress = provider.getPool();
        provider.updatePoolImpl(
            implementationParams0,
            poolAddress,
            _calldata
        );
    }
}
