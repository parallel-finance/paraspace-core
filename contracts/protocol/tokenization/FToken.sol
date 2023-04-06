// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {ERC1155} from "../../dependencies/openzeppelin/contracts/ERC1155.sol";
import {IERC721} from "../../dependencies/openzeppelin/contracts/IERC721.sol";
import {IERC721Receiver} from "../../dependencies/openzeppelin/contracts/IERC721Receiver.sol";
import {IERC20} from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import {AccessControl} from "../../dependencies/openzeppelin/contracts/AccessControl.sol";
import {Initializable} from "../../dependencies/openzeppelin/upgradeability/Initializable.sol";
import {ReentrancyGuard} from "../../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import {SafeERC20} from "../../dependencies/openzeppelin/contracts/SafeERC20.sol";
import {WadRayMath} from "../../protocol/libraries/math/WadRayMath.sol";
import {MathUtils} from "../../protocol/libraries/math/MathUtils.sol";
import {Strings} from "../../dependencies/openzeppelin/contracts/Strings.sol";
import {DataTypes} from "../libraries/types/DataTypes.sol";
import {EnumerableSet} from "../../dependencies/openzeppelin/contracts/EnumerableSet.sol";
import {ILoanManagementStrategy} from "../../interfaces/ILoanManagementStrategy.sol";

contract FToken is
    Initializable,
    ReentrancyGuard,
    AccessControl,
    ERC1155,
    IERC721Receiver
{
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;
    using Strings for uint256;
    using EnumerableSet for EnumerableSet.UintSet;

    uint64 public constant TOTAL_SHARES = 1E18;
    bytes32 public constant DEFAULT_ISSUER_ROLE = keccak256("DEFAULT_ISSUER");

    mapping(uint256 => DataTypes.FixedTermLoanData) public loans;
    mapping(address => EnumerableSet.UintSet) userLoans;

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
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function mint(
        address recipient,
        DataTypes.FixedTermLoanData calldata loanData,
        address loanManagementAddress
    )
        external
        nonReentrant
        onlyRole(DEFAULT_ISSUER_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = nextTokenId++;
        require(loans[tokenId].borrowAmount == 0, "loan exists");

        loans[tokenId] = loanData;
        userLoans[loanData.borrower].add(tokenId);

        _mint(recipient, tokenId, TOTAL_SHARES, bytes(""));
    }

    function burn(
        uint256 tokenId,
        address recipient,
        uint256 shares
    ) external nonReentrant {
        //check that loan has matured
        // transfer the loan entitlement to the holder

        DataTypes.FixedTermLoanData memory loanData = loans[tokenId];

        require(
            loans[tokenId].maturityDate <= block.timestamp,
            "Loan hasn't matured"
        );

        userLoans[loanData.borrower].remove(tokenId);
        _burn(msg.sender, tokenId, shares);

        // ILoanManagementStrategy(fixedTermLoanStrategy.loanManagementAddress)
        //     .redeem(loanData, shares, recipient);
    }

    function getLoanData(uint256 tokenId)
        external
        view
        returns (DataTypes.FixedTermLoanData memory)
    {
        return loans[tokenId];
    }

    receive() external payable {
        revert();
    }

    /**
     * @dev Emitted during rescueETH()
     * @param to The address of the recipient
     * @param amount The amount being rescued
     **/
    event RescueETH(address indexed to, uint256 amount);
    /**
     * @dev Emitted during rescueERC20()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param amount The amount being rescued
     **/
    event RescueERC20(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    /**
     * @dev Emitted during rescueERC721()
     * @param token The address of the token
     * @param to The address of the recipient
     * @param ids The ids of the tokens being rescued
     **/
    event RescueERC721(
        address indexed token,
        address indexed to,
        uint256[] ids
    );

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
}
