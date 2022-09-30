// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

import {OwnableUpgradeable} from "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import {IPool} from "../interfaces/IPool.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

// ERC721 imports
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC721Receiver} from "../dependencies/openzeppelin/contracts/IERC721Receiver.sol";

contract UniswapV3Gateway is IERC721Receiver, OwnableUpgradeable {
    address internal immutable UNISWAP_V3_POSITION_MANAGER;
    IPool internal immutable POOL;

    /**
     * @dev Sets the MoonBirds collection and pool address. Infinite approves pool.
     * @param _uniswap Address of the MoonBirds contract
     * @param _pool Address of the proxy pool of this contract
     **/
    constructor(address _uniswap, address _pool) {
        POOL = IPool(_pool);
        UNISWAP_V3_POSITION_MANAGER = _uniswap;
    }

    function initialize() external initializer {
        __Ownable_init();

        IERC721(UNISWAP_V3_POSITION_MANAGER).setApprovalForAll(
            address(POOL),
            true
        );
    }

    /**
     * @dev supplies (deposits) UniswapV3 into the reserve. A corresponding amount of the overlying asset (xTokens)
     * is minted.
     * @param tokenIds tokens to supply to gateway
     * @param onBehalfOf address of the user who will receive the xTokens representing the supply
     **/
    function supplyUniswapV3(
        DataTypes.ERC721SupplyParams[] calldata tokenIds,
        address onBehalfOf
    ) external {
        for (uint256 index = 0; index < tokenIds.length; index++) {
            IERC721(UNISWAP_V3_POSITION_MANAGER).safeTransferFrom(
                msg.sender,
                address(
                    POOL
                        .getReserveData(UNISWAP_V3_POSITION_MANAGER)
                        .xTokenAddress
                ),
                tokenIds[index].tokenId
            );
        }

        POOL.supplyERC721FromNToken(
            UNISWAP_V3_POSITION_MANAGER,
            tokenIds,
            onBehalfOf
        );
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
        IERC721(UNISWAP_V3_POSITION_MANAGER).safeTransferFrom(
            from,
            to,
            tokenId
        );
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
