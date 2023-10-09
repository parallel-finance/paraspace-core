// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interfaces/ILiquidityManager.sol";
import "../interfaces/IBase.sol";
import "../interfaces/IWrapToken.sol";
import "../interfaces/ISwap.sol";

/// @title Interface for WETH9
interface IWETH9 is IERC20 {
    /// @notice Deposit ether to get wrapped ether
    function deposit() external payable;

    /// @notice Withdraw wrapped ether to get ether
    function withdraw(uint256) external;
}

contract Box is ReentrancyGuard {

    using SafeERC20 for IERC20;

    uint256 private constant ADDR_SIZE = 20;
    bool public isMintOrAddLiquidity = false;

    struct PeripheryAddr {
        address weth;
        address liquidityManager;
        address swap;
    }
    PeripheryAddr public peripheryAddr;
    // mapping(address=>address) public wrap2Token;

    receive() external payable {}

    constructor(PeripheryAddr memory param) {
        peripheryAddr = param;
    }

    // function setWrap(address wrap, address token) external onlyOwner {
    //     wrap2Token[wrap] = token;
    // }

    function _recvTokenFromUser(address token, bool isWrapToken, uint256 amount) internal returns(uint256 actualAmount) {
        if (amount == 0) {
            return 0;
        }
        if (token == peripheryAddr.weth) {
            require(msg.value >= amount, '[recvTokenFromUser]: msg.value not enough');
            actualAmount = amount;
        } else if (isWrapToken) {
            actualAmount = IWrapToken(token).depositFrom(msg.sender, address(this), amount);
        } else {
            // no need to check, because iziswap core will revert unenough amount
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
            require(ok, '[recvTokenFromUser]: erc20 transfer fail');
            actualAmount = amount;
        }
    }

    /// @notice Transfers ETH to the recipient address
    /// @dev Fails with `STE`
    /// @param to The destination of the transfer
    /// @param value The value to be transferred
    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, "STE");
    }

    function _transferTokenToUser(address token, bool isWrapToken, address to, uint256 value) internal returns(uint256 actualAmount) {
        if (value > 0) {
            if (token == address(peripheryAddr.weth)) {
                IWETH9(token).withdraw(value);
                _safeTransferETH(to, value);
            } else if (isWrapToken) {
                return IWrapToken(token).withdraw(to, value);
            } else {
                IERC20(token).safeTransfer(to, value);
            }
        }
        actualAmount = value;
    }

    modifier checkNftOwner(uint256 lid) {
        require(ILiquidityManager(peripheryAddr.liquidityManager).ownerOf(lid) == msg.sender, 'not owner');
        _;
    }
    function mint(
        ILiquidityManager.MintParam calldata mintParam, 
        bool tokenXIsWrap, 
        bool tokenYIsWrap
    ) external payable nonReentrant returns(
        uint256 lid,
        uint128 liquidity,
        uint256 amountX,
        uint256 amountY
    ) {
        isMintOrAddLiquidity = true;
        uint256 actualLimX = _recvTokenFromUser(mintParam.tokenX, tokenXIsWrap, mintParam.xLim);
        uint256 actualLimY = _recvTokenFromUser(mintParam.tokenY, tokenYIsWrap, mintParam.yLim);
        delete isMintOrAddLiquidity;
        ILiquidityManager.MintParam memory actualParam = mintParam;
        actualParam.xLim = uint128(actualLimX);
        actualParam.yLim = uint128(actualLimY);
        if (actualParam.miner == address(0)) {
            actualParam.miner = msg.sender;
        }
        if (actualParam.tokenX != peripheryAddr.weth) {
            IERC20(actualParam.tokenX).approve(peripheryAddr.liquidityManager, type(uint256).max);
        }
        if (actualParam.tokenY != peripheryAddr.weth) {
            IERC20(actualParam.tokenY).approve(peripheryAddr.liquidityManager, type(uint256).max);
        }

        (
            lid,
            liquidity,
            amountX,
            amountY
        ) = ILiquidityManager(peripheryAddr.liquidityManager).mint{
            value: msg.value
        }(actualParam);
        // refund eth to this contract
        IBase(peripheryAddr.liquidityManager).refundETH();

        // refund
        if (actualParam.tokenX == peripheryAddr.weth) {
            if (amountX < msg.value) {
                _safeTransferETH(msg.sender, msg.value - amountX);
            }
        } else {
            if (amountX < actualLimX) {
                _transferTokenToUser(actualParam.tokenX, tokenXIsWrap, msg.sender, actualLimX - amountX);
            }
        }

        if (actualParam.tokenY == peripheryAddr.weth) {
            if (amountY < msg.value) {
                _safeTransferETH(msg.sender, msg.value - amountY);
            }
        } else {
            if (amountY < actualLimY) {
                _transferTokenToUser(actualParam.tokenY, tokenYIsWrap, msg.sender, actualLimY - amountY);
            }
        }
    }
    
    function addLiquidity(
        ILiquidityManager.AddLiquidityParam calldata addParam,
        address tokenX, 
        address tokenY,
        bool tokenXIsWrap,
        bool tokenYIsWrap
    ) external payable checkNftOwner(addParam.lid) nonReentrant returns(
        uint128 liquidityDelta,
        uint256 amountX,
        uint256 amountY
    ) {
        isMintOrAddLiquidity = true;
        // no need to check lid, wrapTokenX, wrapTokenY
        // because core will revert unenough deposit
        // and this contract will not save any token(including eth) theorily
        // so we donot care that some one will steal token from this contract
        uint256 actualLimX = _recvTokenFromUser(tokenX, tokenXIsWrap, addParam.xLim);
        uint256 actualLimY = _recvTokenFromUser(tokenY, tokenYIsWrap, addParam.yLim);
        delete isMintOrAddLiquidity;
        ILiquidityManager.AddLiquidityParam memory actualParam = addParam;
        actualParam.xLim = uint128(actualLimX);
        actualParam.yLim = uint128(actualLimY);
        if (tokenX != peripheryAddr.weth) {
            IERC20(tokenX).approve(peripheryAddr.liquidityManager, type(uint256).max);
        }
        if (tokenY != peripheryAddr.weth) {
            IERC20(tokenY).approve(peripheryAddr.liquidityManager, type(uint256).max);
        }

        (
            liquidityDelta,
            amountX,
            amountY
        ) = ILiquidityManager(peripheryAddr.liquidityManager).addLiquidity{
            value: msg.value
        }(actualParam);
        // refund eth to this contract
        IBase(peripheryAddr.liquidityManager).refundETH();

        // refund
        if (tokenX == peripheryAddr.weth) {
            if (amountX < msg.value) {
                _safeTransferETH(msg.sender, msg.value - amountX);
            }
        } else {
            if (amountX < actualLimX) {
                _transferTokenToUser(tokenX, tokenXIsWrap, msg.sender, actualLimX - amountX);
            }
        }

        if (tokenY == peripheryAddr.weth) {
            if (amountY < msg.value) {
                _safeTransferETH(msg.sender, msg.value - amountY);
            }
        } else {
            if (amountY < actualLimY) {
                _transferTokenToUser(tokenY, tokenYIsWrap, msg.sender, actualLimY - amountY);
            }
        }
    }

    function _collect(
        address recipient,
        uint256 lid,
        uint128 amountXLim,
        uint128 amountYLim,
        address tokenX,
        address tokenY,
        bool tokenXIsWrap, 
        bool tokenYIsWrap
    ) internal returns (
        uint256 amountX,
        uint256 amountY
    ) {
        (
            amountX,
            amountY
        ) = ILiquidityManager(peripheryAddr.liquidityManager).collect(
            address(this),
            lid,
            amountXLim,
            amountYLim
        );
        if (amountX > 0) {
            amountX = _transferTokenToUser(tokenX, tokenXIsWrap, recipient, amountX);
        }
        if (amountY > 0) {
            amountY = _transferTokenToUser(tokenY, tokenYIsWrap, recipient, amountY);
        }
    }


    function collect(
        address recipient,
        uint256 lid,
        uint128 amountXLim,
        uint128 amountYLim,
        address tokenX,
        address tokenY,
        bool tokenXIsWrap, 
        bool tokenYIsWrap
    ) external checkNftOwner(lid) nonReentrant returns (
        uint256 amountX,
        uint256 amountY
    ) {
        // no need to check lid, wrapTokenX, wrapTokenY
        // because core will revert unenough deposit
        // and this contract will not save any token(including eth) theorily
        // so we donot care that some one will steal token from this contract
        (amountX, amountY) = _collect(recipient, lid, amountXLim, amountYLim, tokenX, tokenY, tokenXIsWrap, tokenYIsWrap);
    }

    function decreaseLiquidity(
        address recipient,
        uint256 lid,
        uint128 liquidDelta,
        uint128 amountXMin,
        uint128 amountYMin,
        uint256 deadline,
        address tokenX,
        address tokenY,
        bool tokenXIsWrap,
        bool tokenYIsWrap
    ) external checkNftOwner(lid) nonReentrant returns (
        uint256 amountX,
        uint256 amountY
    ) {
        ILiquidityManager(peripheryAddr.liquidityManager).decLiquidity(
            lid,
            liquidDelta,
            amountXMin,
            amountYMin,
            deadline
        );
        (amountX, amountY) = _collect(recipient, lid, type(uint128).max, type(uint128).max, tokenX, tokenY, tokenXIsWrap, tokenYIsWrap);
    }

    function toAddress(bytes memory _bytes, uint256 _start) internal pure returns (address) {
        require(_start + 20 >= _start, 'toAddress_overflow');
        require(_bytes.length >= _start + 20, 'toAddress_outOfBounds');
        address tempAddress;

        assembly {
            tempAddress := div(mload(add(add(_bytes, 0x20), _start)), 0x1000000000000000000000000)
        }

        return tempAddress;
    }
    function decodeFirstLastToken(bytes memory path)
        internal
        pure
        returns (
            address firstToken,
            address lastToken
        )
    {
        firstToken = toAddress(path, 0);
        lastToken = toAddress(path, path.length - ADDR_SIZE);
    }
    function swapAmount(
        ISwap.SwapAmountParams calldata params,
        bool firstIsWrap,
        bool lastIsWrap
    ) external payable returns (uint256 cost, uint256 acquire) {
        (address firstToken, address lastToken) = decodeFirstLastToken(params.path);

        uint256 actualIn = _recvTokenFromUser(firstToken, firstIsWrap, params.amount);

        if (firstToken != peripheryAddr.weth) {
            IERC20(firstToken).approve(peripheryAddr.swap, type(uint256).max);
        }

        ISwap.SwapAmountParams memory newParam = params;
        newParam.recipient = address(this);
        newParam.amount = uint128(actualIn);
        (cost, acquire) = ISwap(peripheryAddr.swap).swapAmount{
            value: msg.value
        }(newParam);

        // refund eth to this contract, if firstToken is weth
        IBase(peripheryAddr.swap).refundETH();
        if (firstToken == peripheryAddr.weth) {
            if (cost < msg.value) {
                _safeTransferETH(msg.sender, msg.value - cost);
            }
        } else {
            if (cost < actualIn) {
                _transferTokenToUser(firstToken, firstIsWrap, msg.sender, actualIn - cost);
            }
        }

        if (acquire > 0) {
            _transferTokenToUser(lastToken, lastIsWrap, params.recipient, acquire);
        }
    }

}