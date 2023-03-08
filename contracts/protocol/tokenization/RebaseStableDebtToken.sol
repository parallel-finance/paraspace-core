// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {MathUtils} from "../libraries/math/MathUtils.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {IStableDebtToken} from "../../interfaces/IStableDebtToken.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {EIP712Base} from "./base/EIP712Base.sol";
import {StableDebtToken} from "./StableDebtToken.sol";
import {IncentivizedERC20} from "./base/IncentivizedERC20.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";

/**
 * @title StableDebtToken
 *
 * @notice Implements a stable debt token to track the borrowing positions of users
 * at stable rate mode
 * @dev Transfer and approve functionalities are disabled since its a non-transferable token
 **/
contract RebaseStableDebtToken is StableDebtToken {
    using WadRayMath for uint256;
    using SafeCast for uint256;

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool) StableDebtToken(pool) {
        //intentionally empty
    }

    /**
     * @return Current rebasing index in RAY
     **/
    function lastRebasingIndex() internal view virtual returns (uint256) {
        // returns 1 RAY by default which makes it identical to StableDebtToken in behaviour
        return WadRayMath.RAY;
    }

    /**
     * @dev Calculates the balance of the user: principal balance + debt interest accrued by the principal
     * @param account The user address whose balance is calculated
     * @return The balance of the user
     **/
    function balanceOf(address account)
        public
        view
        virtual
        override
        returns (uint256)
    {
        uint256 shareBalance = _userState[account].balance;
        if (shareBalance == 0) {
            return 0;
        }
        return
            _calculateBalanceForTimestamp(
                shareBalance,
                lastRebasingIndex(),
                _userState[account].additionalData,
                uint40(block.timestamp),
                _timestamps[account]
            );
    }

    /// @inheritdoc IStableDebtToken
    function mint(
        address user,
        address onBehalfOf,
        uint256 amount,
        uint256 rate
    )
        external
        virtual
        override
        onlyPool
        returns (
            bool,
            uint256,
            uint256
        )
    {
        MintLocalVars memory vars;

        if (user != onBehalfOf) {
            _decreaseBorrowAllowance(onBehalfOf, user, amount);
        }

        uint256 rebaseIndex = lastRebasingIndex();
        (
            ,
            uint256 currentBalance,
            uint256 balanceIncrease
        ) = _calculateBalanceIncrease(onBehalfOf, rebaseIndex);

        vars.currentAvgStableRate = _avgStableRate;
        vars.previousSupply = _calcTotalSupply(
            vars.currentAvgStableRate,
            rebaseIndex
        );
        vars.nextSupply = vars.previousSupply + amount;
        _totalSupply = vars.nextSupply.rayDiv(rebaseIndex);

        vars.amountInRay = amount.wadToRay();

        vars.currentStableRate = _userState[onBehalfOf].additionalData;
        vars.nextStableRate = (vars.currentStableRate.rayMul(
            currentBalance.wadToRay()
        ) + vars.amountInRay.rayMul(rate)).rayDiv(
                (currentBalance + amount).wadToRay()
            );

        _userState[onBehalfOf].additionalData = vars.nextStableRate.toUint128();

        //solium-disable-next-line
        _totalSupplyTimestamp = _timestamps[onBehalfOf] = uint40(
            block.timestamp
        );

        // Calculates the updated average stable rate
        vars.currentAvgStableRate = _avgStableRate = (
            (vars.currentAvgStableRate.rayMul(vars.previousSupply.wadToRay()) +
                rate.rayMul(vars.amountInRay)).rayDiv(
                    vars.nextSupply.wadToRay()
                )
        ).toUint128();

        uint256 amountToMint = amount + balanceIncrease;
        uint256 shareAmountToMint = amountToMint.rayDiv(rebaseIndex);
        uint256 totalShareSupply = vars.previousSupply.rayDiv(rebaseIndex);
        _mint(onBehalfOf, shareAmountToMint, totalShareSupply);

        emit Transfer(address(0), onBehalfOf, amountToMint);
        emit Mint(
            user,
            onBehalfOf,
            amountToMint,
            currentBalance,
            balanceIncrease,
            vars.nextStableRate,
            vars.currentAvgStableRate,
            vars.nextSupply
        );

        return (
            currentBalance == 0,
            vars.nextSupply,
            vars.currentAvgStableRate
        );
    }

    /// @inheritdoc IStableDebtToken
    function burn(address from, uint256 amount)
        external
        virtual
        override
        onlyPool
        returns (uint256, uint256)
    {
        uint256 rebaseIndex = lastRebasingIndex();
        (
            ,
            uint256 currentBalance,
            uint256 balanceIncrease
        ) = _calculateBalanceIncrease(from, rebaseIndex);

        uint256 currentAvgStableRate = uint256(_avgStableRate);
        uint256 previousSupply = _calcTotalSupply(
            currentAvgStableRate,
            rebaseIndex
        );
        uint256 nextAvgStableRate = 0;
        uint256 nextSupply = 0;
        uint256 userStableRate = _userState[from].additionalData;

        // Since the total supply and each single user debt accrue separately,
        // there might be accumulation errors so that the last borrower repaying
        // might actually try to repay more than the available debt supply.
        // In this case we simply set the total supply and the avg stable rate to 0
        if (previousSupply <= amount) {
            _avgStableRate = 0;
            _totalSupply = 0;
        } else {
            nextSupply = previousSupply - amount;
            _totalSupply = nextSupply.rayDiv(rebaseIndex);
            uint256 firstTerm = uint256(currentAvgStableRate).rayMul(
                previousSupply.wadToRay()
            );
            uint256 secondTerm = userStableRate.rayMul(amount.wadToRay());

            // For the same reason described above, when the last user is repaying it might
            // happen that user rate * user balance > avg rate * total supply. In that case,
            // we simply set the avg rate to 0
            if (secondTerm >= firstTerm) {
                nextAvgStableRate = _totalSupply = _avgStableRate = 0;
            } else {
                nextAvgStableRate = _avgStableRate = (
                    (firstTerm - secondTerm).rayDiv(nextSupply.wadToRay())
                ).toUint128();
            }
        }

        if (amount == currentBalance) {
            _userState[from].additionalData = 0;
            _timestamps[from] = 0;
        } else {
            //solium-disable-next-line
            _timestamps[from] = uint40(block.timestamp);
        }
        //solium-disable-next-line
        _totalSupplyTimestamp = uint40(block.timestamp);

        if (balanceIncrease > amount) {
            uint256 amountToMint = balanceIncrease - amount;
            uint256 shareAmountToMint = amountToMint.rayDiv(rebaseIndex);
            uint256 totalShareSupply = previousSupply.rayDiv(rebaseIndex);
            _mint(from, shareAmountToMint, totalShareSupply);
            emit Transfer(address(0), from, amountToMint);
            emit Mint(
                from,
                from,
                amountToMint,
                currentBalance,
                balanceIncrease,
                userStableRate,
                nextAvgStableRate,
                nextSupply
            );
        } else {
            uint256 amountToBurn = amount - balanceIncrease;
            uint256 shareAmountToBurn = amountToBurn.rayDiv(rebaseIndex);
            uint256 totalShareSupply = previousSupply.rayDiv(rebaseIndex);
            _burn(from, shareAmountToBurn, totalShareSupply);
            emit Transfer(from, address(0), amountToBurn);
            emit Burn(
                from,
                amountToBurn,
                currentBalance,
                balanceIncrease,
                nextAvgStableRate,
                nextSupply
            );
        }

        return (nextSupply, nextAvgStableRate);
    }

    function getSupplyData()
        external
        view
        virtual
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint40
        )
    {
        uint256 avgRate = _avgStableRate;
        uint256 rebaseIndex = lastRebasingIndex();

        return (
            _totalSupply.rayMul(rebaseIndex),
            _calcTotalSupply(avgRate, rebaseIndex),
            avgRate,
            _totalSupplyTimestamp
        );
    }

    /// @inheritdoc IStableDebtToken
    function getTotalSupplyAndAvgRate()
        external
        view
        override
        returns (uint256, uint256)
    {
        uint256 avgRate = _avgStableRate;
        return (_calcTotalSupply(avgRate, lastRebasingIndex()), avgRate);
    }

    /// @inheritdoc IERC20
    function totalSupply() public view virtual override returns (uint256) {
        return _calcTotalSupply(_avgStableRate, lastRebasingIndex());
    }

    /// @inheritdoc IStableDebtToken
    function principalBalanceOf(address user)
        external
        view
        virtual
        override
        returns (uint256)
    {
        uint256 shareBalance = _userState[user].balance;
        return shareBalance.rayMul(lastRebasingIndex());
    }

    /**
     * @notice Calculates the increase in balance since the last user interaction
     * @param user The address of the user for which the interest is being accumulated
     * @param rebaseIndex Current rebase index
     * @return The previous principal balance
     * @return The new principal balance
     * @return The balance increase
     **/
    function _calculateBalanceIncrease(address user, uint256 rebaseIndex)
        internal
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 shareBalance = _userState[user].balance;
        if (shareBalance == 0) {
            return (0, 0, 0);
        }

        uint256 stableRate = _userState[user].additionalData;
        uint40 lastUpdateTimestamp = _timestamps[user];

        uint256 previousBalance = _calculateBalanceForTimestamp(
            shareBalance,
            rebaseIndex,
            stableRate,
            lastUpdateTimestamp,
            lastUpdateTimestamp
        );
        uint256 newBalance = _calculateBalanceForTimestamp(
            shareBalance,
            rebaseIndex,
            stableRate,
            uint40(block.timestamp),
            lastUpdateTimestamp
        );

        return (previousBalance, newBalance, newBalance - previousBalance);
    }

    function _calculateBalanceForTimestamp(
        uint256 shareBalance,
        uint256 rebaseIndex,
        uint256 stableRate,
        uint40 timestamp,
        uint40 lastUpdateTimestamp
    ) internal pure returns (uint256) {
        uint256 scaledBalance = shareBalance.rayMul(rebaseIndex);
        uint256 cumulatedInterest = MathUtils.calculateCompoundedInterest(
            stableRate,
            lastUpdateTimestamp,
            timestamp
        );
        return scaledBalance.rayMul(cumulatedInterest);
    }

    /**
     * @notice Calculates the total supply
     * @param avgRate The average rate at which the total supply increases
     * @param rebaseIndex Current rebase index
     * @return The debt balance of the user since the last burn/mint action
     **/
    function _calcTotalSupply(uint256 avgRate, uint256 rebaseIndex)
        internal
        view
        returns (uint256)
    {
        uint256 principalSupply = _totalSupply;
        if (principalSupply == 0) {
            return 0;
        }

        return
            _calculateBalanceForTimestamp(
                principalSupply,
                rebaseIndex,
                avgRate,
                uint40(block.timestamp),
                _totalSupplyTimestamp
            );
    }

    /**
     * @notice Mints stable debt tokens to a user
     * @param account The account receiving the debt tokens
     * @param shareAmount The share amount being minted
     * @param oldTotalShareSupply The total share supply before the minting event
     **/
    function _mint(
        address account,
        uint256 shareAmount,
        uint256 oldTotalShareSupply
    ) internal override {
        uint128 castShareAmount = shareAmount.toUint128();
        uint128 oldShareBalance = _userState[account].balance;
        _userState[account].balance = oldShareBalance + castShareAmount;

        if (address(_rewardController) != address(0)) {
            _rewardController.handleAction(
                account,
                oldTotalShareSupply,
                oldShareBalance
            );
        }
    }

    /**
     * @notice Burns stable debt tokens of a user
     * @param account The user getting his debt burned
     * @param shareAmount The share amount being burned
     * @param oldTotalShareSupply The total share supply before the burning event
     **/
    function _burn(
        address account,
        uint256 shareAmount,
        uint256 oldTotalShareSupply
    ) internal override {
        uint128 castShareAmount = shareAmount.toUint128();
        uint128 oldShareBalance = _userState[account].balance;
        _userState[account].balance = oldShareBalance - castShareAmount;

        if (address(_rewardController) != address(0)) {
            _rewardController.handleAction(
                account,
                oldTotalShareSupply,
                oldShareBalance
            );
        }
    }
}
