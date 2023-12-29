// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import "../../dependencies/openzeppelin/contracts//Pausable.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "../../interfaces/IACLManager.sol";
import "../../interfaces/IAAVEPool.sol";
import "../../misc/interfaces/IWETH.sol";
import "../../interfaces/ILido.sol";
import "../../interfaces/ICApe.sol";
import "../../interfaces/ICurve.sol";
import "./IVaultEarlyAccess.sol";
import "./IVaultApeStaking.sol";

contract VaultEarlyAccess is ReentrancyGuard, Pausable, IVaultEarlyAccess {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    address public constant ETH = address(0x1);
    address public constant USD = address(0x2);
    address internal immutable weth;
    address internal immutable usdt;
    address internal immutable usdc;
    address internal immutable apecoin;
    address internal immutable cApe;
    address internal immutable aavePool;
    address internal immutable LIDO;
    IACLManager private immutable aclManager;

    bytes32 constant EARLY_ACCESS_STORAGE_POSITION =
        bytes32(
            uint256(keccak256("vault.early.access.implementation.storage")) - 1
        );

    enum AssetType {
        NONE,
        CollectionAsset,
        SingleAsset
    }

    enum StrategyType {
        NONE,
        NOYIELD,
        AAVE,
        LIDO,
        APESTAKING,
        CAPE
    }

    struct AssetInfo {
        StrategyType strategyType;
        //total share for ERC20, total balance for ERC721
        uint184 totalShare;
        // user => shareBalance
        mapping(address => uint256) shareBalance;
        // tokenId => owner, only for ERC721
        mapping(uint256 => address) erc721Owner;
    }

    struct EarlyAccessStorage {
        address bridge;
        address yieldBot;
        uint256 crossChainETH;
        //single asset status
        mapping(address => bool) assetStatus;
        //asset => assetInfo
        mapping(address => AssetInfo) assetInfo;
    }

    constructor(
        address _weth,
        address _cApe,
        address _usdt,
        address _usdc,
        address _aavePool,
        address _LIDO,
        address _aclManager
    ) {
        weth = _weth;
        cApe = _cApe;
        apecoin = address(ICApe(cApe).apeCoin());
        usdt = _usdt;
        usdc = _usdc;
        aavePool = _aavePool;
        LIDO = _LIDO;
        aclManager = IACLManager(_aclManager);
    }

    function setBridge(address _bridge) external onlyPoolAdmin {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        ds.bridge = _bridge;
    }

    function setYieldBot(address _yieldBot) external onlyPoolAdmin {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        ds.yieldBot = _yieldBot;
    }

    function updateAccessListStatus(
        address[] calldata assets,
        bool[] calldata statuses
    ) external onlyPoolAdmin {
        uint256 arrayLength = assets.length;
        EarlyAccessStorage storage ds = earlyAccessStorage();
        for (uint256 index = 0; index < arrayLength; index++) {
            address asset = assets[index];
            bool status = statuses[index];
            require(ds.assetStatus[asset].isAllow != status, Errors.INVALID_STATUS);
            ds.assetStatus[asset].isAllow = status;
        }
    }

    function setAssetStrategy(
        address[] calldata assets,
        StrategyType[] calldata strategies
    ) external onlyPoolAdmin {
        uint256 arrayLength = assets.length;
        require(strategies.length == arrayLength, Errors.INVALID_PARAMETER);
        EarlyAccessStorage storage ds = earlyAccessStorage();
        for (uint256 index = 0; index < arrayLength; index++) {
            address asset = assets[index];
            AssetInfo storage assetInfo = ds.assetInfo[asset];
            //change strategy is not allowed currently
            require(
                assetInfo.strategyType == StrategyType.NONE,
                Errors.ASSET_STRATEGY_ALREADY_SET
            );
            assetInfo.strategyType = strategies[index];
        }
    }

    function depositERC721(address asset, uint32[] calldata tokenIds) external {
        uint256 arrayLength = tokenIds.length;
        EarlyAccessStorage storage ds = earlyAccessStorage();
        AssetInfo storage assetInfo = ds.assetInfo[asset];
        require(assetInfo.isAllow, Errors.NOT_IN_ACCESS_LIST);
        bool isApeStaking = assetInfo.strategyType == StrategyType.APESTAKING;
        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];
            IERC721(asset).safeTransferFrom(msg.sender, address(this), tokenId);
            if (isApeStaking) {
                IVaultApeStaking(address(this)).onboardCheckApeStakingPosition(
                    asset,
                    tokenId,
                    msg.sender
                );
            }
            assetInfo.erc721Owner[tokenId] = msg.sender;
        }
        assetInfo.shareBalance[msg.sender] += arrayLength;
        assetInfo.totalShare += arrayLength.toUint184();
    }

    receive() external payable {
        revert("not allow yet");
    }

    //ETH + wETH + stETH + cbETH + rETH
    function depositETHCollection(address asset, uint256 amount) public payable {
        if (asset == ETH) {
            require(msg.value > 0, Errors.INVALID_PARAMETER);
        } else {
            require(msg.value == 0, Errors.INVALID_PARAMETER);
        }
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(ds.assetStatus, Errors.NOT_IN_ACCESS_LIST);
        _depositLidoStrategy(ETH, msg.value, true);
    }

    function depositLidoStrategy(address asset, uint256 amount) external {
        _depositLidoStrategy(asset, amount, false);
    }

    function _depositLidoStrategy(
        address asset,
        uint256 amount,
        bool transferred
    ) internal {
        require(amount > 0, Errors.INVALID_PARAMETER);

        EarlyAccessStorage storage ds = earlyAccessStorage();
        AssetInfo storage assetInfo = ds.assetInfo[asset];
        require(assetInfo.isAllow, Errors.NOT_IN_ACCESS_LIST);
        require(
            assetInfo.strategyType == StrategyType.LIDO,
            Errors.STRATEGY_NOT_MATCH
        );

        uint256 totalBalance = totalLIDOBalance();
        if (transferred) {
            totalBalance -= amount;
        }
        uint256 share = (amount * assetInfo.totalShare) / totalBalance;
        assetInfo.totalShare += share.toUint184();
        ds.shareBalance[LIDO][msg.sender] += share;

        if (!transferred) {
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function lidoStaking() external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        uint256 balance = IERC20(weth).balanceOf(address(this));
        if (balance > 0) {
            IWETH(weth).withdraw(balance);
        }
        balance = address(this).balance;
        if (balance > 0) {
            ILido(LIDO).submit{value: balance}(address(0));
        }
    }

    function totalETHBalance() internal view returns (uint256) {
        return
            address(this).balance +
            IERC20(LIDO).balanceOf(address(this)) +
            IERC20(weth).balanceOf(address(this));
    }

    function depositAAVEStrategy(address asset, uint256 amount) external {
        require(amount > 0, Errors.INVALID_PARAMETER);

        EarlyAccessStorage storage ds = earlyAccessStorage();
        AssetInfo storage assetInfo = ds.assetInfo[asset];
        require(assetInfo.isAllow, Errors.NOT_IN_ACCESS_LIST);
        require(
            assetInfo.strategyType == StrategyType.AAVE,
            Errors.STRATEGY_NOT_MATCH
        );

        uint256 share = (amount * assetInfo.totalShare) /
            _totalBalanceForAAVE(asset);
        assetInfo.totalShare += share.toUint184();
        ds.shareBalance[asset][msg.sender] += share;

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    function aaveStaking(address asset) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        uint256 balance = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeApprove(aavePool, balance);
        IAAVEPool(aavePool).supply(asset, balance, address(this), 0);
    }

    function _totalBalanceForAAVE(address asset) internal view returns (uint256) {
        address aToken = IAAVEPool(aavePool)
            .getReserveData(asset)
            .aTokenAddress;
        return
            IERC20(asset).balanceOf(address(this)) +
            IERC20(aToken).balanceOf(address(this));
    }

    function depositCApeStrategy(address asset, uint256 amount) external {
        require(amount > 0, Errors.INVALID_PARAMETER);

        EarlyAccessStorage storage ds = earlyAccessStorage();
        AssetInfo storage assetInfo = ds.assetInfo[asset];
        require(assetInfo.isAllow, Errors.NOT_IN_ACCESS_LIST);
        require(
            assetInfo.strategyType == StrategyType.CAPE,
            Errors.STRATEGY_NOT_MATCH
        );

        uint256 share = (amount * assetInfo.totalShare) /
            _totalBalanceForCApe();
        assetInfo.totalShare += share.toUint184();
        ds.shareBalance[cApe][msg.sender] += share;

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    function capeStaking() external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        uint256 balance = IERC20(apecoin).balanceOf(address(this));
        IERC20(apecoin).safeApprove(cApe, balance);
        ICApe(cApe).deposit(address(this), balance);
    }

    function _totalBalanceForCApe() internal view returns (uint256) {
        return
            IERC20(apecoin).balanceOf(address(this)) +
            IERC20(cApe).balanceOf(address(this));
    }

    function depositERC20(address asset, uint256 amount) external {
        require(amount > 0, Errors.INVALID_PARAMETER);

        EarlyAccessStorage storage ds = earlyAccessStorage();
        AssetInfo storage assetInfo = ds.assetInfo[asset];
        require(assetInfo.isAllow, Errors.NOT_IN_ACCESS_LIST);
        require(
            assetInfo.strategyType == StrategyType.NOYIELD,
            Errors.STRATEGY_NOT_MATCH
        );

        uint256 share = (amount * assetInfo.totalShare) / _totalBalance(asset);
        assetInfo.totalShare += share.toUint184();
        ds.shareBalance[asset][msg.sender] += share;

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
    }

    function _totalBalance(address asset) internal view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function depositUSDT() external {}

    function depositUSDC() external {}

    function crossChain(address asset) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(ds.bridge != address(0), Errors.NOT_ENABLE);

        //TODO cross chain implementation
    }

    modifier onlyPoolAdmin() {
        _onlyPoolAdmin();
        _;
    }

    function _onlyPoolAdmin() internal view {
        require(
            aclManager.isPoolAdmin(msg.sender),
            Errors.CALLER_NOT_POOL_ADMIN
        );
    }

    function earlyAccessStorage()
        internal
        pure
        returns (EarlyAccessStorage storage ds)
    {
        bytes32 position = EARLY_ACCESS_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}
