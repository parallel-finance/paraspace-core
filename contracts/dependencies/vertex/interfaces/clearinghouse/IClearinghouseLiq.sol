// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./IClearinghouseState.sol";
import "./IClearinghouseEventEmitter.sol";
import "../engine/IProductEngine.sol";
import "../IEndpoint.sol";
import "../IEndpointGated.sol";

interface IClearinghouseLiq is
    IClearinghouseState,
    IClearinghouseEventEmitter,
    IEndpointGated
{
    function liquidateSubaccountImpl(IEndpoint.LiquidateSubaccount calldata tx)
        external;
}
