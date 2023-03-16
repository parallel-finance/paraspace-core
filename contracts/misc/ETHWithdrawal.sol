// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IETHWithdrawal} from "../misc/interfaces/IETHWithdrawal.sol";
import {ERC1155} from "../dependencies/openzeppelin/contracts/ERC1155.sol";
import {IERC721} from "../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC721Receiver} from "../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IERC20} from "../dependencies/openzeppelin/contracts/IERC20.sol";
import {AccessControl} from "../dependencies/openzeppelin/contracts/AccessControl.sol";
import {Initializable} from "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import {Helpers} from "../protocol/libraries/helpers/Helpers.sol";
import {ReentrancyGuard} from "../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import {SafeERC20} from "../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {WadRayMath} from "../protocol/libraries/math/WadRayMath.sol";
import {MathUtils} from "../protocol/libraries/math/MathUtils.sol";
import {IETHStakingProviderStrategy} from "../interfaces/IETHStakingProviderStrategy.sol";
import {Base64} from "../dependencies/openzeppelin/contracts/Base64.sol";
import "hardhat/console.sol";

error Unimplemented();
error AlreadyMature();
error AlreadyMinted();
error NotMature();
error InvalidParams();

contract ETHWithdrawal is
    Initializable,
    ReentrancyGuard,
    AccessControl,
    ERC1155,
    IERC721Receiver,
    IETHWithdrawal
{
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    bytes32 public constant DEFAULT_ISSUER_ROLE = keccak256("DEFAULT_ISSUER");
    uint64 public constant TOTAL_SHARES = 10000;

    mapping(uint256 => IETHWithdrawal.TokenInfo) private tokenInfos;
    mapping(IETHWithdrawal.StakingProvider => address)
        public providerStrategyAddress;

    uint256 public nextTokenId;

    constructor(string memory uri_) ERC1155(uri_) {}

    function initialize(address _admin) public initializer {
        require(_admin != address(0), "Address cannot be zero");
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(DEFAULT_ISSUER_ROLE, _admin);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC1155)
        returns (bool)
    {
        return
            interfaceId == type(IETHWithdrawal).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @inheritdoc IETHWithdrawal
    function mint(
        IETHWithdrawal.StakingProvider provider,
        uint64 exitEpoch,
        uint64 withdrawableEpoch,
        uint256 balance,
        address recipient,
        uint256 withdrawableTime
    )
        external
        nonReentrant
        onlyRole(DEFAULT_ISSUER_ROLE)
        returns (uint256 tokenId)
    {
        if (provider == IETHWithdrawal.StakingProvider.Validator) {
            if (block.timestamp >= withdrawableTime) {
                revert AlreadyMature();
            }

            if (recipient == address(0) || balance == 0) {
                revert InvalidParams();
            }

            tokenId = nextTokenId++;

            if (tokenInfos[tokenId].balance > 0) {
                revert AlreadyMinted();
            }

            tokenInfos[tokenId] = IETHWithdrawal.TokenInfo(
                provider,
                exitEpoch,
                withdrawableEpoch,
                balance,
                withdrawableTime
            );
            _mint(recipient, tokenId, TOTAL_SHARES, bytes(""));
            emit Mint(recipient, tokenId, TOTAL_SHARES);
        } else {
            revert Unimplemented();
        }
    }

    /// @inheritdoc IETHWithdrawal
    function burn(
        uint256 tokenId,
        address recipient,
        uint64 shares
    ) external nonReentrant {
        TokenInfo memory tokenInfo = tokenInfos[tokenId];
        if (tokenInfo.provider == IETHWithdrawal.StakingProvider.Validator) {
            if (block.timestamp < tokenInfo.withdrawableTime) {
                revert NotMature();
            }

            uint256 amount = (tokenInfo.balance * shares) / TOTAL_SHARES;
            if (amount == 0) {
                return;
            }

            Helpers.safeTransferETH(recipient, amount);
            _burn(msg.sender, tokenId, shares);
            emit Burn(msg.sender, tokenId, shares);
        } else {
            revert Unimplemented();
        }
    }

    /// @inheritdoc IETHWithdrawal
    function getPresentValueAndDiscountRate(
        uint256 tokenId,
        uint64 shares,
        uint256 borrowRate
    ) external view returns (uint256 price, uint256 discountRate) {
        IETHWithdrawal.TokenInfo memory tokenInfo = tokenInfos[tokenId];

        IETHStakingProviderStrategy strategy = IETHStakingProviderStrategy(
            providerStrategyAddress[tokenInfo.provider]
        );

        uint256 amount = (tokenInfo.balance * shares) / TOTAL_SHARES;
        discountRate = strategy.getDiscountRate(tokenInfo, borrowRate);
        price = strategy.getTokenPresentValue(tokenInfo, amount, discountRate);
    }

    /// @inheritdoc IETHWithdrawal
    function getPresentValueByDiscountRate(
        uint256 tokenId,
        uint64 shares,
        uint256 discountRate
    ) external view returns (uint256 price) {
        IETHWithdrawal.TokenInfo memory tokenInfo = tokenInfos[tokenId];
        IETHStakingProviderStrategy strategy = IETHStakingProviderStrategy(
            providerStrategyAddress[tokenInfo.provider]
        );

        uint256 amount = (tokenInfo.balance * shares) / TOTAL_SHARES;
        price = strategy.getTokenPresentValue(tokenInfo, amount, discountRate);
    }

    /// @inheritdoc IETHWithdrawal
    function setProviderStrategyAddress(
        IETHWithdrawal.StakingProvider provider,
        address strategy
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        providerStrategyAddress[provider] = strategy;
    }

    /// @inheritdoc IETHWithdrawal
    function getTokenInfo(uint256 tokenId)
        external
        view
        returns (TokenInfo memory)
    {
        return tokenInfos[tokenId];
    }

    receive() external payable {}

    /**
     * @dev Transfers any ETH that has been sent to this contract to the specified recipient.
     * @param to The address of the recipient.
     * @param value The amount of ETH to transfer.
     * @notice This function can only be called by accounts with the DEFAULT_ADMIN_ROLE.
     */
    function rescueETH(address to, uint256 value)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Helpers.safeTransferETH(to, value);
        emit RescueETH(to, value);
    }

    /**
     * @dev Transfers any ERC20 tokens held by this contract to the specified recipient.
     * @param token The address of the ERC20 token to transfer.
     * @param to The address of the recipient.
     * @param amount The amount of ERC20 tokens to transfer.
     * @notice This function can only be called by accounts with the DEFAULT_ADMIN_ROLE.
     */
    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    /**
     * @dev Transfers any ERC721 tokens held by this contract to the specified recipient.
     * @param token The address of the ERC721 token to transfer.
     * @param to The address of the recipient.
     * @param ids An array of the token IDs to transfer.
     * @notice This function can only be called by accounts with the DEFAULT_ADMIN_ROLE.
     */
    function rescueERC721(
        address token,
        address to,
        uint256[] calldata ids
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < ids.length; i++) {
            IERC721(token).safeTransferFrom(address(this), to, ids[i]);
        }
        emit RescueERC721(token, to, ids);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function uri(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        // TokenInfo memory tokenInfo = tokenInfos[tokenId];
        string memory defs = string(
            abi.encodePacked(
                '<svg viewBox="0 0 500 500" width="500" height="500" xmlns="http://www.w3.org/2000/svg">',
                "<defs>",
                '<clipPath id="clip0_448_33995"><rect width="500" height="500" fill="white"/></clipPath>',
                '<clipPath id="clip1_448_33995"><rect width="202.032" height="202.032" fill="white" transform="translate(150.484 84)"/></clipPath>',
                "</defs>"
            )
        );
        string memory body = string(
            abi.encodePacked(
                '<g clip-path="url(#clip0_448_33995)" transform="matrix(1, 0, 0, 1, 0.678454, 1.356856)">',
                '<rect width="500" height="500" style="fill: rgb(58, 50, 50); fill-opacity: 0.19;"/>',
                '<g clip-path="url(#clip1_448_33995)">',
                '<g opacity="0.7">',
                '<path d="M251.482 84L250.126 88.604V222.191L251.482 223.543L313.49 186.889L251.482 84Z" style="fill: rgb(58, 50, 50); fill-opacity: 0.19;"/>',
                '<path d="M251.482 84L189.472 186.889L251.482 223.543V158.704V84Z" style="fill: rgb(58, 50, 50); fill-opacity: 0.19;"/>',
                '<path d="M251.482 235.283L250.718 236.215V283.801L251.482 286.031L313.528 198.649L251.482 235.283Z" style="fill: rgb(58, 50, 50); fill-opacity: 0.19;"/>',
                '<path d="M251.482 286.031V235.283L189.472 198.649L251.482 286.031Z" style="fill: rgb(58, 50, 50); fill-opacity: 0.19;"/>',
                '<path d="M251.482 223.543L313.49 186.889L251.482 158.704V223.543Z" style="fill: rgb(58, 50, 50); fill-opacity: 0.19;"/>',
                "</g>",
                "</g>",
                '<path d="M251.482 235.283L250.718 236.215V283.8L251.482 286.03L313.528 198.648L251.482 235.283Z" style="fill: rgb(58, 50, 50); fill-opacity: 1;"/>',
                '<path d="M251.482 84L189.472 186.889L251.482 223.543V158.704V84Z" style="fill: rgb(58, 50, 50); fill-opacity: 1;"/>',
                '<path d="M189.472 186.889L251.482 223.543V158.704L189.472 186.889Z" style="fill: rgb(58, 50, 50); fill-opacity: 1;"/>',
                '<rect opacity="0.1" width="500" height="500" x="-1.359" style="fill: rgb(58, 50, 50); fill-opacity: 0.02;"/>'
            )
        );
        string memory logo = string(
            abi.encodePacked(
                '<path d="M462.5 462.963C456.491 469.474 449.861 473.129 447.691 471.126C445.521 469.123 448.632 462.222 454.64 455.711C460.649 449.2 467.279 445.546 469.449 447.548C471.619 449.551 468.508 456.453 462.5 462.963Z" style="fill: rgb(58, 50, 50); fill-opacity: 1;"/>',
                '<path d="M464.355 464.758C467.559 461.286 471.213 459.445 472.515 460.647C473.817 461.848 472.275 465.637 469.07 469.11C465.866 472.582 462.213 474.423 460.911 473.221C459.608 472.02 461.15 468.231 464.355 464.758Z" style="fill: rgb(58, 50, 50); fill-opacity: 1;"/>'
            )
        );
        string memory footer = string(
            abi.encodePacked(
                '<text style="fill: rgb(51, 51, 51); font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; white-space: pre;" x="210.531" y="464.604">Validator</text>'
                '<text style="fill: rgb(51, 51, 51); font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; white-space: pre;" x="302.886" y="464.643">Never</text>'
                '<text style="fill: rgb(51, 51, 51); font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; white-space: pre;" x="140.451" y="463.925">2.452</text>'
            )
        );
        string memory balance = string(
            abi.encodePacked(
                '<text style="fill: rgb(255, 255, 255); fill-opacity: 0.23; font-family: Arial, sans-serif; font-size: 90px; font-weight: 700; letter-spacing: 20px; paint-order: stroke; stroke: rgb(0, 0, 0); stroke-width: 3px; text-anchor: middle; white-space: pre;" x="256.426" y="412.142">32</text>'
            )
        );
        string memory date = string(
            abi.encodePacked(
                '<text style="fill: rgba(51, 51, 51, 0.93); font-family: Arial, sans-serif; font-size: 25.4px; font-weight: 700; white-space: pre;" x="202.446" y="318.237">1/3/2023</text>'
            )
        );
        string memory image = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        defs,
                        body,
                        logo,
                        date,
                        balance,
                        footer,
                        "</g>",
                        "</svg>"
                    )
                )
            )
        );
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(
                        bytes(
                            abi.encodePacked(
                                '{"name":"',
                                "ParaSpace ETH Instant Unstake NFT",
                                '", "description":"',
                                "This NFT represents a bond in ParaSpace",
                                '", "image": "',
                                "data:image/svg+xml;base64,",
                                image,
                                '"}'
                            )
                        )
                    )
                )
            );
    }
}
