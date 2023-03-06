// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import {IVoteDelegator} from "./interfaces/IVoteDelegator.sol";
import {IDelegation} from "./interfaces/IDelegation.sol";

contract VoteDelegator is OwnableUpgradeable, IVoteDelegator {
    function setVotingDelegate(
        address delegateContract,
        bytes32 spaceId,
        address delegate
    ) external onlyOwner {
        IDelegation(delegateContract).setDelegate(spaceId, delegate);
    }

    function clearVotingDelegate(address delegateContract, bytes32 spaceId)
        external
        onlyOwner
    {
        IDelegation(delegateContract).clearDelegate(spaceId);
    }

    function getDelegate(address delegateContract, bytes32 spaceId)
        external
        view
        returns (address)
    {
        return IDelegation(delegateContract).delegation(address(this), spaceId);
    }
}
