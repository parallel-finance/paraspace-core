// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.10;

/**
 * @title IAtomicCollateralizableERC721
 * @author Parallel
 * @notice Defines the basic interface for an AtomicCollateralizableERC721.
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
     * @dev get the token balance of a specific user
     */
    function balancesOf(address user)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    /**
     * @dev get the atomic token id of a specific user of specific index
     */
    function atomicTokenOfOwnerByIndex(address user, uint256 index)
        external
        view
        returns (uint256);

    /**
     * @dev check if specific token is atomic (has multiplier)
     */
    function isAtomicToken(uint256 tokenId) external view returns (bool);

    /**
     * @dev check if specific token has atomic pricing (has atomic oracle wrapper)
     */
    function isAtomicPricing() external view returns (bool);

    /**
     * @dev get the trait multiplier of specific token
     */
    function getTraitMultiplier(uint256 tokenId)
        external
        view
        returns (uint256);
}
