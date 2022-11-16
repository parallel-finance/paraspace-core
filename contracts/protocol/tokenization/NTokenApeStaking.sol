// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {ApeStakingLogic} from "./libraries/ApeStakingLogic.sol";

/**
 * @title ApeCoinStaking NToken
 *
 * @notice Implementation of the NToken for the ParaSpace protocol
 */
abstract contract NTokenApeStaking is NToken {
    ApeCoinStaking immutable _apeCoinStaking;

    uint256 constant BAYC_POOL_ID = 1;
    uint256 constant MAYC_POOL_ID = 2;
    uint256 constant BAKC_POOL_ID = 3;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, address apeCoinStaking) NToken(pool, false) {
        _apeCoinStaking = ApeCoinStaking(apeCoinStaking);
    }

    function initialize(
        IPool initializingPool,
        address underlyingAsset,
        IRewardController incentivesController,
        string calldata nTokenName,
        string calldata nTokenSymbol,
        bytes calldata params
    ) public virtual override initializer {
        _apeCoinStaking.apeCoin().approve(
            address(_apeCoinStaking),
            type(uint256).max
        );

        super.initialize(
            initializingPool,
            underlyingAsset,
            incentivesController,
            nTokenName,
            nTokenSymbol,
            params
        );
    }

    /**
     * @notice Overrides the transferOnLiquidation from NToken to withdraw all staked and pending rewards before transfer the asset on liquidation
     */
    function transferOnLiquidation(
        address from,
        address to,
        uint256 tokenId
    ) external override onlyPool nonReentrant {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        ApeStakingLogic.executeAutoWithdraw(
            _ERC721Data.owners,
            _apeCoinStaking,
            POOL_ID(),
            tokenIds,
            from
        );

        _transfer(from, to, tokenId, false);
    }

    /**
     * @notice Overrides the burn from NToken to withdraw all staked and pending rewards before burning the NToken on liquidation/withdraw
     */
    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds
    ) external virtual override onlyPool nonReentrant returns (uint64, uint64) {
        ApeStakingLogic.executeAutoWithdraw(
            _ERC721Data.owners,
            _apeCoinStaking,
            POOL_ID(),
            tokenIds,
            from
        );

        return _burn(from, receiverOfUnderlying, tokenIds);
    }

    function POOL_ID() internal virtual returns (uint256) {
        // should be overridden
        return 0;
    }
}
