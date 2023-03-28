// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IInstantWithdrawNFT {
    /**
     * @dev Emitted during rescueETH()
     * @param to The address of the recipient
     * @param amount The amount being rescued
     **/
    event RescueETH(address indexed to, uint256 amount);
    /**
     * @dev Emitted during rescueERC20()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param amount The amount being rescued
     **/
    event RescueERC20(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    /**
     * @dev Emitted during rescueERC721()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param ids The ids of the tokens being rescued
     **/
    event RescueERC721(
        address indexed token,
        address indexed to,
        uint256[] ids
    );

    /**
     * @dev Emitted when new tokens are minted.
     * @param to The address of the recipient receiving the minted tokens.
     * @param tokenId The ID of the token being minted.
     * @param amount The amount of tokens being minted.
     **/
    event Mint(address indexed to, uint256 indexed tokenId, uint256 amount);

    /**
     * @dev Emitted when tokens are burned.
     * @param from The address of the token owner burning the tokens.
     * @param tokenId The ID of the token being burned.
     * @param amount The amount of tokens being burned.
     **/
    event Burn(address indexed from, uint256 indexed tokenId, uint256 amount);

    /**
     * @dev Enum for defining staking provider options.
     */
    enum StakingProvider {
        Validator,
        Lido,
        RocketPool,
        Coinbase
    }

    /**
     * @dev Struct defining information about a ETH Withdrawal bond token.
     * @param provider The entity which requested minting ETH withdrawal bond token.
     * @param balance The current balance of the validator which includes principle + rewards.
     * @param withdrawableTime The earliest point in time at which the ETH can be withdrawn.
     */
    struct TokenInfo {
        StakingProvider provider;
        uint256 balance;
        uint256 withdrawableTime;
    }

    /**
     * @dev Mint function creates a new ETH withdrawal bond token with the details provided.
     * @param provider The entity which requested minting ETH withdrawal bond token.
     * @param balance The current balance of the validator which includes principle + rewards.
     * @param recipient The address of the recipient receiving the minted tokens.
     * @param withdrawableTime The earliest point in time at which the ETH can be withdrawn.
     * @return The ID of the newly minted token.
     */
    function mint(
        StakingProvider provider,
        uint256 balance,
        address recipient,
        uint256 withdrawableTime
    ) external returns (uint256);

    /**
     * @dev Burn function destroys an existing ETH withdrawn bond token with the specified tokenId and burns a specified amount of tokens from it.
     * @param tokenId The ID of the token being burned.
     * @param recipient The address of the recipient receiving the burned tokens.
     * @param shares The shares of tokens to be burned.
     */
    function burn(
        uint256 tokenId,
        address recipient,
        uint256 shares
    ) external;

    /**
     * @dev Calculates the present value and discount rate of provided ETH withdrawal tokens.
     * @param tokenId The tokenId.
     * @param shares The shares of tokens.
     * @param borrowRate The current borrow rate.
     * @return price The present value of the provided tokens.
     * @return discountRate The discount rate used to calculate it.
     * @notice The discount rate is calculated based on the borrow rate and other market factors, so it may fluctuate over time.
     */
    function getPresentValueAndDiscountRate(
        uint256 tokenId,
        uint256 shares,
        uint256 borrowRate
    ) external view returns (uint256 price, uint256 discountRate);

    /**
     * @dev Calculates the present value of provided ETH withdrawal tokens.
     * @param tokenId The tokenId.
     * @param shares The shares of tokens.
     * @param discountRate The discount rate to use in the calculation.
     * @return price The present value of the provided tokens.
     */
    function getPresentValueByDiscountRate(
        uint256 tokenId,
        uint256 shares,
        uint256 discountRate
    ) external view returns (uint256 price);

    /**
     * @dev Sets the address of a new strategy contract for a given staking provider.
     * @param provider The staking provider.
     * @param strategy The address of the new strategy contract.
     * @notice This function requires admin privileges and should only be called by authorized users.
     */
    function setProviderStrategyAddress(
        StakingProvider provider,
        address strategy
    ) external;

    /**

    @dev Returns the metadata of the token with the given ID.
    @param tokenId The ID of the token to retrieve metadata for.
    @return TokenInfo struct containing the metadata of the token.
    */
    function getTokenInfo(uint256 tokenId)
        external
        view
        returns (TokenInfo memory);
}
