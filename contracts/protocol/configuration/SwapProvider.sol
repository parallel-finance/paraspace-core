// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../../interfaces/ISwapProvider.sol";
import {Ownable} from "../../dependencies/openzeppelin/contracts/Ownable.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";

contract SwapProvider is Ownable, ISwapProvider {
    mapping(bytes32 => DataTypes.SwapAdapter) private _addresses;

    constructor(address owner) {
        transferOwnership(owner);
    }

    function getSwapAdapter(bytes32 id)
        external
        view
        returns (DataTypes.SwapAdapter memory)
    {
        return _addresses[id];
    }

    function setSwapAdapter(
        bytes32 id,
        DataTypes.SwapAdapter calldata swapAdapter
    ) external onlyOwner {
        _addresses[id] = swapAdapter;
    }
}
