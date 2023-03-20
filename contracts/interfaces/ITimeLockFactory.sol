pragma solidity ^0.8.0;

interface ITimeLockFactory {
    function createTimeLock(address user, address admin)
        external
        returns (address);

    // function getTimeLock(address user) external view returns (address);
}
