// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.10;

/**
    @note: interface to implement voting delegation that interactes with deelgate contracts such as snapshot delegate registry
 */
interface IVoteDelegator {
    function setVotingDelegate(
        address delegateContract,
        bytes32 spaceId,
        address delegate
    ) external;

    function clearVotingDelegate(
        address delegateContract,
        bytes32 spaceId
    ) external;

    function getDelegate(
        address delegateContract,
        bytes32 spaceId
    ) external view returns (address);
}
