// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../libraries/paraspace-upgradeability/ParaReentrancyGuard.sol";
import "../libraries/paraspace-upgradeability/ParaVersionedInitializable.sol";
import {PoolStorage} from "./PoolStorage.sol";
import "../../interfaces/IPoolApeStaking.sol";
import "../../interfaces/IPToken.sol";
import "../../dependencies/yoga-labs/ApeCoinStaking.sol";
import "../../interfaces/IXTokenType.sol";
import "../../interfaces/INTokenApeStaking.sol";
import {ValidationLogic} from "../libraries/logic/ValidationLogic.sol";
import {IPoolAddressesProvider} from "../../interfaces/IPoolAddressesProvider.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {ReserveLogic} from "../libraries/logic/ReserveLogic.sol";
import {GenericLogic} from "../libraries/logic/GenericLogic.sol";
import {UserConfiguration} from "../libraries/configuration/UserConfiguration.sol";
import {ApeStakingLogic} from "../tokenization/libraries/ApeStakingLogic.sol";

contract PoolApeStaking is
    ParaVersionedInitializable,
    ParaReentrancyGuard,
    PoolStorage,
    IPoolApeStaking
{
    using ReserveLogic for DataTypes.ReserveData;
    using UserConfiguration for DataTypes.UserConfigurationMap;
    using SafeERC20 for IERC20;

    IPoolAddressesProvider internal immutable ADDRESSES_PROVIDER;
    uint256 internal constant POOL_REVISION = 1;

    /**
     * @dev Emitted on setUserUseERC20AsCollateral()
     * @param reserve The address of the underlying asset of the reserve
     * @param user The address of the user enabling the usage as collateral
     **/
    event ReserveUsedAsCollateralEnabled(
        address indexed reserve,
        address indexed user
    );

    /**
     * @dev Emitted on setUserUseERC20AsCollateral()
     * @param reserve The address of the underlying asset of the reserve
     * @param user The address of the user enabling the usage as collateral
     **/
    event ReserveUsedAsCollateralDisabled(
        address indexed reserve,
        address indexed user
    );

    /**
     * @dev Constructor.
     * @param provider The address of the PoolAddressesProvider contract
     */
    constructor(IPoolAddressesProvider provider) {
        ADDRESSES_PROVIDER = provider;
    }

    function getRevision() internal pure virtual override returns (uint256) {
        return POOL_REVISION;
    }

    function depositApeCoin(
        address nftAsset,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();

        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        XTokenType tokenType = nToken.getXTokenType();
        require(
            tokenType == XTokenType.NTokenBAYC ||
                tokenType == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );

        uint256 totalAmount = 0;
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index].tokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
            totalAmount += _nfts[index].amount;
        }
        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(xTokenAddress);
        nTokenApeStaking.getApeStaking().apeCoin().safeTransferFrom(
            msg.sender,
            xTokenAddress,
            totalAmount
        );

        executeSupplySApe(ps, totalAmount);

        nTokenApeStaking.depositApeCoin(_nfts);
    }

    function withdrawApeCoin(
        address nftAsset,
        ApeCoinStaking.SingleNft[] calldata _nfts
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        XTokenType tokenType = nToken.getXTokenType();
        require(
            tokenType == XTokenType.NTokenBAYC ||
                tokenType == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );
        uint256 amountToWithdraw = 0;
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index].tokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
            amountToWithdraw += _nfts[index].amount;
        }

        executeWithdrawSApe(ps, amountToWithdraw);

        INTokenApeStaking(nftReserve.xTokenAddress).withdrawApeCoin(
            _nfts,
            msg.sender
        );
    }

    function claimApeCoin(address nftAsset, uint256[] calldata _nfts)
        external
        nonReentrant
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        XTokenType tokenType = nToken.getXTokenType();
        require(
            tokenType == XTokenType.NTokenBAYC ||
                tokenType == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index]) == msg.sender,
                Errors.NOT_THE_OWNER
            );
        }

        INTokenApeStaking(xTokenAddress).claimApeCoin(_nfts, msg.sender);
    }

    function depositBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        XTokenType tokenType = nToken.getXTokenType();
        require(
            tokenType == XTokenType.NTokenBAYC ||
                tokenType == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(xTokenAddress);
        IERC721 bakcContract = nTokenApeStaking.getBAKC();
        uint256 totalAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                nToken.ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
            totalAmount += _nftPairs[index].amount;

            bakcContract.safeTransferFrom(
                msg.sender,
                xTokenAddress,
                _nftPairs[index].bakcTokenId
            );
        }
        nTokenApeStaking.getApeStaking().apeCoin().safeTransferFrom(
            msg.sender,
            xTokenAddress,
            totalAmount
        );

        executeSupplySApe(ps, totalAmount);

        nTokenApeStaking.depositBAKC(_nftPairs);

        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                msg.sender,
                _nftPairs[index].bakcTokenId
            );
        }
    }

    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        address xTokenAddress;
        {
            DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
            xTokenAddress = nftReserve.xTokenAddress;
            XTokenType tokenType = INToken(xTokenAddress).getXTokenType();
            require(
                tokenType == XTokenType.NTokenBAYC ||
                    tokenType == XTokenType.NTokenMAYC,
                Errors.INVALID_ASSET_TYPE
            );
        }

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(xTokenAddress);
        IERC721 bakcContract = nTokenApeStaking.getBAKC();
        uint256 amountToWithdraw = 0;
        uint256[] memory transferedTokenIds = new uint256[](_nftPairs.length);
        uint256 actualTransferAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                INToken(xTokenAddress).ownerOf(_nftPairs[index].mainTokenId) ==
                    msg.sender,
                Errors.NOT_THE_OWNER
            );

            (uint256 stakedAmount, ) = nTokenApeStaking
                .getApeStaking()
                .nftPosition(
                    ApeStakingLogic.BAKC_POOL_ID,
                    _nftPairs[index].bakcTokenId
                );

            if (_nftPairs[index].amount == 0) {
                _nftPairs[index].amount = stakedAmount;
            }
            //only partially withdraw need user's BAKC
            if (_nftPairs[index].amount != stakedAmount) {
                bakcContract.safeTransferFrom(
                    msg.sender,
                    xTokenAddress,
                    _nftPairs[index].bakcTokenId
                );
                transferedTokenIds[actualTransferAmount] = _nftPairs[index]
                    .bakcTokenId;
                actualTransferAmount++;
            }
            amountToWithdraw += _nftPairs[index].amount;
        }

        executeWithdrawSApe(ps, amountToWithdraw);

        nTokenApeStaking.withdrawBAKC(_nftPairs, msg.sender);

        ////transfer BAKC back for user
        for (uint256 index = 0; index < actualTransferAmount; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                msg.sender,
                transferedTokenIds[index]
            );
        }
    }

    function claimBAKC(
        address nftAsset,
        ApeCoinStaking.PairNft[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        XTokenType tokenType = nToken.getXTokenType();
        require(
            tokenType == XTokenType.NTokenBAYC ||
                tokenType == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(xTokenAddress);
        IERC721 bakcContract = nTokenApeStaking.getBAKC();
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                nToken.ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
            bakcContract.safeTransferFrom(
                msg.sender,
                xTokenAddress,
                _nftPairs[index].bakcTokenId
            );
        }

        nTokenApeStaking.claimBAKC(_nftPairs, msg.sender);

        //transfer BAKC back for user
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            bakcContract.safeTransferFrom(
                xTokenAddress,
                msg.sender,
                _nftPairs[index].bakcTokenId
            );
        }
    }

    function unstakeApePositionAndRepay(address nftAsset, uint256 tokenId)
        external
        nonReentrant
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        address xTokenAddress = nftReserve.xTokenAddress;
        INToken nToken = INToken(xTokenAddress);
        XTokenType tokenType = nToken.getXTokenType();
        require(
            tokenType == XTokenType.NTokenBAYC ||
                tokenType == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(xTokenAddress);
        address incentiveReceiver = address(0);
        address positionOwner = nToken.ownerOf(tokenId);
        if (msg.sender != positionOwner) {
            DataTypes.CalculateUserAccountDataParams memory params = DataTypes
                .CalculateUserAccountDataParams({
                    userConfig: ps._usersConfig[positionOwner],
                    reservesCount: ps._reservesCount,
                    user: positionOwner,
                    oracle: ADDRESSES_PROVIDER.getPriceOracle()
                });

            (, , , , , , , uint256 healthFactor, , ) = GenericLogic
                .calculateUserAccountData(
                    ps._reserves,
                    ps._reservesList,
                    params
                );
            require(
                healthFactor < DataTypes.HEALTH_FACTOR_LIQUIDATION_THRESHOLD,
                Errors.HEALTH_FACTOR_NOT_BELOW_THRESHOLD
            );
            incentiveReceiver = msg.sender;
        }

        nTokenApeStaking.unstakePositionAndRepay(tokenId, incentiveReceiver);
    }

    function executeSupplySApe(DataTypes.PoolStorage storage ps, uint256 amount)
        internal
    {
        DataTypes.ReserveData storage erc20Reserve = ps._reserves[
            DataTypes.SApeAddress
        ];
        DataTypes.ReserveCache memory erc20ReserveCache = erc20Reserve.cache();
        ValidationLogic.validateSupply(
            erc20ReserveCache,
            amount,
            DataTypes.AssetType.ERC20
        );
        bool isFirstSupply = IPToken(erc20Reserve.xTokenAddress).mint(
            msg.sender,
            msg.sender,
            amount,
            WadRayMath.RAY
        );

        if (isFirstSupply) {
            DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
                msg.sender
            ];
            userConfig.setUsingAsCollateral(erc20Reserve.id, true);
            emit ReserveUsedAsCollateralEnabled(
                DataTypes.SApeAddress,
                msg.sender
            );
        }
    }

    function executeWithdrawSApe(
        DataTypes.PoolStorage storage ps,
        uint256 amountToWithdraw
    ) internal {
        DataTypes.ReserveData storage erc20Reserve = ps._reserves[
            DataTypes.SApeAddress
        ];
        DataTypes.ReserveCache memory erc20ReserveCache = erc20Reserve.cache();
        uint256 userBalance = IPToken(erc20ReserveCache.xTokenAddress)
            .balanceOf(msg.sender);
        ValidationLogic.validateWithdraw(
            erc20ReserveCache,
            amountToWithdraw,
            userBalance
        );
        IPToken(erc20Reserve.xTokenAddress).burn(
            msg.sender,
            msg.sender,
            amountToWithdraw,
            WadRayMath.RAY
        );

        DataTypes.UserConfigurationMap storage userConfig = ps._usersConfig[
            msg.sender
        ];
        if (userConfig.isUsingAsCollateral(erc20Reserve.id)) {
            if (userConfig.isBorrowingAny()) {
                ValidationLogic.validateHFAndLtvERC20(
                    ps._reserves,
                    ps._reservesList,
                    userConfig,
                    DataTypes.SApeAddress,
                    msg.sender,
                    ps._reservesCount,
                    ADDRESSES_PROVIDER.getPriceOracle()
                );
            }

            if (amountToWithdraw == userBalance) {
                userConfig.setUsingAsCollateral(erc20Reserve.id, false);
                emit ReserveUsedAsCollateralDisabled(
                    DataTypes.SApeAddress,
                    msg.sender
                );
            }
        }
    }
}
