// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "./core/interfaces/IiZiSwapCallback.sol";
import "./core/interfaces/IiZiSwapFactory.sol";
import "./core/interfaces/IiZiSwapPool.sol";

import "./libraries/Path.sol";

import "./base/base.sol";

contract Swap is Base, IiZiSwapCallback {

    uint256 private constant DEFAULT_PAYED_CACHED = type(uint256).max;
    uint256 private payedCached = DEFAULT_PAYED_CACHED;

    using Path for bytes;

    struct SwapCallbackData {
        bytes path;
        address payer;
    }

    /// @notice constructor to create this contract
    /// @param _factory address of iZiSwapFactory
    /// @param _weth address of weth token
    constructor(address _factory, address _weth) Base(_factory, _weth) {}

    /// @notice Callback for swapY2X and swapY2XDesireX, in order to pay tokenY from trader.
    /// @param x amount of tokenX trader acquired
    /// @param y amount of tokenY need to pay from trader
    /// @param data encoded SwapCallbackData
    function swapY2XCallback(
        uint256 x,
        uint256 y,
        bytes calldata data
    ) external override {
        SwapCallbackData memory dt = abi.decode(data, (SwapCallbackData));

        (address token0, address token1, uint24 fee) = dt.path.decodeFirstPool();
        verify(token0, token1, fee);
        if (token0 < token1) {
            // token1 is y, amount of token1 is calculated
            // called from swapY2XDesireX(...)
            if (dt.path.hasMultiplePools()) {
                dt.path = dt.path.skipToken();
                swapDesireInternal(y, msg.sender, dt);
            } else {
                pay(token1, dt.payer, msg.sender, y);
                payedCached = y;
            }
        } else {
            // token0 is y, amount of token0 is input param
            // called from swapY2X(...)
            pay(token0, dt.payer, msg.sender, y);
        }
    }

    /// @notice Callback for swapX2Y and swapX2YDesireY, in order to pay tokenX from trader.
    /// @param x amount of tokenX need to pay from trader
    /// @param y amount of tokenY trader acquired
    /// @param data encoded SwapCallbackData
    function swapX2YCallback(
        uint256 x,
        uint256 y,
        bytes calldata data
    ) external override {
        SwapCallbackData memory dt = abi.decode(data, (SwapCallbackData));
        (address token0, address token1, uint24 fee) = dt.path.decodeFirstPool();
        verify(token0, token1, fee);
        if (token0 < token1) {
            // token0 is x, amount of token0 is input param
            // called from swapX2Y(...)
            pay(token0, dt.payer, msg.sender, x);
        } else {
            // token1 is x, amount of token1 is calculated param
            // called from swapX2YDesireY(...)
            if (dt.path.hasMultiplePools()) {
                dt.path = dt.path.skipToken();
                swapDesireInternal(x, msg.sender, dt);
            } else {
                pay(token1, dt.payer, msg.sender, x);
                payedCached = x;
            }
        }
    }

    function swapDesireInternal(
        uint256 desire,
        address recipient,
        SwapCallbackData memory data
    ) private returns (uint256 acquire) {
        // allow swapping to the router address with address 0
        if (recipient == address(0)) recipient = address(this);

        (address tokenOut, address tokenIn, uint24 fee) = data.path.decodeFirstPool();

        address poolAddr = pool(tokenOut, tokenIn, fee);
        if (tokenOut < tokenIn) {
            // tokenOut is tokenX, tokenIn is tokenY
            // we should call y2XDesireX

            (acquire, ) = IiZiSwapPool(poolAddr).swapY2XDesireX(
                recipient, uint128(desire), 800001,
                abi.encode(data)
            );
        } else {
            // tokenOut is tokenY
            // tokenIn is tokenX
            (, acquire) = IiZiSwapPool(poolAddr).swapX2YDesireY(
                recipient, uint128(desire), -800001,
                abi.encode(data)
            );
        }
    }

    function swapAmountInternal(
        uint128 amount,
        address recipient,
        SwapCallbackData memory data
    ) private returns (uint256 cost, uint256 acquire) {
        // allow swapping to the router address with address 0
        if (recipient == address(0)) recipient = address(this);

        address payer = msg.sender; // msg.sender pays for the first hop

        bool firstHop = true;

        while (true) {
            bool hasMultiplePools = data.path.hasMultiplePools();
            (address tokenIn, address tokenOut, uint24 fee) = data.path.decodeFirstPool();
            address poolAddr = pool(tokenOut, tokenIn, fee);
            if (tokenIn < tokenOut) {
                // swapX2Y
                uint256 costX;
                (costX, acquire) = IiZiSwapPool(poolAddr).swapX2Y(
                    hasMultiplePools? address(this): recipient, amount, -799999,
                    abi.encode(SwapCallbackData({path: abi.encodePacked(tokenIn, fee, tokenOut), payer: payer}))
                );
                if (firstHop) {
                    cost = costX;
                }
            } else {
                // swapY2X
                uint256 costY;
                (acquire, costY) = IiZiSwapPool(poolAddr).swapY2X(
                    hasMultiplePools? address(this): recipient, amount, 799999,
                    abi.encode(SwapCallbackData({path: abi.encodePacked(tokenIn, fee, tokenOut), payer: payer}))
                );
                if (firstHop) {
                    cost = costY;
                }
            }
            firstHop = false;

            // decide whether to continue or terminate
            if (hasMultiplePools) {
                payer = address(this); // at this point, the caller has paid
                data.path = data.path.skipToken();
                amount = uint128(acquire);
            } else {
                break;
            }
        }
    }

    struct SwapDesireParams {
        bytes path;
        address recipient;
        uint128 desire;
        uint256 maxPayed;

        uint256 deadline;
    }


    /// @notice Swap given amount of target token, usually used in multi-hop case.
    function swapDesire(SwapDesireParams calldata params)
        external
        payable
        checkDeadline(params.deadline)
        returns (uint256 cost, uint256 acquire)
    {
        
        acquire = swapDesireInternal(
            params.desire,
            params.recipient,
            SwapCallbackData({path: params.path, payer: msg.sender})
        );
        cost = payedCached;
        require(cost <= params.maxPayed, 'Too much payed in swapDesire');
        require(acquire >= params.desire, 'Too much requested in swapDesire');
        payedCached = DEFAULT_PAYED_CACHED;
    }

    struct SwapAmountParams {
        bytes path;
        address recipient;
        // uint256 deadline;
        uint128 amount;
        uint256 minAcquired;

        uint256 deadline;
    }

    /// @notice Swap given amount of input token, usually used in multi-hop case.
    function swapAmount(SwapAmountParams calldata params)
        external
        payable
        checkDeadline(params.deadline)
        returns (uint256 cost, uint256 acquire) 
    {
        (cost, acquire) = swapAmountInternal(
            params.amount, 
            params.recipient, 
            SwapCallbackData({path: params.path, payer: msg.sender})
        );
        require(acquire >= params.minAcquired, 'Too much requested in swapAmount');
    }

    /// parameters when calling Swap.swap..., grouped together to avoid stake too deep
    struct SwapParams {
        // tokenX of swap pool
        address tokenX;
        // tokenY of swap pool
        address tokenY;
        // fee amount of swap pool
        uint24 fee;
        // highPt for y2x, lowPt for x2y
        // here y2X is calling swapY2X or swapY2XDesireX
        // in swapY2XDesireX, if boundaryPt is 800001, means user wants to get enough X
        // in swapX2YDesireY, if boundaryPt is -800001, means user wants to get enough Y
        int24 boundaryPt; 
        // who will receive acquired token
        address recipient;
        // desired amount for desired mode, paid amount for non-desired mode
        // here, desire mode is calling swapX2YDesireY or swapY2XDesireX
        uint128 amount;
        // max amount of payed token from trader, used in desire mode
        uint256 maxPayed;
        // min amount of received token trader wanted, used in undesire mode
        uint256 minAcquired;

        uint256 deadline;
    }

    // amount of exchanged tokens
    struct ExchangeAmount {
        // amount of tokenX paid or acquired
        uint256 amountX;
        // amount of tokenY acquired or paid
        uint256 amountY;
    }

    /// @notice Swap tokenY for tokenX, given max amount of tokenY user willing to pay
    /// @param swapParams params(for example: max amount in above line), see SwapParams for more
    function swapY2X(
        SwapParams calldata swapParams
    ) external payable checkDeadline(swapParams.deadline) {
        require(swapParams.tokenX < swapParams.tokenY, "x<y");
        address poolAddr = pool(swapParams.tokenX, swapParams.tokenY, swapParams.fee);
        address payer = msg.sender;
        address recipient = (swapParams.recipient == address(0)) ? address(this): swapParams.recipient;
        (uint256 amountX, ) = IiZiSwapPool(poolAddr).swapY2X(
            recipient, swapParams.amount, swapParams.boundaryPt,
            abi.encode(SwapCallbackData({path: abi.encodePacked(swapParams.tokenY, swapParams.fee, swapParams.tokenX), payer: payer}))
        );
        require(amountX >= swapParams.minAcquired, "XMIN");
    }

    /// @notice Swap tokenY for tokenX, given user's desired amount of tokenX.
    /// @param swapParams params(for example: desired amount in above line), see SwapParams for more
    function swapY2XDesireX(
        SwapParams calldata swapParams
    ) external payable checkDeadline(swapParams.deadline) {
        require(swapParams.tokenX < swapParams.tokenY, "x<y");
        address poolAddr = pool(swapParams.tokenX, swapParams.tokenY, swapParams.fee);
        address payer = msg.sender;
        address recipient = (swapParams.recipient == address(0)) ? address(this): swapParams.recipient;
        ExchangeAmount memory amount;
        (amount.amountX, amount.amountY) = IiZiSwapPool(poolAddr).swapY2XDesireX(
            recipient, swapParams.amount, swapParams.boundaryPt,
            abi.encode(SwapCallbackData({path: abi.encodePacked(swapParams.tokenX, swapParams.fee, swapParams.tokenY), payer: payer}))
        );
        if (swapParams.boundaryPt == 800001) {
            require(amount.amountX >= swapParams.amount, 'Too much requested in swapY2XDesireX');
        }
        require(amount.amountY <= swapParams.maxPayed, "YMAX");
    }

    /// @notice Swap tokenX for tokenY, given max amount of tokenX user willing to pay.
    /// @param swapParams params(for example: max amount in above line), see SwapParams for more
    function swapX2Y(
        SwapParams calldata swapParams
    ) external payable checkDeadline(swapParams.deadline) {
        require(swapParams.tokenX < swapParams.tokenY, "x<y");
        address poolAddr = pool(swapParams.tokenX, swapParams.tokenY, swapParams.fee);
        address payer = msg.sender;
        address recipient = (swapParams.recipient == address(0)) ? address(this): swapParams.recipient;
        (, uint256 amountY) = IiZiSwapPool(poolAddr).swapX2Y(
            recipient, swapParams.amount, swapParams.boundaryPt,
            abi.encode(SwapCallbackData({path: abi.encodePacked(swapParams.tokenX, swapParams.fee, swapParams.tokenY), payer: payer}))
        );
        require(amountY >= swapParams.minAcquired, "YMIN");
    }

    /// @notice Swap tokenX for tokenY, given amount of tokenY user desires.
    /// @param swapParams params(for example: desired amount in above line), see SwapParams for more
    function swapX2YDesireY(
        SwapParams calldata swapParams
    ) external payable checkDeadline(swapParams.deadline) {
        require(swapParams.tokenX < swapParams.tokenY, "x<y");
        address poolAddr = pool(swapParams.tokenX, swapParams.tokenY, swapParams.fee);
        address payer = msg.sender;
        address recipient = (swapParams.recipient == address(0)) ? address(this): swapParams.recipient;
        ExchangeAmount memory amount;
        (amount.amountX, amount.amountY) = IiZiSwapPool(poolAddr).swapX2YDesireY(
            recipient, swapParams.amount, swapParams.boundaryPt,
            abi.encode(SwapCallbackData({path: abi.encodePacked(swapParams.tokenY, swapParams.fee, swapParams.tokenX), payer: payer}))
        );
        require(amount.amountX <= swapParams.maxPayed, "XMAX");
        if (swapParams.boundaryPt == -800001) {
            require(amount.amountY >= swapParams.amount, 'Too much requested in swapX2YDesireY');
        }
    }
    
}