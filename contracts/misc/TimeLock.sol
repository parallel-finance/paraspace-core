// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IERC721Receiver} from "../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import "../dependencies/openzeppelin/upgradeability/ReentrancyGuardUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "../dependencies/openzeppelin/upgradeability/ReentrancyGuardUpgradeable.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import {ITimeLock} from "../interfaces/ITimeLock.sol";
import {IRebasingPToken} from "../interfaces/IRebasingPToken.sol";
import {IMoonBird} from "../dependencies/erc721-collections/IMoonBird.sol";
import {IPoolAddressesProvider} from "../interfaces/IPoolAddressesProvider.sol";
import {IPool} from "../interfaces/IPool.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";
import {GPv2SafeERC20} from "../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {Errors} from "./../protocol/libraries/helpers/Errors.sol";
import {IACLManager} from "../interfaces/IACLManager.sol";
import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";

contract TimeLock is ITimeLock, ReentrancyGuardUpgradeable, IERC721Receiver {
    using GPv2SafeERC20 for IERC20;

    mapping(bytes32 => AgreementStatus) private agreementStatus;
    bool public frozen;

    IPool private immutable POOL;
    IACLManager private immutable ACL_MANAGER;

    modifier onlyXToken(address asset) {
        require(
            msg.sender == POOL.getReserveXToken(asset),
            Errors.CALLER_NOT_XTOKEN
        );
        _;
    }

    modifier onlyEmergencyAdminOrPoolAdmins() {
        require(
            ACL_MANAGER.isEmergencyAdmin(msg.sender) ||
                ACL_MANAGER.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_OR_EMERGENCY_ADMIN
        );
        _;
    }

    modifier onlyPoolAdmin() {
        require(
            ACL_MANAGER.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
        _;
    }

    constructor(IPoolAddressesProvider provider) {
        POOL = IPool(provider.getPool());
        ACL_MANAGER = IACLManager(provider.getACLManager());
    }

    function initialize() public initializer {
        __ReentrancyGuard_init();
    }

    function createAgreement(
        DataTypes.AssetType assetType,
        DataTypes.TimeLockActionType actionType,
        address asset,
        uint256[] calldata tokenIdsOrAmounts,
        address beneficiary,
        uint48 releaseTime
    ) external onlyXToken(asset) returns (Agreement memory) {
        require(beneficiary != address(0), "Beneficiary cant be zero address");
        require(releaseTime > block.timestamp, "Release time not valid");

        Agreement memory agreement = Agreement({
            assetType: assetType,
            actionType: actionType,
            asset: asset,
            tokenIdsOrAmounts: tokenIdsOrAmounts,
            beneficiary: beneficiary,
            releaseTime: releaseTime
        });

        bytes32 agreementHash = _getAgreementHash(agreement);
        require(
            agreementStatus[agreementHash] == AgreementStatus.NoExist,
            "Agreement already exist"
        );
        agreementStatus[agreementHash] = AgreementStatus.Active;

        emit AgreementCreated(
            agreementHash,
            assetType,
            actionType,
            asset,
            tokenIdsOrAmounts,
            beneficiary,
            releaseTime
        );

        return agreement;
    }

    function _getAgreementHash(Agreement memory agreement)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(agreement));
    }

    function _validateAgreement(Agreement memory agreement)
        internal
        view
        returns (bytes32)
    {
        require(msg.sender == agreement.beneficiary, "Not beneficiary");
        require(
            block.timestamp >= agreement.releaseTime,
            "Release time not reached"
        );
        bytes32 agreementHash = _getAgreementHash(agreement);
        require(
            agreementStatus[agreementHash] == AgreementStatus.Active,
            "Agreement not exist or frozen"
        );
        return agreementHash;
    }

    function claim(Agreement[] calldata agreements) external nonReentrant {
        require(!frozen, "TimeLock is frozen");

        for (uint256 index = 0; index < agreements.length; index++) {
            Agreement memory agreement = agreements[index];
            bytes32 agreementHash = _validateAgreement(agreement);

            if (agreement.assetType == DataTypes.AssetType.ERC20) {
                if (
                    agreement.actionType ==
                    DataTypes.TimeLockActionType.REBASE_TOKEN_WITHDRAW
                ) {
                    address pToken = POOL.getReserveXToken(agreement.asset);
                    uint256 rebaseIndex = IRebasingPToken(pToken)
                        .lastRebasingIndex();
                    uint256 rebaseAmount = (agreement.tokenIdsOrAmounts[0] *
                        rebaseIndex) / WadRayMath.RAY;
                    IERC20(agreement.asset).safeTransfer(
                        agreement.beneficiary,
                        rebaseAmount
                    );
                } else {
                    IERC20(agreement.asset).safeTransfer(
                        agreement.beneficiary,
                        agreement.tokenIdsOrAmounts[0]
                    );
                }
            } else if (agreement.assetType == DataTypes.AssetType.ERC721) {
                if (
                    agreement.actionType ==
                    DataTypes.TimeLockActionType.MOONBIRD_WITHDRAW
                ) {
                    IMoonBird moonBirds = IMoonBird(agreement.asset);
                    for (
                        uint256 i = 0;
                        i < agreement.tokenIdsOrAmounts.length;
                        i++
                    ) {
                        moonBirds.safeTransferWhileNesting(
                            address(this),
                            agreement.beneficiary,
                            agreement.tokenIdsOrAmounts[i]
                        );
                    }
                } else {
                    IERC721 erc721 = IERC721(agreement.asset);
                    for (
                        uint256 i = 0;
                        i < agreement.tokenIdsOrAmounts.length;
                        i++
                    ) {
                        erc721.safeTransferFrom(
                            address(this),
                            agreement.beneficiary,
                            agreement.tokenIdsOrAmounts[i]
                        );
                    }
                }
            }

            delete agreementStatus[agreementHash];

            emit AgreementClaimed(
                agreementHash,
                agreement.assetType,
                agreement.actionType,
                agreement.asset,
                agreement.tokenIdsOrAmounts,
                agreement.beneficiary
            );
        }
    }

    function freezeAgreement(bytes32 agreementId)
        external
        onlyEmergencyAdminOrPoolAdmins
    {
        require(agreementStatus[agreementId] == AgreementStatus.Active);
        agreementStatus[agreementId] = AgreementStatus.Frozen;
        emit AgreementFrozen(agreementId, true);
    }

    function unfreezeAgreement(bytes32 agreementId) external onlyPoolAdmin {
        require(agreementStatus[agreementId] == AgreementStatus.Frozen);
        agreementStatus[agreementId] = AgreementStatus.Active;
        emit AgreementFrozen(agreementId, false);
    }

    function freezeAllAgreements() external onlyEmergencyAdminOrPoolAdmins {
        frozen = true;
        emit TimeLockFrozen(true);
    }

    function unfreezeAllAgreements() external onlyPoolAdmin {
        frozen = false;
        emit TimeLockFrozen(false);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
