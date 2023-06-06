
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../openzeppelin/contracts/Address.sol";
import "../openzeppelin/contracts/Ownable.sol";
import './interfaces/IStakefishValidatorOperator.sol';
import './interfaces/IStakefishNFTManager.sol';

contract StakefishValidatorOperator is IStakefishValidatorOperator, Ownable {

    address public immutable override nftManager;

    constructor(address _nftManager) {
        nftManager = _nftManager;
    }

    function multicall(uint256[] calldata tokenIds, bytes[] calldata data) external override onlyOwner returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            address validatorAddr = IStakefishNFTManager(nftManager).validatorForTokenId(tokenIds[i]);
            require(validatorAddr != address(0), "multicall: address is null");
            results[i] = Address.functionCall(validatorAddr, data[i]);
        }
        return results;
    }
}
