// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../dependencies/openzeppelin/contracts/IERC1155.sol";
import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";
import {EnumerableSet} from "../dependencies/openzeppelin/contracts/EnumerableSet.sol";

contract TimeLockFactory is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(address => address) public userTimeLocks;
    EnumerableSet.AddressSet private _timeLocks;

    function createTimeLock(address user, address admin)
        public
        onlyOwner
        returns (address)
    {
        require(
            userTimeLocks[user] == address(0),
            "User already has a TimeLock"
        );
        TimeLock timeLock = new TimeLock(user, admin);
        userTimeLocks[user] = address(timeLock);
        _timeLocks.add(address(timeLock));
        return address(timeLock);
    }

    function getTimeLocks() public view returns (address[] memory) {
        uint256 length = _timeLocks.length();
        address[] memory timeLockList = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            timeLockList[i] = _timeLocks.at(i);
        }
        return timeLockList;
    }
}

contract TimeLock is Ownable {
    enum TokenType {
        ERC20,
        ERC721,
        ERC1155
    }

    struct Agreement {
        TokenType tokenType;
        address token;
        uint256[] tokenIds;
        uint256[] amounts;
        address beneficiary;
        uint256 releaseTime;
        bool isFrozen;
    }

    mapping(uint256 => Agreement) public agreements;
    uint256 public agreementCount;
    bool public frozen;
    address public admin;

    modifier onlyUser() {
        require(msg.sender == user, "Not allowed");
        _;
    }

    constructor(address _user, address _admin) {
        transferOwnership(_admin);
        user = _user;
    }

    function createAgreement(
        TokenType tokenType,
        address token,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        address beneficiary,
        uint256 releaseTime
    ) public onlyOwner returns (uint256) {
        uint256 agreementId = agreementCount++;
        agreements[agreementId] = Agreement({
            tokenType: tokenType,
            token: token,
            tokenIds: tokenIds,
            amounts: amounts,
            beneficiary: beneficiary,
            releaseTime: releaseTime,
            isFrozen: false
        });

        if (tokenType == TokenType.ERC20) {
            IERC20(token).transferFrom(msg.sender, address(this), amounts[0]);
        } else if (tokenType == TokenType.ERC721) {
            IERC721 erc721 = IERC721(token);
            for (uint256 i = 0; i < tokenIds.length; i++) {
                erc721.transferFrom(msg.sender, address(this), tokenIds[i]);
            }
        } else if (tokenType == TokenType.ERC1155) {
            IERC1155(token).safeBatchTransferFrom(
                msg.sender,
                address(this),
                tokenIds,
                amounts,
                ""
            );
        }

        return agreementId;
    }

    function claim(uint256 agreementId) external onlyUser {
        require(!frozen, "TimeLock is frozen");

        Agreement storage agreement = agreements[agreementId];
        require(msg.sender == agreement.beneficiary, "Not beneficiary");
        require(
            block.timestamp >= agreement.releaseTime,
            "Release time not reached"
        );
        require(!agreement.isFrozen, "Agreement frozen");

        if (agreement.tokenType == TokenType.ERC20) {
            IERC20(agreement.token).transfer(
                agreement.beneficiary,
                agreement.amounts[0]
            );
        } else if (agreement.tokenType == TokenType.ERC721) {
            IERC721 erc721 = IERC721(agreement.token);
            for (uint256 i = 0; i < agreement.tokenIds.length; i++) {
                erc721.transferFrom(
                    address(this),
                    agreement.beneficiary,
                    agreement.tokenIds[i]
                );
            }
        } else if (agreement.tokenType == TokenType.ERC1155) {
            IERC1155(agreement.token).safeBatchTransferFrom(
                address(this),
                agreement.beneficiary,
                agreement.tokenIds,
                agreement.amounts,
                ""
            );
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
        frozen = true;
    }
}
