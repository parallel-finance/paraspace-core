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
        INToken nToken = INToken(nftReserve.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenBAYC ||
                nToken.getXTokenType() == XTokenType.NTokenMAYC,
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
        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(
            nftReserve.xTokenAddress
        );
        nTokenApeStaking.getApeStaking().apeCoin().safeTransferFrom(
            msg.sender,
            nftReserve.xTokenAddress,
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
        INToken nToken = INToken(nftReserve.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenBAYC ||
                nToken.getXTokenType() == XTokenType.NTokenMAYC,
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
        INToken nToken = INToken(nftReserve.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenBAYC ||
                nToken.getXTokenType() == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );
        for (uint256 index = 0; index < _nfts.length; index++) {
            require(
                nToken.ownerOf(_nfts[index]) == msg.sender,
                Errors.NOT_THE_OWNER
            );
        }

        INTokenApeStaking(nftReserve.xTokenAddress).claimApeCoin(
            _nfts,
            msg.sender
        );
    }

    function depositBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithAmount[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        INToken nToken = INToken(nftReserve.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenBAYC ||
                nToken.getXTokenType() == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(
            nftReserve.xTokenAddress
        );
        IERC721 bakcContract = nTokenApeStaking.getBAKC();
        uint256 totalAmount = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                nToken.ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
            totalAmount += _nftPairs[index].amount;

            if (
                bakcContract.ownerOf(_nftPairs[index].bakcTokenId) !=
                address(this)
            ) {
                bakcContract.safeTransferFrom(
                    msg.sender,
                    nftReserve.xTokenAddress,
                    _nftPairs[index].bakcTokenId
                );
            }
        }
        nTokenApeStaking.getApeStaking().apeCoin().safeTransferFrom(
            msg.sender,
            nftReserve.xTokenAddress,
            totalAmount
        );

        executeSupplySApe(ps, totalAmount);

        nTokenApeStaking.depositBAKC(_nftPairs);
    }

    function withdrawBAKC(
        address nftAsset,
        ApeCoinStaking.PairNftWithAmount[] memory _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        INToken nToken = INToken(nftReserve.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenBAYC ||
                nToken.getXTokenType() == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(
            nftReserve.xTokenAddress
        );
        IERC721 bakcContract = nTokenApeStaking.getBAKC();
        uint256 amountToWithdraw = 0;
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                nToken.ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
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
            if (_nftPairs[index].amount == stakedAmount) {
                bakcContract.safeTransferFrom(
                    nftReserve.xTokenAddress,
                    msg.sender,
                    _nftPairs[index].bakcTokenId
                );
            }
            amountToWithdraw += _nftPairs[index].amount;
        }

        executeWithdrawSApe(ps, amountToWithdraw);

        INTokenApeStaking(nftReserve.xTokenAddress).withdrawBAKC(
            _nftPairs,
            msg.sender
        );
    }

    function claimBAKC(
        address nftAsset,
        ApeCoinStaking.PairNft[] calldata _nftPairs
    ) external nonReentrant {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        INToken nToken = INToken(nftReserve.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenBAYC ||
                nToken.getXTokenType() == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );
        for (uint256 index = 0; index < _nftPairs.length; index++) {
            require(
                nToken.ownerOf(_nftPairs[index].mainTokenId) == msg.sender,
                Errors.NOT_THE_OWNER
            );
        }

        INTokenApeStaking(nftReserve.xTokenAddress).claimBAKC(
            _nftPairs,
            msg.sender
        );
    }

    function unstakeApePositionAndRepay(address nftAsset, uint256 tokenId)
        external
        nonReentrant
    {
        DataTypes.PoolStorage storage ps = poolStorage();
        DataTypes.ReserveData storage nftReserve = ps._reserves[nftAsset];
        INToken nToken = INToken(nftReserve.xTokenAddress);
        require(
            nToken.getXTokenType() == XTokenType.NTokenBAYC ||
                nToken.getXTokenType() == XTokenType.NTokenMAYC,
            Errors.INVALID_ASSET_TYPE
        );

        INTokenApeStaking nTokenApeStaking = INTokenApeStaking(
            nftReserve.xTokenAddress
        );
        nTokenApeStaking.unstakePositionAndRepay(tokenId, msg.sender);
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
