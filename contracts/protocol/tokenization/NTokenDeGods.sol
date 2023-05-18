// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {NToken} from "./NToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ERC721PointsStakingV2} from "../../dependencies/degods-staking/ERC721PointsStakingV2.sol";
import {IERC5058Upgradeable} from "../../dependencies/degods-staking/ERC5058/IERC5058Upgradeable.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {IACLManager} from "../../interfaces/IACLManager.sol";

/**
 * @title NTokenBAKC
 *
 * @notice Implementation of the NTokenBAKC for the ParaSpace protocol
 */
contract NTokenDeGods is NToken {
    using SafeERC20 for IERC20;

    ERC721PointsStakingV2 private immutable deGodsStaking;
    //we recording fee tokens as immutable here, because stakeFeeToken and unstakeFeeToken can't be updated in deGodsStaking contract
    //while fetching fee dynamically since fee can be updated by owner at any time
    IERC20 private immutable stakeFeeToken;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(
        IPool pool,
        address delegateRegistry,
        address _deGodsStaking
    ) NToken(pool, false, delegateRegistry) {
        deGodsStaking = ERC721PointsStakingV2(_deGodsStaking);
        stakeFeeToken = IERC20(address(deGodsStaking.stakeFeeToken()));
    }

    function initialize(
        IPool initializingPool,
        address underlyingAsset,
        IRewardController incentivesController,
        string calldata nTokenName,
        string calldata nTokenSymbol,
        bytes calldata params
    ) public virtual override initializer {
        super.initialize(
            initializingPool,
            underlyingAsset,
            incentivesController,
            nTokenName,
            nTokenSymbol,
            params
        );

        //approve fee token for staking contract
        uint256 allowance = stakeFeeToken.allowance(
            address(this),
            address(deGodsStaking)
        );
        if (allowance == 0) {
            stakeFeeToken.approve(address(deGodsStaking), type(uint256).max);
        }

        bool isLockApproved = IERC5058Upgradeable(underlyingAsset)
            .isLockApprovedForAll(address(this), address(deGodsStaking));
        if (!isLockApproved) {
            IERC5058Upgradeable(underlyingAsset).setLockApprovalForAll(
                address(deGodsStaking),
                true
            );
        }
    }

    function pointStaking(uint256[] memory tokenIds) external {
        require(_isPoolAdminOrOwner(tokenIds), Errors.CALLER_NOT_ALLOWED);
        uint256 totalFee = _getStakingFee();
        if (totalFee > 0) {
            stakeFeeToken.safeTransferFrom(
                msg.sender,
                address(this),
                totalFee * tokenIds.length
            );
        }
        _pointStaking(tokenIds);
    }

    function withdrawFromStaking(uint256[] memory tokenIds) external {
        require(_isPoolAdminOrOwner(tokenIds), Errors.CALLER_NOT_ALLOWED);
        _withdrawFromStaking(tokenIds);
    }

    function _transferUnderlyingTo(
        address target,
        uint256[] memory tokenIds,
        DataTypes.TimeLockParams calldata timeLockParams
    ) internal override {
        uint256[] memory stakingIds = _findStakingTokenIds(tokenIds);
        if (stakingIds.length > 0) {
            _withdrawFromStaking(stakingIds);
        }
        super._transferUnderlyingTo(target, tokenIds, timeLockParams);
    }

    function onERC721Received(
        address,
        address from,
        uint256 tokenId,
        bytes memory
    ) external virtual override returns (bytes4) {
        if (msg.sender == _ERC721Data.underlyingAsset) {
            uint256 totalFee = _getStakingFee();
            if (totalFee > 0) {
                address nTokenOwner = ownerOf(tokenId);
                //for normal supplyERC721, nTokenOwner is zero address, payer address is from.
                //for any other case, payer address is nTokenOwner
                address payer = nTokenOwner != address(0) ? nTokenOwner : from;
                uint256 feeBalance = stakeFeeToken.balanceOf(payer);
                uint256 feeAllowance = stakeFeeToken.allowance(
                    payer,
                    address(this)
                );
                if (feeBalance >= totalFee && feeAllowance >= totalFee) {
                    stakeFeeToken.safeTransferFrom(
                        payer,
                        address(this),
                        totalFee
                    );
                    _singlePointStaking(tokenId);
                }
            } else {
                _singlePointStaking(tokenId);
            }
        }

        return this.onERC721Received.selector;
    }

    function _getStakingFee() internal view returns (uint256) {
        uint256 stakingFee = deGodsStaking.stakeFee();
        uint256 unstakingFee = deGodsStaking.unstakeFee();
        return stakingFee + unstakingFee;
    }

    function _findStakingTokenIds(uint256[] memory tokenIds)
        internal
        view
        returns (uint256[] memory)
    {
        uint256 originArrayLength = tokenIds.length;
        uint256 newArrayLength = 0;
        uint256[] memory newArray = new uint256[](originArrayLength);
        for (uint256 index = 0; index < originArrayLength; index++) {
            if (_checkIfInStaking(tokenIds[index])) {
                newArray[newArrayLength] = tokenIds[index];
                newArrayLength++;
            }
        }
        assembly {
            mstore(newArray, newArrayLength)
        }
        return newArray;
    }

    function _checkIfInStaking(uint256 tokenId) internal view returns (bool) {
        (address stakingAddress, , , ) = deGodsStaking.stakingMetadata(tokenId);
        return stakingAddress == address(this);
    }

    function _singlePointStaking(uint256 tokenId) internal {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        deGodsStaking.stake(tokenIds);
    }

    function _pointStaking(uint256[] memory tokenIds) internal {
        deGodsStaking.stake(tokenIds);
    }

    function _withdrawFromStaking(uint256[] memory tokenIds) internal {
        deGodsStaking.withdraw(tokenIds);
    }

    function getXTokenType() external pure override returns (XTokenType) {
        return XTokenType.NTokenDeGods;
    }

    function _isPoolAdminOrOwner(uint256[] memory tokenIds)
        internal
        view
        returns (bool)
    {
        IACLManager aclManager = IACLManager(
            _addressesProvider.getACLManager()
        );
        if (!aclManager.isPoolAdmin(msg.sender)) {
            uint256 arrayLength = tokenIds.length;
            for (uint256 index = 0; index < arrayLength; index++) {
                if (ownerOf(tokenIds[index]) != msg.sender) {
                    return false;
                }
            }
        }

        return true;
    }
}
