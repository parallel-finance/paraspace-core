// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IVaultApeStaking.sol";
import "./IVaultEarlyAccess.sol";
import "./IVaultCommon.sol";
import "./IVaultParaX.sol";
import "../../interfaces/IParaProxyInterfaces.sol";

interface IVault is
    IVaultApeStaking,
    IVaultEarlyAccess,
    IVaultCommon,
    IVaultParaX,
    IParaProxyInterfaces
{}
