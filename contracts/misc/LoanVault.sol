// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import "../dependencies/openzeppelin/upgradeability/OwnableUpgradeable.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {IInstantWithdrawNFT} from "../interfaces/IInstantWithdrawNFT.sol";
import {IPool} from "../interfaces/IPool.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {ILido} from "../interfaces/ILido.sol";
import {IAToken} from "../interfaces/IAToken.sol";
import {IBendPool} from "../interfaces/IBendPool.sol";
import {IWstETH} from "../interfaces/IWstETH.sol";
import {ICEther} from "../interfaces/ICEther.sol";

/**
 * @title LoanVault
 **/
contract LoanVault is Initializable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    /**
     * @dev Emitted during rescueERC20()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param amount The amount being rescued
     **/
    event RescueERC20(
        address indexed token,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Emitted during rescueERC721()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param ids The ids of the tokens being rescued
     **/
    event RescueERC721(
        address indexed token,
        address indexed to,
        uint256[] ids
    );

    address private immutable lendingPool;
    address private immutable wETH;
    address private immutable aETH;
    IPool private immutable aavePool;
    /*
    address private immutable astETH;
    address private immutable awstETH;
    address private immutable bendETH;
    address private immutable bendPool;
    address private immutable cETH;
    address private immutable stETH;
    address private immutable wstETH;
    */

    /**
     * @dev Only pool can call functions marked by this modifier.
     **/
    modifier onlyPool() {
        require(_msgSender() == lendingPool, "caller must be pool");
        _;
    }

    constructor(
        address _lendingPool,
        address _wETH,
        address _aETH
    )
    /*
        address _bendETH,
        address _cETH,
        address _wstETH,
        address _astETH,
        address _awstETH
*/
    {
        lendingPool = _lendingPool;
        wETH = _wETH;
        aETH = _aETH;
        aavePool = IAToken(_aETH).POOL();
        /*
        astETH = _astETH;
        awstETH = _awstETH;
        bendETH = _bendETH;
        cETH = _cETH;
        wstETH = _wstETH;
        stETH = IWstETH(_wstETH).stETH();
        bendPool = address(IAToken(_bendETH).POOL());
        */
    }

    function initialize() public initializer {
        __Ownable_init();

        _unlimitedApproveToLendingPool(wETH);
        _unlimitedApproveToLendingPool(aETH);
        /*
        _unlimitedApproveToLendingPool(astETH);
        _unlimitedApproveToLendingPool(awstETH);
        _unlimitedApproveToLendingPool(bendETH);
        _unlimitedApproveToLendingPool(cETH);
        _unlimitedApproveToLendingPool(stETH);
        */
    }

    function _unlimitedApproveToLendingPool(address token) internal {
        uint256 allowance = IERC20(token).allowance(address(this), lendingPool);
        if (allowance == 0) {
            IERC20(token).safeApprove(lendingPool, type(uint256).max);
        }
    }

    function transferCollateral(
        address collateralAsset,
        uint256 collateralTokenId,
        address to
    ) external onlyPool {
        IERC721(collateralAsset).safeTransferFrom(
            address(this),
            to,
            collateralTokenId
        );
    }

    function settleCollateral(
        address collateralAsset,
        uint256 collateralTokenId
    ) external onlyPool {
        IInstantWithdrawNFT(collateralAsset).burn(collateralTokenId);
    }

    function swapETHToDerivativeAsset(address asset, uint256 amount)
        external
        onlyPool
    {
        if (asset == wETH) {
            IWETH(wETH).deposit{value: amount}();
        } else if (asset == aETH) {
            IWETH(wETH).deposit{value: amount}();
            aavePool.supply(wETH, amount, address(this), 0);
            /*
        } else if (asset == astETH) {
            ILido(stETH).submit{value: amount}(address(0));
            aavePool.supply(stETH, amount, address(this), 0);
        } else if (asset == awstETH) {
            ILido(stETH).submit{value: amount}(address(0));
            uint256 wstEthAmount = IWstETH(wstETH).wrap(amount);
            aavePool.supply(wstETH, wstEthAmount, address(this), 0);
        } else if (asset == bendETH) {
            IWETH(wETH).deposit{value: amount}();
            IBendPool(bendPool).deposit(wETH, amount, address(this), 0);
        } else if (asset == cETH) {
            ICEther(cETH).mint{value: amount}();
        } else if (asset == stETH) {
            ILido(stETH).submit{value: amount}(address(0));
        */
        } else {
            revert("not support asset");
        }
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    function rescueERC721(
        address token,
        address to,
        uint256[] calldata ids
    ) external onlyOwner {
        for (uint256 i = 0; i < ids.length; i++) {
            IERC721(token).safeTransferFrom(address(this), to, ids[i]);
        }
        emit RescueERC721(token, to, ids);
    }
}
