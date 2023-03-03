// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IETHWithdrawal} from "../misc/interfaces/IETHWithdrawal.sol";
import {ERC721Enumerable} from "../dependencies/openzeppelin/contracts/ERC721Enumerable.sol";
import {ERC721} from "../dependencies/openzeppelin/contracts/ERC721.sol";
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

error Unimplemented();
error AlreadyMature();
error NotMature();
error InvalidRecipient();
error NotOwner();

contract ETHWithdrawal is
    Initializable,
    ReentrancyGuard,
    AccessControl,
    ERC721Enumerable,
    IERC721Receiver,
    IETHWithdrawal
{
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    bytes32 public constant DEFAULT_ISSUER = keccak256("DEFAULT_ISSUER");

    mapping(uint256 => IETHWithdrawal.TokenInfo) private tokenInfos;

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
    {}

    function initialize(address _admin) public initializer {
        require(_admin != address(0), "Address cannot be zero");
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC721Enumerable)
        returns (bool)
    {
        return
            interfaceId == type(IETHWithdrawal).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function mint(
        IETHWithdrawal.StakingProvider provider,
        uint64 tokenId,
        uint64 exitEpoch,
        uint64 withdrawableEpoch,
        uint256 balance,
        address recipient,
        uint256 withdrawableTime
    ) external nonReentrant onlyRole(DEFAULT_ISSUER) {
        if (provider == IETHWithdrawal.StakingProvider.Validator) {
            if (block.timestamp >= withdrawableTime) {
                revert AlreadyMature();
            }

            if (recipient == address(0)) {
                revert InvalidRecipient();
            }

            tokenInfos[tokenId] = IETHWithdrawal.TokenInfo(
                provider,
                exitEpoch,
                withdrawableEpoch,
                balance,
                withdrawableTime
            );
            _mint(recipient, tokenId);
        } else {
            revert Unimplemented();
        }
    }

    function burn(uint256 tokenId, address recipient) external nonReentrant {
        TokenInfo memory tokenInfo = tokenInfos[tokenId];
        if (tokenInfo.provider == IETHWithdrawal.StakingProvider.Validator) {
            if (block.timestamp < tokenInfo.withdrawableTime) {
                revert NotMature();
            }

            address owner = ERC721.ownerOf(tokenId);
            if (owner != msg.sender) {
                revert NotOwner();
            }

            Helpers.safeTransferETH(recipient, tokenInfo.balance);
            _burn(tokenId);
        } else {
            revert Unimplemented();
        }
    }

    function getTokenPrice(uint256 tokenId, uint256 borrowRate)
        external
        view
        returns (uint256)
    {
        TokenInfo memory tokenInfo = tokenInfos[tokenId];
        if (block.timestamp >= tokenInfo.withdrawableTime) {
            return tokenInfo.balance;
        }
        uint256 discountRate = MathUtils.calculateCompoundedInterest(
            borrowRate,
            uint40(block.timestamp),
            tokenInfo.withdrawableTime
        );
        return tokenInfo.balance.rayMul(discountRate);
    }

    receive() external payable {}

    function rescueETH(address to, uint256 value)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Helpers.safeTransferETH(to, value);
    }

    function rescueERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ISSUER) {
        IERC20(token).safeTransfer(to, amount);
    }

    function rescueERC721(
        address token,
        address to,
        uint256[] calldata ids
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < ids.length; i++) {
            IERC721(token).safeTransferFrom(address(this), to, ids[i]);
        }
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
