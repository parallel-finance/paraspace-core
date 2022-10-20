// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {INFTOracle} from "./interfaces/INFTOracle.sol";
import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Router} from "./interfaces/IUniswapV2Router.sol";
import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";
import {IERC165} from "../dependencies/openzeppelin/contracts/IERC165.sol";
import {ERC20} from "../dependencies/openzeppelin/contracts/ERC20.sol";

contract ParaSpaceFallbackOracle {
    address public immutable BEND_DAO;
    address public immutable UNISWAP_FACTORY;
    address public immutable UNISWAP_ROUTER;
    address public immutable SUSHISWAP_FACTORY;
    address public immutable SUSHISWAP_ROUTER;
    address public immutable WETH;
    address public immutable USDC;

    bytes4 private constant INTERFACE_ID_ERC721 = 0x80ac58cd;

    constructor(
        address bendDAO,
        address uniswapFactory,
        address uniswapRouter,
        address weth,
        address usdc,
        address sushiswapFactory,
        address sushiswapRouter
    ) {
        BEND_DAO = bendDAO;
        UNISWAP_FACTORY = uniswapFactory;
        UNISWAP_ROUTER = uniswapRouter;
        SUSHISWAP_FACTORY = sushiswapFactory;
        SUSHISWAP_ROUTER = sushiswapRouter;
        WETH = weth;
        USDC = usdc;
    }

    function getAssetPrice(address asset) public view returns (uint256) {
        try IERC165(asset).supportsInterface(INTERFACE_ID_ERC721) returns (
            bool supported
        ) {
            if (supported == true) {
                return INFTOracle(BEND_DAO).getAssetPrice(asset);
            }
        } catch {}

        bool fetchFromSushiSwap = false;
        address pairAddress = IUniswapV2Factory(UNISWAP_FACTORY).getPair(
            WETH,
            asset
        );
        if (pairAddress == address(0x00)) {
            pairAddress = IUniswapV2Factory(SUSHISWAP_FACTORY).getPair(
                WETH,
                asset
            );
            if (pairAddress != address(0x00)) {
                fetchFromSushiSwap = true;
            }
        }
        require(pairAddress != address(0x00), "pair not found");
        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
        (uint256 left, uint256 right, ) = pair.getReserves();
        (uint256 tokenReserves, uint256 ethReserves) = (asset < WETH)
            ? (left, right)
            : (right, left);
        //returns price in 18 decimals
        uint8 decimals = ERC20(asset).decimals();
        IUniswapV2Router router;
        if (fetchFromSushiSwap) {
            router = IUniswapV2Router(SUSHISWAP_ROUTER);
        } else {
            router = IUniswapV2Router(UNISWAP_ROUTER);
        }

        return router.getAmountOut(10**decimals, tokenReserves, ethReserves);
    }

    function getEthUsdPrice() public view returns (uint256) {
        address pairAddress = IUniswapV2Factory(UNISWAP_FACTORY).getPair(
            USDC,
            WETH
        );
        require(pairAddress != address(0x00), "pair not found");
        IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
        (uint256 left, uint256 right, ) = pair.getReserves();
        (uint256 usdcReserves, uint256 ethReserves) = (USDC < WETH)
            ? (left, right)
            : (right, left);
        uint8 ethDecimals = ERC20(WETH).decimals();
        //uint8 usdcDecimals = ERC20(USDC).decimals();
        //returns price in 6 decimals
        return
            IUniswapV2Router(UNISWAP_ROUTER).getAmountOut(
                10**ethDecimals,
                ethReserves,
                usdcReserves
            );
    }
}
