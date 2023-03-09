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

    mapping(uint256 => IETHWithdrawal.TokenInfo) private tokenInfos;

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

    function mint(
        IETHWithdrawal.StakingProvider provider,
        uint64 exitEpoch,
        uint64 withdrawableEpoch,
        uint256 balance,
        address recipient,
        uint256 withdrawableTime
    ) external nonReentrant onlyRole(DEFAULT_ISSUER_ROLE) {
        if (provider == IETHWithdrawal.StakingProvider.Validator) {
            if (block.timestamp >= withdrawableTime) {
                revert AlreadyMature();
            }

            if (recipient == address(0) || balance == 0) {
                revert InvalidParams();
            }

            uint256 tokenId = nextTokenId++;

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
            _mint(recipient, tokenId, balance, bytes(""));
        } else {
            revert Unimplemented();
        }
    }

    function burn(
        uint256 tokenId,
        address recipient,
        uint256 amount
    ) external nonReentrant {
        TokenInfo memory tokenInfo = tokenInfos[tokenId];
        if (tokenInfo.provider == IETHWithdrawal.StakingProvider.Validator) {
            if (block.timestamp < tokenInfo.withdrawableTime) {
                revert NotMature();
            }

            Helpers.safeTransferETH(recipient, tokenInfo.balance);
            _burn(msg.sender, tokenId, amount);
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
        return tokenInfo.balance.rayDiv(discountRate);
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
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
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
