// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IVaultApeStaking.sol";
import "./IVaultTemplate.sol";
import "../../interfaces/IParaProxyInterfaces.sol";

interface IVault is IVaultApeStaking, IVaultTemplate, IParaProxyInterfaces {}
