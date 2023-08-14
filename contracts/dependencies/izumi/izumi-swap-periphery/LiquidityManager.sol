// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./core/interfaces/IiZiSwapCallback.sol";
import "./core/interfaces/IiZiSwapFactory.sol";
import "./core/interfaces/IiZiSwapPool.sol";

import "./libraries/MintMath.sol";
import "./libraries/TwoPower.sol";

import "./base/base.sol";

contract LiquidityManager is Ownable, Base, ERC721Enumerable, IiZiSwapMintCallback {

    /// @notice Emitted when miner successfully add liquidity on an existing liquidity-nft
    /// @param nftId id of minted liquidity nft
    /// @param pool address of swap pool
    /// @param liquidityDelta the amount of liquidity added
    /// @param amountX amount of tokenX deposit
    /// @param amountY amount of tokenY deposit
    event AddLiquidity(
        uint256 indexed nftId,
        address pool,
        uint128 liquidityDelta, 
        uint256 amountX, 
        uint256 amountY
    );
    /// @notice Emitted when miner successfully add decrease liquidity on an existing liquidity-nft
    /// @param nftId id of minted liquidity nft
    /// @param pool address of swap pool
    /// @param liquidityDelta the amount of liquidity decreased
    /// @param amountX amount of tokenX withdrawed
    /// @param amountY amount of tokenY withdrawed
    event DecLiquidity(
        uint256 indexed nftId,
        address pool,
        uint128 liquidityDelta, 
        uint256 amountX, 
        uint256 amountY
    );

    // callback data passed through iZiSwapPool#mint to the callback
    struct MintCallbackData {
        // tokenX of swap
        address tokenX;
        // tokenY of swap
        address tokenY;
        // fee amount of swap
        uint24 fee;
        // address to pay tokenX and tokenY to iZiSwapPool
        address payer;
    }

    // max-poolId in poolIds, poolId starts from 1
    uint128 private maxPoolId = 1;

    // infomation of liquidity provided by miner
    struct Liquidity {
        // left point of liquidity-token, the range is [leftPt, rightPt)
        int24 leftPt;
        // right point of liquidity-token, the range is [leftPt, rightPt)
        int24 rightPt;
        // amount of liquidity on each point in [leftPt, rightPt)
        uint128 liquidity;
        // a 128-fixpoint number, as integral of { fee(pt, t)/L(pt, t) }. 
        // here fee(pt, t) denotes fee generated on point pt at time t
        // L(pt, t) denotes liquidity on point pt at time t
        // pt varies in [leftPt, rightPt)
        // t moves from pool created until miner last modify this liquidity-token (mint/addLiquidity/decreaseLiquidity/create)
        uint256 lastFeeScaleX_128;
        uint256 lastFeeScaleY_128;
        // remained tokenX miner can collect, including fee and withdrawed token
        uint256 remainTokenX;
        uint256 remainTokenY;
        // id of pool in which this liquidity is added
        uint128 poolId;
    }

    /// @notice mapping from nftId to Liquidity info
    mapping(uint256 =>Liquidity) public liquidities;

    /// @notice num of liquidity token
    uint256 public liquidityNum = 0;

    struct PoolMeta {
        // tokenX of pool
        address tokenX;
        // tokenY of pool
        address tokenY;
        // fee amount of pool
        uint24 fee;
    }

    /// @notice mapping from poolId to meta info of pool
    mapping(uint128 =>PoolMeta) public poolMetas;

    /// @notice mapping from address to poolId within this contract
    mapping(address =>uint128) public poolIds;

    modifier checkAuth(uint256 lid) {
        require(_isApprovedOrOwner(msg.sender, lid), 'Not approved');
        _;
    }

    string public baseURI;
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseURI = newBaseURI;
    }

    /// @notice Constructor to create this contract.
    /// @param factory address of iZiSwapFactory
    /// @param weth address of WETH token
    constructor(
        address factory,
        address weth
    ) ERC721("iZiSwap Liquidity NFT", "IZISWAP-LIQUIDITY-NFT") Base(factory, weth) {
    }

    /// @notice Callback for mining, in order to deposit tokens.
    /// @param x amount of tokenX pay from miner
    /// @param y amount of tokenY pay from miner
    /// @param data encoded MintCallbackData
    function mintDepositCallback(
        uint256 x, uint256 y, bytes calldata data
    ) external override {
        MintCallbackData memory dt = abi.decode(data, (MintCallbackData));
        verify(dt.tokenX, dt.tokenY, dt.fee);

        if (x > 0) {
            pay(dt.tokenX, dt.payer, msg.sender, x);
        }
        if (y > 0) {
            pay(dt.tokenY, dt.payer, msg.sender, y);
        }
    }
 
    /// @notice Get or create a pool for (tokenX/tokenY/fee) if not exists.
    /// @param tokenX tokenX of swap pool
    /// @param tokenY tokenY of swap pool
    /// @param fee fee amount of swap pool
    /// @param initialPoint initial point if need to create a new pool
    /// @return corresponding pool address
    function createPool(address tokenX, address tokenY, uint24 fee, int24 initialPoint) external returns (address) {
        require(tokenX < tokenY, "x<y");
        address pool = IiZiSwapFactory(factory).pool(tokenX, tokenY, fee);
        if (pool == address(0)) {
            pool = IiZiSwapFactory(factory).newPool(tokenX, tokenY, fee, initialPoint);
            return pool;
        }
        return pool;
    }

    function liquidityKey(address miner, int24 pl, int24 pr) internal pure returns(bytes32) {
        return keccak256(abi.encodePacked(miner, pl, pr));
    }

    function cachePoolKey(address pool, PoolMeta memory meta) private returns (uint128 poolId) {
        poolId = poolIds[pool];
        if (poolId == 0) {
            poolIds[pool] = (poolId = maxPoolId++);
            poolMetas[poolId] = meta;
        }
    }

    function getLastFeeScale(address pool, bytes32 key) private view returns(uint256, uint256) {

        (, uint256 lastFeeScaleX_128, uint256 lastFeeScaleY_128, , ) = IiZiSwapPool(pool).liquidity(
            key
        );
        return (lastFeeScaleX_128, lastFeeScaleY_128);
    }

    function getPoolPrice(address pool) private view returns (uint160, int24) {
        (
            uint160 sqrtPrice_96,
            int24 currPt,
            ,
            ,
            ,
            ,
            ,
        ) = IiZiSwapPool(pool).state();
        return (sqrtPrice_96, currPt);
    }

    /// parameters when calling mint, grouped together to avoid stake too deep
    struct MintParam {
        // miner address
        address miner;
        // tokenX of swap pool
        address tokenX;
        // tokenY of swap pool
        address tokenY;
        // fee amount of swap pool
        uint24 fee;
        // left point of added liquidity
        int24 pl;
        // right point of added liquidity
        int24 pr;
        // amount limit of tokenX miner willing to deposit
        uint128 xLim;
        // amount limit tokenY miner willing to deposit
        uint128 yLim;
        // minimum amount of tokenX miner willing to deposit
        uint128 amountXMin;
        // minimum amount of tokenY miner willing to deposit
        uint128 amountYMin;

        uint256 deadline;
    }

    function _addLiquidity(MintParam memory mp) private returns(
        uint128 liquidity, uint256 amountX, uint256 amountY, address pool
    ) {
        int24 currPt;
        uint160 sqrtPrice_96;
        pool = IiZiSwapFactory(factory).pool(mp.tokenX, mp.tokenY, mp.fee);
        uint160 sqrtRate_96 = IiZiSwapPool(pool).sqrtRate_96();
        require(pool != address(0), "P0");
        (sqrtPrice_96, currPt) = getPoolPrice(pool);
        liquidity = MintMath.computeLiquidity(
            MintMath.MintMathParam({
                pl: mp.pl,
                pr: mp.pr,
                xLim: mp.xLim,
                yLim: mp.yLim
            }),
            currPt,
            sqrtPrice_96,
            sqrtRate_96
        );
        (amountX, amountY) = IiZiSwapPool(pool).mint(address(this), mp.pl, mp.pr, liquidity, 
            abi.encode(MintCallbackData({tokenX: mp.tokenX, tokenY: mp.tokenY, fee: mp.fee, payer: msg.sender})));
    }

    /// @notice Add a new liquidity and generate a nft.
    /// @param mintParam params, see MintParam for more
    /// @return lid id of nft
    /// @return liquidity amount of liquidity added
    /// @return amountX amount of tokenX deposited
    /// @return amountY amount of tokenY depsoited
    function mint(MintParam calldata mintParam) external payable checkDeadline(mintParam.deadline) returns(
        uint256 lid,
        uint128 liquidity,
        uint256 amountX,
        uint256 amountY
    ) {
        require(mintParam.tokenX < mintParam.tokenY, "x<y");
        address pool;
        (liquidity, amountX, amountY, pool) = _addLiquidity(mintParam);
        require(amountX >= mintParam.amountXMin, "XMIN");
        require(amountY >= mintParam.amountYMin, "YMIN");
        lid = liquidityNum ++;
        (uint256 lastFeeScaleX_128, uint256 lastFeeScaleY_128) = getLastFeeScale(
            pool, liquidityKey(address(this), mintParam.pl, mintParam.pr)
        );
        uint128 poolId = cachePoolKey(pool, PoolMeta({tokenX: mintParam.tokenX, tokenY: mintParam.tokenY, fee: mintParam.fee}));
        liquidities[lid] = Liquidity({
            leftPt: mintParam.pl,
            rightPt: mintParam.pr,
            liquidity: liquidity,
            lastFeeScaleX_128: lastFeeScaleX_128,
            lastFeeScaleY_128: lastFeeScaleY_128,
            remainTokenX: 0,
            remainTokenY: 0,
            poolId: poolId
        });
        _mint(mintParam.miner, lid);
        emit AddLiquidity(lid, pool, liquidity, amountX, amountY);
    }

    /// @notice Burn a generated nft.
    /// @param lid nft (liquidity) id
    /// @return success successfully burn or not
    function burn(uint256 lid) external checkAuth(lid) returns (bool success) {
        Liquidity storage liquid = liquidities[lid];
        require(liquid.liquidity == 0 && liquid.remainTokenX == 0 && liquid.remainTokenY == 0, 'NC');
        delete liquidities[lid];
        _burn(lid);
        return true;
    }

    /// parameters when calling addLiquidity, grouped together to avoid stake too deep
    struct AddLiquidityParam {
        // id of nft
        uint256 lid;
        // amount limit of tokenX user willing to deposit
        uint128 xLim;
        // amount limit of tokenY user willing to deposit
        uint128 yLim;
        // min amount of tokenX user willing to deposit
        uint128 amountXMin;
        // min amount of tokenY user willing to deposit
        uint128 amountYMin;

        uint256 deadline;
    }

    function updateLiquidity(
        Liquidity storage liquid,
        address pool,
        uint128 newLiquidity,
        uint256 amountX,
        uint256 amountY
    ) private {
        (uint256 lastFeeScaleX_128, uint256 lastFeeScaleY_128) = getLastFeeScale(
            pool, liquidityKey(address(this), liquid.leftPt, liquid.rightPt)
        );
        (uint256 deltaScaleX, uint256 deltaScaleY) = (liquid.lastFeeScaleX_128, liquid.lastFeeScaleY_128);
        assembly {
            deltaScaleX := sub(lastFeeScaleX_128, deltaScaleX)
            deltaScaleY := sub(lastFeeScaleY_128, deltaScaleY)
        }
        liquid.remainTokenX += amountX + MulDivMath.mulDivFloor(deltaScaleX, liquid.liquidity, TwoPower.pow128);
        liquid.remainTokenY += amountY + MulDivMath.mulDivFloor(deltaScaleY, liquid.liquidity, TwoPower.pow128);
        liquid.lastFeeScaleX_128 = lastFeeScaleX_128;
        liquid.lastFeeScaleY_128 = lastFeeScaleY_128;
        liquid.liquidity = newLiquidity;
    }
    
    /// @notice Add liquidity to a existing nft.
    /// @param addLiquidityParam see AddLiquidityParam for more
    /// @return liquidityDelta amount of added liquidity
    /// @return amountX amount of tokenX deposited
    /// @return amountY amonut of tokenY deposited
    function addLiquidity(
        AddLiquidityParam calldata addLiquidityParam
    ) external payable checkAuth(addLiquidityParam.lid) checkDeadline(addLiquidityParam.deadline) returns (
        uint128 liquidityDelta,
        uint256 amountX,
        uint256 amountY
    ) {
        require(addLiquidityParam.lid < liquidityNum, "LN");
        Liquidity storage liquid = liquidities[addLiquidityParam.lid];
        PoolMeta memory poolMeta = poolMetas[liquid.poolId];
        int24 currPt;
        uint160 sqrtPrice_96;
        address pool = IiZiSwapFactory(factory).pool(poolMeta.tokenX, poolMeta.tokenY, poolMeta.fee);
        // uint160 sqrtRate_96 = IiZiSwapPool(pool).sqrtRate_96();
        require(pool != address(0), "P0");
        (sqrtPrice_96, currPt) = getPoolPrice(pool);
        liquidityDelta = MintMath.computeLiquidity(
            MintMath.MintMathParam({
                pl: liquid.leftPt,
                pr: liquid.rightPt,
                xLim: addLiquidityParam.xLim,
                yLim: addLiquidityParam.yLim
            }),
            currPt,
            sqrtPrice_96,
            // sqrtRate_96
            IiZiSwapPool(pool).sqrtRate_96()
        );
        require(int128(liquid.liquidity) == int256(uint256(liquid.liquidity)), "LO");
        uint128 newLiquidity = liquidityDelta + liquid.liquidity;
        (amountX, amountY) = IiZiSwapPool(pool).mint(address(this), liquid.leftPt, liquid.rightPt, liquidityDelta, 
            abi.encode(MintCallbackData({tokenX: poolMeta.tokenX, tokenY: poolMeta.tokenY, fee: poolMeta.fee, payer: msg.sender})));
        require(amountX >= addLiquidityParam.amountXMin, "XMIN");
        require(amountY >= addLiquidityParam.amountYMin, "YMIN");
        updateLiquidity(liquid, pool, newLiquidity, 0, 0);
        emit AddLiquidity(addLiquidityParam.lid, pool, liquidityDelta, amountX, amountY);
    }

    /// @notice Decrease liquidity from a nft.
    /// @param lid id of nft
    /// @param liquidDelta amount of liqudity to decrease
    /// @param amountXMin min amount of tokenX user want to withdraw
    /// @param amountYMin min amount of tokenY user want to withdraw
    /// @param deadline deadline timestamp of transaction
    /// @return amountX amount of tokenX refund to user
    /// @return amountY amount of tokenY refund to user
    function decLiquidity(
        uint256 lid,
        uint128 liquidDelta,
        uint256 amountXMin,
        uint256 amountYMin,
        uint256 deadline
    ) external checkAuth(lid) checkDeadline(deadline) returns (
        uint256 amountX,
        uint256 amountY
    ) {
        require(lid < liquidityNum, "LN");
        Liquidity storage liquidity = liquidities[lid];
        if (liquidity.liquidity == 0) {
            // no need to call core to update fee
            return (0, 0);
        }
        if (liquidDelta > liquidity.liquidity) {
            liquidDelta = liquidity.liquidity;
        }
        PoolMeta memory poolMeta = poolMetas[liquidity.poolId];
        address pool = IiZiSwapFactory(factory).pool(poolMeta.tokenX, poolMeta.tokenY, poolMeta.fee);
        require(pool != address(0), "P0");
        
        uint128 newLiquidity = liquidity.liquidity - liquidDelta;
        (amountX, amountY) = IiZiSwapPool(pool).burn(liquidity.leftPt, liquidity.rightPt, liquidDelta);
        require(amountX >= amountXMin, "XMIN");
        require(amountY >= amountYMin, "YMIN");
        updateLiquidity(liquidity, pool, newLiquidity, amountX, amountY);
        emit DecLiquidity(lid, pool, liquidDelta, amountX, amountY);
    }

    /// @notice Collect fee gained of token withdrawed from nft.
    /// @param recipient address to receive token
    /// @param lid id of nft
    /// @param amountXLim amount limit of tokenX to collect
    /// @param amountYLim amount limit of tokenY to collect
    /// @return amountX amount of tokenX actually collect
    /// @return amountY amount of tokenY actually collect
    function collect(
        address recipient,
        uint256 lid,
        uint128 amountXLim,
        uint128 amountYLim
    ) external payable checkAuth(lid) returns (
        uint256 amountX,
        uint256 amountY
    ) {
        if (recipient == address(0)) {
            recipient = address(this);
        }
        require(lid < liquidityNum, "LN");
        Liquidity storage liquidity = liquidities[lid];
        PoolMeta memory poolMeta = poolMetas[liquidity.poolId];
        address pool = IiZiSwapFactory(factory).pool(poolMeta.tokenX, poolMeta.tokenY, poolMeta.fee);
        require(pool != address(0), "P0");
        if (liquidity.liquidity > 0) {
            IiZiSwapPool(pool).burn(liquidity.leftPt, liquidity.rightPt, 0);
            updateLiquidity(liquidity, pool, liquidity.liquidity, 0, 0);
        }
        if (amountXLim > liquidity.remainTokenX) {
            amountXLim = uint128(liquidity.remainTokenX);
        }
        if (amountYLim > liquidity.remainTokenY) {
            amountYLim = uint128(liquidity.remainTokenY);
        }
        (amountX, amountY) = IiZiSwapPool(pool).collect(recipient, liquidity.leftPt, liquidity.rightPt, amountXLim, amountYLim);
        // amountX(Y)Lim may be a little greater than actual value
        liquidity.remainTokenX -= amountXLim;
        liquidity.remainTokenY -= amountYLim;
    }
    
}
