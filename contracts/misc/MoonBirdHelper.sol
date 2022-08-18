// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IMoonBird} from "../dependencies/erc721-collections/IMoonBird.sol";
import {DataTypes} from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title MoonBird Helper Library
 *
 * @notice this library has helper function to interact with MonnBird contract
 */
library MoonBirdHelper {
    function getNestingTokens(address asset, uint256[] calldata tokenIds)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory nestingTokens = new uint256[](tokenIds.length);
        uint256 nestingTokensIndex = 0;

        for (uint256 index = 0; index < tokenIds.length; index++) {
            (bool isNesting, , ) = IMoonBird(asset).nestingPeriod(
                tokenIds[index]
            );
            if (isNesting) {
                nestingTokens[nestingTokensIndex] = tokenIds[index];
                nestingTokensIndex++;
            }
        }

        assembly {
            mstore(
                nestingTokens,
                sub(
                    mload(nestingTokens),
                    sub(tokenIds.length, nestingTokensIndex)
                )
            )
        }
        return nestingTokens;
    }

    function getNestingTokens(
        address asset,
        DataTypes.ERC721SupplyParams[] calldata tokenIds
    ) external view returns (uint256[] memory) {
        uint256[] memory nestingTokens = new uint256[](tokenIds.length);
        uint256 nestingTokensIndex = 0;

        for (uint256 index = 0; index < tokenIds.length; index++) {
            (bool isNesting, , ) = IMoonBird(asset).nestingPeriod(
                tokenIds[index].tokenId
            );
            if (isNesting) {
                nestingTokens[nestingTokensIndex] = tokenIds[index].tokenId;
                nestingTokensIndex++;
            }
        }

        assembly {
            mstore(
                nestingTokens,
                sub(
                    mload(nestingTokens),
                    sub(tokenIds.length, nestingTokensIndex)
                )
            )
        }

        return nestingTokens;
    }
}
