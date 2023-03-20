// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../dependencies/openzeppelin/contracts/IERC1155.sol";
import "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/ReentrancyGuardUpgradeable.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import {ITimeLock} from "../interfaces/ITimeLock.sol";
import {IMoonBird} from "../dependencies/erc721-collections/IMoonBird.sol";
import {IPool} from "../interfaces/IPool.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";
import {GPv2SafeERC20} from "../dependencies/gnosis/contracts/GPv2SafeERC20.sol";

contract TimeLock is ITimeLock, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using GPv2SafeERC20 for IERC20;

    struct Agreement {
        DataTypes.AssetType assetType;
        DataTypes.TimeLockActionType actionType;
        bool isFrozen;
        address asset;
        address beneficiary;
        uint48 releaseTime;
        uint256[] tokenIdsOrAmounts;
    }

    event AgreementCreated(
        uint256 agreementId,
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address indexed asset,
        uint256[] tokenIdsOrAmounts,
        address indexed beneficiary,
        uint48 releaseTime
    );

    event AgreementClaimed(
        uint256 agreementId,
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address indexed asset,
        uint256[] tokenIdsOrAmounts,
        address indexed beneficiary
    );
    mapping(uint256 => Agreement) public agreements;

    uint248 public agreementCount;
    bool public frozen;

    IPool private immutable POOL;

    modifier onlyXToken(address asset) {
        // TODO add message
        require(msg.sender == POOL.getReserveXToken(asset));
        _;
    }

    constructor(IPool pool) {
        POOL = pool;
    }

    function initialize() public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
    }

    function createAgreement(
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address asset,
        uint256[] calldata tokenIdsOrAmounts,
        address beneficiary,
        uint48 releaseTime
    ) external onlyXToken(asset) returns (uint256) {
        uint256 agreementId = agreementCount++;
        agreements[agreementId] = Agreement({
            assetType: assetType,
            actionType: actionType,
            asset: asset,
            tokenIdsOrAmounts: tokenIdsOrAmounts,
            beneficiary: beneficiary,
            releaseTime: releaseTime,
            isFrozen: false
        });

        emit AgreementCreated(
            agreementId,
            assetType,
            actionType,
            asset,
            tokenIdsOrAmounts,
            beneficiary,
            releaseTime
        );

        return agreementId;
    }

    function _validateAndDeleteAgreement(uint256 agreementId)
        internal
        returns (Agreement memory)
    {
        require(!frozen, "TimeLock is frozen");

        Agreement memory agreement = agreements[agreementId];
        require(msg.sender == agreement.beneficiary, "Not beneficiary");
        require(
            block.timestamp >= agreement.releaseTime,
            "Release time not reached"
        );
        require(!agreement.isFrozen, "Agreement frozen");
        delete agreements[agreementId];

        emit AgreementClaimed(
            agreementId,
            agreement.assetType,
            agreement.actionType,
            agreement.asset,
            agreement.tokenIdsOrAmounts,
            agreement.beneficiary
        );

        return agreement;
    }

    function claim(uint256 agreementId) external nonReentrant {
        Agreement memory agreement = _validateAndDeleteAgreement(agreementId);

        if (agreement.assetType == DataTypes.AssetType.ERC20) {
            IERC20(agreement.asset).safeTransfer(
                agreement.beneficiary,
                agreement.tokenIdsOrAmounts[0]
            );
        } else if (agreement.assetType == DataTypes.AssetType.ERC721) {
            IERC721 erc721 = IERC721(agreement.asset);
            for (uint256 i = 0; i < agreement.tokenIdsOrAmounts.length; i++) {
                erc721.safeTransferFrom(
                    address(this),
                    agreement.beneficiary,
                    agreement.tokenIdsOrAmounts[i]
                );
            }
        }
    }

    function claimMoonBirds(uint256 agreementId) external nonReentrant {
        Agreement memory agreement = _validateAndDeleteAgreement(agreementId);

        require(
            agreement.assetType == DataTypes.AssetType.ERC721,
            "wrong asset type"
        );

        IMoonBird moonBirds = IMoonBird(agreement.asset);
        for (uint256 i = 0; i < agreement.tokenIdsOrAmounts.length; i++) {
            moonBirds.safeTransferWhileNesting(
                address(this),
                agreement.beneficiary,
                agreement.tokenIdsOrAmounts[i]
            );
        }
    }

    function freezeAgreement(uint256 agreementId, bool freeze)
        public
        onlyOwner
    {
        agreements[agreementId].isFrozen = freeze;
    }

    function freezeAllAgreements(bool freeze) external onlyOwner {
        frozen = freeze;
    }
}
