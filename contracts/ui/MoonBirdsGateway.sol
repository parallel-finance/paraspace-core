// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {OwnableUpgradeable} from "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import {IPool} from "../interfaces/IPool.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

// ERC721 imports
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC721Receiver} from "../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IMoonBird} from "../dependencies/erc721-collections/IMoonBird.sol";
import {MoonBirdHelper} from "../misc/MoonBirdHelper.sol";

contract MoonBirdsGateway is IERC721Receiver, OwnableUpgradeable {
    address internal immutable MOONBIRDS;
    IPool internal immutable POOL;

    /**
     * @dev Sets the MoonBirds collection and pool address. Infinite approves pool.
     * @param _moonbirds Address of the MoonBirds contract
     * @param _pool Address of the proxy pool of this contract
     **/
    constructor(address _moonbirds, address _pool) {
        POOL = IPool(_pool);
        MOONBIRDS = _moonbirds;
    }

    function initialize() external initializer {
        __Ownable_init();

        IERC721(MOONBIRDS).setApprovalForAll(address(POOL), true);
    }

    /**
     * @dev supplies (deposits) WPunk into the reserve, using native Punk. A corresponding amount of the overlying asset (xTokens)
     * is minted.
     * @param tokenIds tokens to supply to gateway
     * @param onBehalfOf address of the user who will receive the xTokens representing the supply
     * @param referralCode integrators are assigned a referral code and can potentially receive rewards.
     **/
    function supplyMoonBirds(
        DataTypes.ERC721SupplyParams[] calldata tokenIds,
        address onBehalfOf,
        uint16 referralCode
    ) external {
        uint256[] memory nestingTokens = MoonBirdHelper.getNestingTokens(
            MOONBIRDS,
            tokenIds
        );

        for (uint256 index = 0; index < nestingTokens.length; index++) {
            IERC721(MOONBIRDS).approve(address(this), nestingTokens[index]);
        }

        if (nestingTokens.length > 0) {
            IMoonBird(MOONBIRDS).toggleNesting(nestingTokens);
        }

        for (uint256 index = 0; index < tokenIds.length; index++) {
            IERC721(MOONBIRDS).safeTransferFrom(
                msg.sender,
                address(this),
                tokenIds[index].tokenId
            );
        }

        POOL.supplyERC721(MOONBIRDS, tokenIds, onBehalfOf, referralCode);
    }

    /**
     * @dev transfer ERC721 from the utility contract, for ERC721 recovery in case of stuck tokens due
     * direct transfers to the contract address.
     * @param from token owner of the transfer
     * @param to recipient of the transfer
     * @param tokenId tokenId to send
     */
    function emergencyTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) external onlyOwner {
        IERC721(MOONBIRDS).safeTransferFrom(from, to, tokenId);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
