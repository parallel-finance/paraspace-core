// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ParaVersionedInitializable} from "../../protocol/libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {ReserveConfiguration} from "../../protocol/libraries/configuration/ReserveConfiguration.sol";
import {PoolLogic} from "../../protocol/libraries/logic/PoolLogic.sol";
import {ReserveLogic} from "../../protocol/libraries/logic/ReserveLogic.sol";
import {SupplyLogic} from "../../protocol/libraries/logic/SupplyLogic.sol";
import {MarketplaceLogic} from "../../protocol/libraries/logic/MarketplaceLogic.sol";
import {BorrowLogic} from "../../protocol/libraries/logic/BorrowLogic.sol";
import {LiquidationLogic} from "../../protocol/libraries/logic/LiquidationLogic.sol";
import {AuctionLogic} from "../../protocol/libraries/logic/AuctionLogic.sol";
import {DataTypes} from "../../protocol/libraries/types/DataTypes.sol";
import {IERC20WithPermit} from "../../interfaces/IERC20WithPermit.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {IPoolCore} from "../../interfaces/IPoolCore.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";
import {PoolStorage} from "../../protocol/pool/PoolStorage.sol";
import {FlashClaimLogic} from "../../protocol/libraries/logic/FlashClaimLogic.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {IERC721Receiver} from "../../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IMarketplace} from "../../interfaces/IMarketplace.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import {ParaReentrancyGuard} from "../../protocol/libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import {IAuctionableERC721} from "../../interfaces/IAuctionableERC721.sol";
import {IReserveAuctionStrategy} from "../../interfaces/IReserveAuctionStrategy.sol";

import {IPoolCore} from "../../interfaces/IPoolCore.sol";
import {PoolCore} from "../../protocol/pool/PoolCore.sol";

string constant EMEGENCY_DISABLE_CALL = "emergency disable call";

/**
 * @title PoolCoreV2 is just a mock impl to demo temporarily disable functions
 **/
contract PoolCoreV2 is
    PoolCore
{
    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(IPoolAddressesProvider provider) PoolCore(provider){

    }

    /// @inheritdoc IPoolCore
    function liquidateERC20(
        address,
        address,
        address,
        uint256,
        bool
    ) external payable virtual override nonReentrant {
        revert(EMEGENCY_DISABLE_CALL);
    }

    /// @inheritdoc IPoolCore
    function liquidateERC721(
        address,
        address,
        uint256,
        uint256,
        bool
    ) external payable virtual override nonReentrant {
        revert(EMEGENCY_DISABLE_CALL);
    }
}
