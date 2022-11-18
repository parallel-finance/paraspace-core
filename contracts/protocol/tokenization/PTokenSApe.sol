// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPool} from "../../interfaces/IPool.sol";
import {PToken} from "./PToken.sol";
import {NTokenApeStaking} from "./NTokenApeStaking.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {XTokenType} from "../../interfaces/IXTokenType.sol";
import {ApeCoinStaking} from "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IPToken} from "../../interfaces/IPToken.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IScaledBalanceToken} from "../../interfaces/IScaledBalanceToken.sol";


/**
 * @title sApe PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract PTokenSApe is PToken {
    using WadRayMath for uint256;

    NTokenApeStaking immutable nBAYC;
    NTokenApeStaking immutable nMAYC;
    IScaledBalanceToken immutable debtAPE;

    ApeCoinStaking immutable apeStaking; 

    constructor(IPool _pool, address _nBAYC, address _nMAYC, address _debtAPE, address _apeStaking) PToken(_pool) {
        nBAYC = NTokenApeStaking(_nBAYC);
        nMAYC = NTokenApeStaking(_nMAYC);
        debtAPE = IScaledBalanceToken(_debtAPE);
        apeStaking = ApeCoinStaking(_apeStaking);
    }
    
    /**
     * @dev Calculates the balance of the user
     * @param user The user whose balance is calculated
     * @return The balance of the user
     **/
    function balanceOf(address user) public view override returns (uint256) {
        uint256 userAPEDebt = debtAPE.scaledBalanceOf(user);
        uint256 totalStakedAPE = nBAYC.getUserStakedBalance(user) + nMAYC.getUserStakedBalance(user);

        return totalStakedAPE >= userAPEDebt ? userAPEDebt : totalStakedAPE;
    }

    function scaledBalanceOf(address user)
        public
        view
        override
        returns (uint256)
    {
        balanceOf(user);
    }

    function scaledTotalSupply()
        public
        pure
        virtual
        override
        returns (uint256)
    {
        return totalSupply();
    }

    
    /// @inheritdoc IERC20
    function totalSupply() public pure override returns (uint256) {
        return 0;
    }

    
    /// @inheritdoc IPToken
    //solhint-disable-next-line no-unused-vars
    function mint(
        address caller,
        address onBehalfOf,
        uint256 amount,
        uint256 index
    ) external virtual override onlyPool returns (bool) {
        revert("not allowed");
    }

    /// @inheritdoc IPToken
    //solhint-disable-next-line no-unused-vars
    function burn(
        address from,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 index
    ) external virtual override onlyPool {
        revert("not allowed");
    }


    /**
     * @notice Overrides the parent _transfer to force validated transfer() and transferFrom()
     * @param from The source address
     * @param to The destination address
     * @param amount The amount getting transferred
     **/
     //solhint-disable-next-line no-unused-vars
    function _transfer(
        address from,
        address to,
        uint128 amount
    ) internal override virtual {
        revert("not allowed");
    }


    function getXTokenType()
        external
        pure
        virtual
        override
        returns (XTokenType)
    {
        return XTokenType.PTokenSApe;
    }
}
