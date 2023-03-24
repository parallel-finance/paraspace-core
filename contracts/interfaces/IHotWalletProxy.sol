pragma solidity 0.8.10;

interface IHotWalletProxy {
    function setHotWallet(
        address hotWalletAddress,
        uint256 expirationTimestamp,
        bool lockHotWalletAddress
    ) external;
}
