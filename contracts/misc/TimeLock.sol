// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../dependencies/openzeppelin/contracts/IERC1155.sol";
import "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import "../dependencies/openzeppelin/upgradeability/ReentrancyGuardUpgradeable.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import {ITimeLock} from "../interfaces/ITimeLock.sol";
import {IPool} from "../interfaces/IPool.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";
import {GPv2SafeERC20} from "../dependencies/gnosis/contracts/GPv2SafeERC20.sol";

contract TimeLock is ITimeLock, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using GPv2SafeERC20 for IERC20;

    struct Agreement {
        DataTypes.AssetType assetType;
        bool isFrozen;
        address asset;
        address beneficiary;
        uint256 releaseTime; //TODO change to smaller unit
        uint256[] tokenIdsOrAmounts;
    }

    event AgreementCreated(
        uint256 agreementId,
        DataTypes.AssetType assetType,
        address indexed asset,
        uint256[] tokenIdsOrAmounts,
        address indexed beneficiary,
        uint256 releaseTime
    );

    event AgreementClaimed(
        uint256 agreementId,
        DataTypes.AssetType assetType,
        address indexed asset,
        uint256[] tokenIdsOrAmounts,
        address indexed beneficiary
    );

    mapping(uint256 => Agreement) public agreements;
    uint256 public agreementCount;
    bool public frozen;
    IPool private immutable POOL;

    modifier onlyXToken(address asset) {
        // TODO add message
        require(msg.sender == POOL.getReserveXToken(asset));
        _;
    }

    constructor(address _admin, IPool pool) {
        transferOwnership(_admin);
        POOL = pool;
    }

    function initialize() public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
    }

    function createAgreement(
        DataTypes.AssetType assetType,
        address asset,
        uint256[] memory tokenIdsOrAmounts,
        address beneficiary,
        uint256 releaseTime
    ) public onlyXToken(asset) returns (uint256) {
        uint256 agreementId = agreementCount++;
        agreements[agreementId] = Agreement({
            assetType: assetType,
            asset: asset,
            tokenIdsOrAmounts: tokenIdsOrAmounts,
            beneficiary: beneficiary,
            releaseTime: releaseTime,
            isFrozen: false
        });

        emit AgreementCreated(
            agreementId,
            assetType,
            asset,
            tokenIdsOrAmounts,
            beneficiary,
            releaseTime
        );

        return agreementId;
    }

    function claim(uint256 agreementId) external nonReentrant {
        require(!frozen, "TimeLock is frozen");

        Agreement memory agreement = agreements[agreementId];
        require(msg.sender == agreement.beneficiary, "Not beneficiary");
        require(
            block.timestamp >= agreement.releaseTime,
            "Release time not reached"
        );
        require(!agreement.isFrozen, "Agreement frozen");

        delete agreements[agreementId];

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

        emit AgreementClaimed(
            agreementId,
            agreement.assetType,
            agreement.asset,
            agreement.tokenIdsOrAmounts,
            agreement.beneficiary
        );
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
