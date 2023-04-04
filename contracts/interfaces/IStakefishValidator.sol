// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

/// @title The interface for StakefishValidator
/// @notice Defines implementation of the wallet (deposit, withdraw, collect fees)
interface IStakefishValidator {
    enum State {
        PreDeposit,
        PostDeposit,
        Active,
        ExitRequested,
        Exited,
        Withdrawn,
        Burnable
    }

    /// @dev aligns into 32 byte
    struct StateChange {
        State state; // 1 byte
        bytes15 userData; // 15 byte (future use)
        uint128 changedAt; // 16 byte
    }

    function validatorIndex() external view returns (uint256);

    function pubkey() external view returns (bytes memory);

    /// @notice Inspect state of the change
    function lastStateChange() external view returns (StateChange memory);

    /// @notice NFT Owner requests a validator exit
    /// State.Running -> State.ExitRequested
    /// emit ValidatorExitRequest(pubkey)
    function requestExit() external;

    /// @notice user withdraw balance and charge a fee
    function withdraw() external;

    /// @notice get pending fee pool rewards
    function pendingFeePoolReward() external view returns (uint256, uint256);

    /// @notice claim fee pool and forward to nft owner
    function claimFeePool(uint256 amountRequested) external;

    /// @notice get early access discount
    function earlyAccessDiscount() external view returns (uint256);

    /// @notice volume discount
    function volumeDiscount() external view returns (uint256);

    /// @notice calculates effect fee after discounts
    function effectiveFee() external view returns (uint256);

    function getProtocolFee() external view returns (uint256);

    function withdrawnBalance() external view returns (uint256);

    /// @notice computes commission, useful for showing on UI
    function computeCommission(uint256 amount) external view returns (uint256);

    function render() external view returns (string memory);
}
