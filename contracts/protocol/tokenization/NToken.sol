// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC1155} from "../../dependencies/openzeppelin/contracts/IERC1155.sol";
import {IERC721Metadata} from "../../dependencies/openzeppelin/contracts/IERC721Metadata.sol";
import {Address} from "../../dependencies/openzeppelin/contracts/Address.sol";
import {GPv2SafeERC20} from "../../dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {SafeCast} from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import {VersionedInitializable} from "../libraries/paraspace-upgradeability/VersionedInitializable.sol";
import {Errors} from "../libraries/helpers/Errors.sol";
import {WadRayMath} from "../libraries/math/WadRayMath.sol";
import {IPool} from "../../interfaces/IPool.sol";
import {INToken} from "../../interfaces/INToken.sol";
import {IRewardController} from "../../interfaces/IRewardController.sol";
import {IInitializableNToken} from "../../interfaces/IInitializableNToken.sol";
import {ScaledBalanceTokenBaseERC721} from "./base/ScaledBalanceTokenBaseERC721.sol";
import {IncentivizedERC20} from "./base/IncentivizedERC20.sol";
import {EIP712Base} from "./base/EIP712Base.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";

/**
 * @title ParaSpace ERC20 PToken
 *
 * @notice Implementation of the interest bearing token for the ParaSpace protocol
 */
