// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.10;

import {BDaoDataTypes} from "../libraries/types/BDaoDataTypes.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {NftLogic} from "../libraries/logic/NftLogic.sol";
import {ILendPoolAddressesProvider} from "../interfaces/ILendPoolAddressesProvider.sol";

contract LendPoolStorage {
  using ReserveLogic for BDaoDataTypes.ReserveData;
  using NftLogic for BDaoDataTypes.NftData;

  ILendPoolAddressesProvider internal _addressesProvider;

  mapping(address => BDaoDataTypes.ReserveData) internal _reserves;
  mapping(address => BDaoDataTypes.NftData) internal _nfts;

  mapping(uint256 => address) internal _reservesList;
  uint256 internal _reservesCount;

  mapping(uint256 => address) internal _nftsList;
  uint256 internal _nftsCount;

  bool internal _paused;

  uint256 internal _maxNumberOfReserves;
  uint256 internal _maxNumberOfNfts;

  // !!! Never add new variable at here, because this contract is inherited by LendPool !!!
  // !!! Add new variable at LendPool directly !!!
}
