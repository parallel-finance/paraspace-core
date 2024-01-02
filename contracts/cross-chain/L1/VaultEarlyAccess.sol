// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import "../../dependencies/openzeppelin/contracts//Pausable.sol";
import "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import "../../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC20, IERC20Detailed} from "../../dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {Errors} from "../../protocol/libraries/helpers/Errors.sol";
import "../../interfaces/IACLManager.sol";
import "../../interfaces/IAAVEPool.sol";
import "../../misc/interfaces/IWETH.sol";
import "../../interfaces/ILido.sol";
import "../../interfaces/IcbETH.sol";
import "../../interfaces/IrETH.sol";
import "../../interfaces/IwstETH.sol";
import "../../interfaces/ICApe.sol";
import "./IVaultEarlyAccess.sol";
import "./IVaultApeStaking.sol";

contract VaultEarlyAccess is ReentrancyGuard, Pausable, IVaultEarlyAccess {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public constant ETHCollection = address(0x1);
    address public constant USDCollection = address(0x2);
    address internal immutable weth;
    address internal immutable stETH;
    address internal immutable wstETH;
    address internal immutable cbETH;
    address internal immutable rETH;
    address internal immutable cApe;
    address internal immutable aavePool;
    IACLManager private immutable aclManager;

    bytes32 constant EARLY_ACCESS_STORAGE_POSITION =
        bytes32(
            uint256(keccak256("vault.early.access.implementation.storage")) - 1
        );

    /**
     * @dev Emitted during deposit asset in early access
     * @param assetCollection asset collection address tag, 0x1 for ETH, 0x2 for USD
     * @param share share for asset collection
     * @param asset deposited asset address
     * @param amount deposited asset amount
     **/
    event Deposit(
        address assetCollection,
        uint256 share,
        address asset,
        uint256 amount
    );

    struct CollectionInfo {
        StrategyType strategyType;
        //exchange rate for ERC20
        uint184 exchangeRate;
        // total share on current chain
        uint256 totalShare;
        // user => shareBalance
        mapping(address => uint256) shareBalance;
        // tokenId => owner, only for ERC721
        mapping(uint256 => address) erc721Owner;
    }

    struct EarlyAccessStorage {
        address bridge;
        address yieldBot;
        uint256 crossChainETH;
        EnumerableSet.AddressSet ethCollection;
        EnumerableSet.AddressSet usdCollection;
        //single asset status
        mapping(address => bool) assetStatus;
        //collection => CollectionInfo
        mapping(address => CollectionInfo) collectionInfo;
    }

    //1. asset address might be zero address on some chain
    //2. big amount share attach
    //3. is strategy still useful
    constructor(
        address _weth,
        address _wstETH,
        address _cbETH,
        address _rETH,
        address _cApe,
        address _aavePool,
        address _aclManager
    ) {
        weth = _weth;
        wstETH = _wstETH;
        if (wstETH == address(0)) {
            stETH = address(0);
        } else {
            stETH = IwstETH(wstETH).stETH();
        }
        cbETH = _cbETH;
        rETH = _rETH;
        cApe = _cApe;
        aavePool = _aavePool;
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
            require(ds.assetStatus[asset] != status, Errors.INVALID_STATUS);
            ds.assetStatus[asset] = status;
        }
    }

    function setCollectionStrategy(
        address[] calldata assets,
        StrategyType[] calldata strategies
    ) external onlyPoolAdmin {
        uint256 arrayLength = assets.length;
        require(strategies.length == arrayLength, Errors.INVALID_PARAMETER);
        EarlyAccessStorage storage ds = earlyAccessStorage();
        for (uint256 index = 0; index < arrayLength; index++) {
            address asset = assets[index];
            CollectionInfo storage collectionInfo = ds.collectionInfo[asset];
            //change strategy is not allowed currently
            require(
                collectionInfo.strategyType == StrategyType.NONE,
                Errors.ASSET_STRATEGY_ALREADY_SET
            );
            collectionInfo.strategyType = strategies[index];
            if (collectionInfo.exchangeRate == 0) {
                collectionInfo.exchangeRate = 1e18;
            }
        }
    }

    receive() external payable {
        revert("not allow yet");
    }

    /// ETH collection

    function addETHCollection(address asset) external onlyPoolAdmin {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(!isInETHList(asset), Errors.ALREADY_IN_COLLECTION_LIST);
        if (asset != ETH) {
            require(
                IERC20Detailed(asset).decimals() == 18,
                Errors.INVALID_PARAMETER
            );
        }
        ds.ethCollection.add(asset);
    }

    // eth + weth + stETH + wstETH + cbETH + rETH
    function ethCollection() external view returns (address[] memory) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        return ds.ethCollection.values();
    }

    function isInETHList(address asset) public view returns (bool) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        return ds.ethCollection.contains(asset);
    }

    function depositETHCollection(
        address asset,
        uint256 amount
    ) external payable {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(ds.assetStatus[asset], Errors.NOT_IN_ACCESS_LIST);
        require(isInETHList(asset), Errors.NOT_IN_COLLECTION_LIST);
        CollectionInfo storage collectionInfo = ds.collectionInfo[
            ETHCollection
        ];
        require(
            collectionInfo.strategyType != StrategyType.NONE,
            Errors.STRATEGY_NOT_SET
        );

        if (asset == ETH) {
            require(msg.value > 0, Errors.INVALID_PARAMETER);
            amount = msg.value;
        } else {
            require(msg.value == 0 && amount > 0, Errors.INVALID_PARAMETER);
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        }

        uint256 ethValue = _getETHValue(asset, amount);
        uint256 share = _updateUserShare(collectionInfo, msg.sender, ethValue);

        emit Deposit(ETHCollection, share, asset, amount);
    }

    function totalETHValue() external view returns (uint256) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        address[] memory ethAssets = ds.ethCollection.values();
        uint256 length = ethAssets.length;
        uint256 totalValue;
        for (uint256 index = 0; index < length; index++) {
            totalValue += _getETHCollectionAssetValue(ethAssets[index]);
        }

        return totalValue;
    }

    function totalETHShare() external view returns (uint256) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        return ds.collectionInfo[ETHCollection].totalShare;
    }

    function _getETHCollectionAssetValue(
        address asset
    ) internal view returns (uint256) {
        if (asset == ETH) {
            return address(this).balance;
        }

        uint256 totalBalance = _totalBalanceWithAAVE(asset);
        if (totalBalance == 0) {
            return 0;
        }

        return _getETHValue(asset, totalBalance);
    }

    function _getETHValue(
        address asset,
        uint256 amount
    ) internal view returns (uint256) {
        uint256 exchangeRate = 1e18;
        if (asset == cbETH) {
            exchangeRate = IcbETH(cbETH).exchangeRate();
        } else if (asset == rETH) {
            exchangeRate = IrETH(rETH).getExchangeRate();
        } else if (asset == wstETH) {
            exchangeRate = IwstETH(wstETH).stEthPerToken();
        }

        return (amount * exchangeRate) / 1e18;
    }

    /// USD collection

    function addUSDCollection(address asset) external onlyPoolAdmin {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(!isInUSDList(asset), Errors.ALREADY_IN_COLLECTION_LIST);
        ds.usdCollection.add(asset);
    }

    //USDT + USDC + DAI
    function usdCollection() external view returns (address[] memory) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        return ds.usdCollection.values();
    }

    function isInUSDList(address asset) public view returns (bool) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        return ds.usdCollection.contains(asset);
    }

    function depositUSDCollection(address asset, uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(ds.assetStatus[asset], Errors.NOT_IN_ACCESS_LIST);
        require(isInUSDList(asset), Errors.NOT_IN_COLLECTION_LIST);
        CollectionInfo storage collectionInfo = ds.collectionInfo[
            USDCollection
        ];
        require(
            collectionInfo.strategyType != StrategyType.NONE,
            Errors.STRATEGY_NOT_SET
        );

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        uint256 usdValue = _getUSDValue(asset, amount);
        uint256 share = _updateUserShare(collectionInfo, msg.sender, usdValue);

        emit Deposit(USDCollection, share, asset, amount);
    }

    function totalUSDValue() external view returns (uint256) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        address[] memory usdAssets = ds.ethCollection.values();
        uint256 length = usdAssets.length;
        uint256 totalValue;
        for (uint256 index = 0; index < length; index++) {
            totalValue += _getUSDCollectionAssetValue(usdAssets[index]);
        }

        return totalValue;
    }

    function totalUSDShare() external view returns (uint256) {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        return ds.collectionInfo[USDCollection].totalShare;
    }

    function _getUSDCollectionAssetValue(
        address asset
    ) internal view returns (uint256) {
        uint256 totalBalance = _totalBalanceWithAAVE(asset);
        if (totalBalance == 0) {
            return 0;
        }

        return _getUSDValue(asset, totalBalance);
    }

    function _getUSDValue(
        address asset,
        uint256 amount
    ) internal view returns (uint256) {
        uint8 decimals = IERC20Detailed(asset).decimals();
        uint256 multiplier = 10 ** (18 - decimals);
        return amount * multiplier;
    }

    /// ape coin collection

    //ape coin + cApe, only valid on ETH mainnet
    function cApeCollection() external view returns (address[] memory) {
        if (cApe == address(0)) {
            address[] memory list = new address[](0);
            return list;
        } else {
            address[] memory list = new address[](2);
            list[0] = cApe;
            list[1] = address(ICApe(cApe).apeCoin());
            return list;
        }
    }

    function depositCApeCollection(address asset, uint256 amount) external {
        require(amount > 0, Errors.INVALID_PARAMETER);

        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(ds.assetStatus[asset], Errors.NOT_IN_ACCESS_LIST);
        CollectionInfo storage collectionInfo = ds.collectionInfo[asset];
        require(
            collectionInfo.strategyType == StrategyType.CAPE,
            Errors.STRATEGY_NOT_MATCH
        );

        _updateCApeExchange(collectionInfo);
        uint256 share = _updateUserShare(collectionInfo, msg.sender, amount);

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        emit Deposit(cApe, share, asset, amount);
    }

    function _updateCApeExchange(
        CollectionInfo storage collectionInfo
    ) internal {
        IERC20 apecoin = ICApe(cApe).apeCoin();
        uint256 totalBalance = apecoin.balanceOf(address(this)) +
            IERC20(cApe).balanceOf(address(this));
        uint256 exchangeRate = (totalBalance * 1e18) /
            collectionInfo.totalShare;
        if (exchangeRate == 0) {
            exchangeRate = 1e18;
        }
        collectionInfo.exchangeRate = exchangeRate.toUint184();
    }

    /// normal ERC20

    function depositERC20(address asset, uint256 amount) external {
        require(amount > 0, Errors.INVALID_PARAMETER);

        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(ds.assetStatus[asset], Errors.NOT_IN_ACCESS_LIST);
        CollectionInfo storage collectionInfo = ds.collectionInfo[asset];
        require(
            collectionInfo.strategyType != StrategyType.NONE,
            Errors.STRATEGY_NOT_SET
        );

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        uint256 share = _updateUserShare(collectionInfo, msg.sender, amount);

        emit Deposit(asset, share, asset, amount);
    }

    /// ERC721

    function depositERC721(address asset, uint32[] calldata tokenIds) external {
        uint256 arrayLength = tokenIds.length;
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(ds.assetStatus[asset], Errors.NOT_IN_ACCESS_LIST);
        CollectionInfo storage collectionInfo = ds.collectionInfo[asset];
        require(
            collectionInfo.strategyType != StrategyType.NONE,
            Errors.STRATEGY_NOT_SET
        );

        for (uint256 index = 0; index < arrayLength; index++) {
            uint32 tokenId = tokenIds[index];
            IERC721(asset).safeTransferFrom(msg.sender, address(this), tokenId);
            collectionInfo.erc721Owner[tokenId] = msg.sender;
        }
        collectionInfo.shareBalance[msg.sender] += arrayLength;
        collectionInfo.totalShare += arrayLength.toUint184();

        if (collectionInfo.strategyType == StrategyType.APESTAKING) {
            IVaultApeStaking(address(this)).onboardCheckApeStakingPosition(
                asset,
                tokenIds,
                msg.sender
            );
        }
    }

    function _updateUserShare(
        CollectionInfo storage collectionInfo,
        address user,
        uint256 amount
    ) internal returns (uint256) {
        uint256 share = (amount * 1e18) / collectionInfo.exchangeRate;
        collectionInfo.shareBalance[user] += share;
        collectionInfo.totalShare += share;
        return share;
    }

    function _totalBalanceWithAAVE(
        address asset
    ) internal view returns (uint256) {
        address aToken = IAAVEPool(aavePool)
            .getReserveData(asset)
            .aTokenAddress;
        if (aToken == address(0)) {
            return IERC20(asset).balanceOf(address(this));
        } else {
            return
                IERC20(asset).balanceOf(address(this)) +
                IERC20(aToken).balanceOf(address(this));
        }
    }

    ///yield bot

    //eth -> weth
    function depositWETH(uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        IWETH(weth).deposit{value: amount}();
    }

    // weth -> eth
    function withdrawWETH(uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        IWETH(weth).withdraw(amount);
    }

    // eth -> stETH
    function depositLIDO(uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        ILido(stETH).submit{value: amount}(address(0));
    }

    // apecoin -> cApe
    function depositCApe(uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        IERC20 apecoin = ICApe(cApe).apeCoin();
        apecoin.safeApprove(cApe, amount);
        ICApe(cApe).deposit(address(this), amount);
    }

    // cApe -> apecoin
    function withdrawCApe(uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        ICApe(cApe).withdraw(amount);
    }

    // token -> aToken
    function depositAAVE(address asset, uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        //uint256 balance = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeApprove(aavePool, amount);
        IAAVEPool(aavePool).supply(asset, amount, address(this), 0);
    }

    // aToken -> token
    function withdrawAAVE(address asset, uint256 amount) external {
        EarlyAccessStorage storage ds = earlyAccessStorage();
        require(msg.sender == ds.yieldBot, Errors.NOT_STAKING_BOT);
        // uint256 balance = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeApprove(aavePool, amount);
        IAAVEPool(aavePool).withdraw(asset, amount, address(this));
    }

    function crossChain(address asset) external view {
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
