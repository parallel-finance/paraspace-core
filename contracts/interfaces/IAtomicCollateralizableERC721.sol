// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

/**
 * @title IAtomicCollateralizableERC721
 * @author Parallel
 * @notice Defines the basic interface for an CollateralizableERC721.
 **/
interface IAtomicCollateralizableERC721 {
    /**
     * @dev get the collateralized atomic token balance of a specific user
     */
    function atomicCollateralizedBalanceOf(address user)
        external
        view
        returns (uint256);

    /**
     * @dev get the atomic token balance of a specific user
     */
    function atomicBalanceOf(address user) external view returns (uint256);

    /**
     * @dev check if specific token is atomic (has multiplier)
     */
    function isAtomicToken(uint256 tokenId) external view returns (bool);

    /**
     * @dev get the trait multiplier of specific token
     */
    function getTraitMultiplier(uint256 tokenId)
        external
        view
        returns (uint256);
}
