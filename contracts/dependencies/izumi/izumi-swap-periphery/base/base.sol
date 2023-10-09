// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../core/interfaces/IiZiSwapFactory.sol";

/// @title Interface for WETH9
interface IWETH9 is IERC20 {
    /// @notice Deposit ether to get wrapped ether
    function deposit() external payable;

    /// @notice Withdraw wrapped ether to get ether
    function withdraw(uint256) external;
}

abstract contract Base {
    /// @notice address of iZiSwapFactory
    address public immutable factory;

    /// @notice address of weth9 token
    address public immutable WETH9;

    modifier checkDeadline(uint256 deadline) {
        require(block.timestamp <= deadline, 'Out of time');
        _;
    }

    receive() external payable {}

    /// @notice Constructor of base.
    /// @param _factory address of iZiSwapFactory
    /// @param _WETH9 address of weth9 token
    constructor(address _factory, address _WETH9) {
        factory = _factory;
        WETH9 = _WETH9;
    }

    /// @notice Make multiple function calls in this contract in a single transaction
    ///     and return the data for each function call, revert if any function call fails
    /// @param data The encoded function data for each function call
    /// @return results result of each function call
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);

            if (!success) {
                if (result.length < 68) revert();
                assembly {
                    result := add(result, 0x04)
                }
                revert(abi.decode(result, (string)));
            }

            results[i] = result;
        }
    }

    /// @notice Transfer tokens from the targeted address to the given destination
    /// @notice Errors with 'STF' if transfer fails
    /// @param token The contract address of the token to be transferred
    /// @param from The originating address from which the tokens will be transferred
    /// @param to The destination address of the transfer
    /// @param value The amount to be transferred
    function safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'STF');
    }

    /// @notice Transfer tokens from msg.sender to a recipient
    /// @dev Errors with ST if transfer fails
    /// @param token The contract address of the token which will be transferred
    /// @param to The recipient of the transfer
    /// @param value The value of the transfer
    function safeTransfer(
        address token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'ST');
    }

    /// @notice Approve the stipulated contract to spend the given allowance in the given token
    /// @dev Errors with 'SA' if transfer fails
    /// @param token The contract address of the token to be approved
    /// @param to The target of the approval
    /// @param value The amount of the given token the target will be allowed to spend
    function safeApprove(
        address token,
        address to,
        uint256 value
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.approve.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'SA');
    }

    /// @notice Transfer ETH to the recipient address
    /// @dev Fails with `STE`
    /// @param to The destination of the transfer
    /// @param value The value to be transferred
    function safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, 'STE');
    }

    /// @notice Withdraw all weth9 token of this contract and send the withdrawed eth to recipient
    ///    usually used in multicall when mint/swap/update limitorder with eth
    ///    normally this contract has no any erc20 token or eth after or before a transaction
    ///    we donot need to worry that some one can steal eth from this contract
    /// @param minAmount The minimum amount of WETH9 to withdraw
    /// @param recipient The address to receive all withdrawed eth from this contract
    function unwrapWETH9(uint256 minAmount, address recipient) external payable {
        uint256 all = IWETH9(WETH9).balanceOf(address(this));
        require(all >= minAmount, 'WETH9 Not Enough');

        if (all > 0) {
            IWETH9(WETH9).withdraw(all);
            safeTransferETH(recipient, all);
        }
    }

    /// @notice Send all balance of specified token in this contract to recipient
    ///    usually used in multicall when mint/swap/update limitorder with eth
    ///    normally this contract has no any erc20 token or eth after or before a transaction
    ///    we donot need to worry that some one can steal some token from this contract
    /// @param token address of the token
    /// @param minAmount balance should >= minAmount
    /// @param recipient the address to receive specified token from this contract
    function sweepToken(
        address token,
        uint256 minAmount,
        address recipient
    ) external payable {
        uint256 all = IERC20(token).balanceOf(address(this));
        require(all >= minAmount, 'WETH9 Not Enough');

        if (all > 0) {
            safeTransfer(token, recipient, all);
        }
    }

    /// @notice Send all balance of eth in this contract to msg.sender
    ///    usually used in multicall when mint/swap/update limitorder with eth
    ///    normally this contract has no any erc20 token or eth after or before a transaction
    ///    we donot need to worry that some one can steal some token from this contract
    function refundETH() external payable {
        if (address(this).balance > 0) safeTransferETH(msg.sender, address(this).balance);
    }

    /// @param token The token to pay
    /// @param payer The entity that must pay
    /// @param recipient The entity that will receive payment
    /// @param value The amount to pay
    function pay(
        address token,
        address payer,
        address recipient,
        uint256 value
    ) internal {
        if (token == WETH9 && address(this).balance >= value) {
            // pay with WETH9
            IWETH9(WETH9).deposit{value: value}(); // wrap only what is needed to pay
            IWETH9(WETH9).transfer(recipient, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            safeTransfer(token, recipient, value);
        } else {
            // pull payment
            safeTransferFrom(token, payer, recipient, value);
        }
    }

    /// @notice Query pool address from factory by (tokenX, tokenY, fee).
    /// @param tokenX tokenX of swap pool
    /// @param tokenY tokenY of swap pool
    /// @param fee fee amount of swap pool
    function pool(address tokenX, address tokenY, uint24 fee) public view returns(address) {
        return IiZiSwapFactory(factory).pool(tokenX, tokenY, fee);
    }
    function verify(address tokenX, address tokenY, uint24 fee) internal view {
        require (msg.sender == pool(tokenX, tokenY, fee), "sp");
    }
}