contract NToken is
    VersionedInitializable,
    ScaledBalanceTokenBaseERC721,
    EIP712Base,
    INToken
{
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );

    uint256 public constant NTOKEN_REVISION = 0x1;

    address internal _treasury;

    /// @inheritdoc VersionedInitializable
    function getRevision() internal pure virtual override returns (uint256) {
        return NTOKEN_REVISION;
    }

    /**
     * @dev Constructor.
     * @param pool The address of the Pool contract
     */
    constructor(IPool pool, bool atomic_pricing)
        ScaledBalanceTokenBaseERC721(
            pool,
            "NTOKEN_IMPL",
            "NTOKEN_IMPL",
            atomic_pricing
        )
    {}

    function initialize(
        IPool initializingPool,
        address treasury,
        address underlyingAsset,
        IRewardController incentivesController,
        string calldata nTokenName,
        string calldata nTokenSymbol,
        bytes calldata params
    ) external override initializer {
        require(initializingPool == POOL, Errors.POOL_ADDRESSES_DO_NOT_MATCH);
        _setName(nTokenName);
        _setSymbol(nTokenSymbol);

        _treasury = treasury;
        _underlyingAsset = underlyingAsset;
        _rewardController = incentivesController;

        _domainSeparator = _calculateDomainSeparator();

        emit Initialized(
            underlyingAsset,
            address(POOL),
            treasury,
            address(incentivesController),
            nTokenName,
            nTokenSymbol,
            params
        );
    }

    /// @inheritdoc INToken
    function mint(
        address onBehalfOf,
        DataTypes.ERC721SupplyParams[] calldata tokenData
    ) external virtual override onlyPool nonReentrant returns (bool) {
        return _mintMultiple(onBehalfOf, tokenData);
    }

    /// @inheritdoc INToken
    function burn(
        address from,
        address receiverOfUnderlying,
        uint256[] calldata tokenIds
    ) external virtual override onlyPool nonReentrant returns (bool) {
        bool isLastUncollateralized = _burnMultiple(from, tokenIds);

        if (receiverOfUnderlying != address(this)) {
            for (uint256 index = 0; index < tokenIds.length; index++) {
                IERC721(_underlyingAsset).safeTransferFrom(
                    address(this),
                    receiverOfUnderlying,
                    tokenIds[index]
                );
            }
        }

        return isLastUncollateralized;
    }

    /// @inheritdoc INToken
    function transferOnLiquidation(
        address from,
        address to,
        uint256 value
    ) external override onlyPool nonReentrant {
        // Being a normal transfer, the Transfer() and BalanceTransfer() are emitted
        // so no need to emit a specific event here
        _transfer(from, to, value, false);
    }

    function claimERC20Airdrop(
        address token,
        address to,
        uint256 amount
    ) external override onlyPoolAdmin {
        require(
            token != _underlyingAsset,
            Errors.UNDERLYING_ASSET_CAN_NOT_BE_TRANSFERRED
        );
        require(
            token != address(this),
            Errors.TOKEN_TRANSFERRED_CAN_NOT_BE_SELF_ADDRESS
        );
        IERC20(token).transfer(to, amount);
        emit ClaimERC20Airdrop(token, to, amount);
    }

    function claimERC721Airdrop(
        address token,
        address to,
        uint256[] calldata ids
    ) external override onlyPoolAdmin {
        require(
            token != _underlyingAsset,
            Errors.UNDERLYING_ASSET_CAN_NOT_BE_TRANSFERRED
        );
        require(
            token != address(this),
            Errors.TOKEN_TRANSFERRED_CAN_NOT_BE_SELF_ADDRESS
        );
        for (uint256 i = 0; i < ids.length; i++) {
            IERC721(token).safeTransferFrom(address(this), to, ids[i]);
        }
        emit ClaimERC721Airdrop(token, to, ids);
    }

    function claimERC1155Airdrop(
        address token,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external override onlyPoolAdmin {
        require(
            token != _underlyingAsset,
            Errors.UNDERLYING_ASSET_CAN_NOT_BE_TRANSFERRED
        );
        require(
            token != address(this),
            Errors.TOKEN_TRANSFERRED_CAN_NOT_BE_SELF_ADDRESS
        );
        IERC1155(token).safeBatchTransferFrom(
            address(this),
            to,
            ids,
            amounts,
            data
        );
        emit ClaimERC1155Airdrop(token, to, ids, amounts, data);
    }

    function executeAirdrop(
        address airdropContract,
        bytes calldata airdropParams
    ) external override onlyPoolAdmin {
        require(
            airdropContract != address(0),
            Errors.INVALID_AIRDROP_CONTRACT_ADDRESS
        );
        require(airdropParams.length >= 4, Errors.INVALID_AIRDROP_PARAMETERS);

        // call project airdrop contract
        Address.functionCall(
            airdropContract,
            airdropParams,
            Errors.CALL_AIRDROP_METHOD_FAILED
        );

        emit ExecuteAirdrop(airdropContract);
    }

    /// @inheritdoc INToken
    function RESERVE_TREASURY_ADDRESS()
        external
        view
        override
        returns (address)
    {
        return _treasury;
    }

    /// @inheritdoc INToken
    function UNDERLYING_ASSET_ADDRESS()
        external
        view
        override
        returns (address)
    {
        return _underlyingAsset;
    }

    /// @inheritdoc INToken
    function transferUnderlyingTo(address target, uint256 tokenId)
        external
        virtual
        override
        onlyPool
        nonReentrant
    {
        IERC721(_underlyingAsset).safeTransferFrom(
            address(this),
            target,
            tokenId
        );
    }

    /// @inheritdoc INToken
    function handleRepayment(address user, uint256 amount)
        external
        virtual
        override
        onlyPool
        nonReentrant
    {
        // Intentionally left blank
    }

    /// @inheritdoc INToken
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        require(owner != address(0), Errors.ZERO_ADDRESS_NOT_VALID);
        //solium-disable-next-line
        require(block.timestamp <= deadline, Errors.INVALID_EXPIRATION);
        uint256 currentValidNonce = _nonces[owner];
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        PERMIT_TYPEHASH,
                        owner,
                        spender,
                        value,
                        currentValidNonce,
                        deadline
                    )
                )
            )
        );
        require(owner == ecrecover(digest, v, r, s), Errors.INVALID_SIGNATURE);
        _nonces[owner] = currentValidNonce + 1;
        _approve(spender, value);
    }

    /**
     * @notice Transfers the nTokens between two users. Validates the transfer
     * (ie checks for valid HF after the transfer) if required
     * @param from The source address
     * @param to The destination address
     * @param tokenId The amount getting transferred
     * @param validate True if the transfer needs to be validated, false otherwise
     **/
    function _transfer(
        address from,
        address to,
        uint256 tokenId,
        bool validate
    ) internal {
        address underlyingAsset = _underlyingAsset;

        uint256 fromBalanceBefore = collaterizedBalanceOf(from);
        uint256 toBalanceBefore = collaterizedBalanceOf(to);
        bool isUsedAsCollateral = _transferCollaterizable(from, to, tokenId);

        if (validate) {
            POOL.finalizeTransferERC721(
                underlyingAsset,
                from,
                to,
                isUsedAsCollateral,
                fromBalanceBefore,
                toBalanceBefore
            );
        }

        // emit BalanceTransfer(from, to, tokenId, index); TODO emit a transfer event
    }

    /**
     * @notice Overrides the parent _transfer to force validated transfer() and transferFrom()
     * @param from The source address
     * @param to The destination address
     * @param tokenId The token id getting transferred
     **/
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        _transfer(from, to, tokenId, true);
    }

    /**
     * @dev Overrides the base function to fully implement INToken
     * @dev see `IncentivizedERC20.DOMAIN_SEPARATOR()` for more detailed documentation
     */
    function DOMAIN_SEPARATOR()
        public
        view
        override(INToken, EIP712Base)
        returns (bytes32)
    {
        return super.DOMAIN_SEPARATOR();
    }

    /**
     * @dev Overrides the base function to fully implement INToken
     * @dev see `IncentivizedERC20.nonces()` for more detailed documentation
     */
    function nonces(address owner)
        public
        view
        override(INToken, EIP712Base)
        returns (uint256)
    {
        return super.nonces(owner);
    }

    /// @inheritdoc EIP712Base
    function _EIP712BaseId() internal view override returns (string memory) {
        return name();
    }

    /// @inheritdoc INToken
    function rescueTokens(
        address token,
        address to,
        uint256 tokenId
    ) external override onlyPoolAdmin {
        require(token != _underlyingAsset, Errors.UNDERLYING_CANNOT_BE_RESCUED);

        IERC721(token).safeTransferFrom(address(this), to, tokenId);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external pure override returns (bytes4) {
        operator;
        from;
        id;
        value;
        data;
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external pure override returns (bytes4) {
        operator;
        from;
        ids;
        values;
        data;
        return this.onERC1155BatchReceived.selector;
    }

    /**
     * @dev See {IERC721Metadata-tokenURI}.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        return IERC721Metadata(_underlyingAsset).tokenURI(tokenId);
    }

    function getAtomicPricingConfig() external view returns (bool) {
        return ATOMIC_PRICING;
    }
}
