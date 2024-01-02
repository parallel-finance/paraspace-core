// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVaultEarlyAccess {
    enum StrategyType {
        NONE,
        NORMAL, //no yield or AAVE
        CAPE,
        APESTAKING
    }

    function updateAccessListStatus(
        address[] calldata assets,
        bool[] calldata statuses
    ) external;

    function setCollectionStrategy(
        address[] calldata assets,
        StrategyType[] calldata strategies
    ) external;

    function addETHCollection(address asset) external;

    function ethCollection() external view returns (address[] memory);

    function isInETHList(address asset) external view returns (bool);

    function depositETHCollection(
        address asset,
        uint256 amount
    ) external payable;

    function totalETHValue() external view returns (uint256);

    function totalETHShare() external view returns (uint256);

    function addUSDCollection(address asset) external;

    function usdCollection() external view returns (address[] memory);

    function isInUSDList(address asset) external view returns (bool);

    function depositUSDCollection(address asset, uint256 amount) external;

    function totalUSDValue() external view returns (uint256);

    function totalUSDShare() external view returns (uint256);

    function cApeCollection() external view returns (address[] memory);

    function depositCApeCollection(address asset, uint256 amount) external;

    function depositERC20(address asset, uint256 amount) external;

    function depositERC721(address asset, uint32[] calldata tokenIds) external;
}
