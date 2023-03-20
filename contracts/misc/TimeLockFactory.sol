// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../dependencies/openzeppelin/contracts/IERC1155.sol";
import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import {ITimeLock} from "../interfaces/ITimeLock.sol";
import {IPool} from "../interfaces/IPool.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

contract TimeLock is ITimeLock, Ownable {
    struct Agreement {
        DataTypes.AssetType assetType;
        bool isFrozen;
        address token;
        address beneficiary;
        uint256 releaseTime; //TODO change to smaller unit
        uint256[] tokenIdsOrAmounts;
    }

    mapping(uint256 => Agreement) public agreements;
    uint256 public agreementCount;
    bool public frozen;
    IPool private immutable POOL;

    modifier onlyXToken(address token) {
        // TODO add message
        require(msg.sender == POOL.getReserveXToken(token));
        _;
    }

    constructor(address _admin, IPool pool) {
        transferOwnership(_admin);
        POOL = pool;
    }

    function createAgreement(
        DataTypes.AssetType assetType,
        address token,
        uint256[] memory tokenIdsOrAmounts,
        address beneficiary,
        uint256 releaseTime
    ) public onlyXToken(token) returns (uint256) {
        uint256 agreementId = agreementCount++;
        agreements[agreementId] = Agreement({
            assetType: assetType,
            token: token,
            tokenIdsOrAmounts: tokenIdsOrAmounts,
            beneficiary: beneficiary,
            releaseTime: releaseTime,
            isFrozen: false
        });

        return agreementId;
    }

    function claim(uint256 agreementId) external {
        require(!frozen, "TimeLock is frozen");

        Agreement storage agreement = agreements[agreementId];
        require(msg.sender == agreement.beneficiary, "Not beneficiary");
        require(
            block.timestamp >= agreement.releaseTime,
            "Release time not reached"
        );
        require(!agreement.isFrozen, "Agreement frozen");

        if (agreement.assetType == DataTypes.AssetType.ERC20) {
            IERC20(agreement.token).transfer(
                agreement.beneficiary,
                agreement.tokenIdsOrAmounts[0]
            );
        } else if (agreement.assetType == DataTypes.AssetType.ERC721) {
            IERC721 erc721 = IERC721(agreement.token);
            for (uint256 i = 0; i < agreement.tokenIdsOrAmounts.length; i++) {
                erc721.transferFrom(
                    address(this),
                    agreement.beneficiary,
                    agreement.tokenIdsOrAmounts[i]
                );
            }
        }

        delete agreements[agreementId];
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
