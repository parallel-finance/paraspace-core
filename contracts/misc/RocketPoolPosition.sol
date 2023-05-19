// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {ERC721Enumerable} from "../dependencies/openzeppelin/contracts/ERC721Enumerable.sol";
import {ERC721} from "../dependencies/openzeppelin/contracts/ERC721.sol";
import {ReentrancyGuard} from "../dependencies/openzeppelin/contracts/ReentrancyGuard.sol";
import {AccessControl} from "../dependencies/openzeppelin/contracts/AccessControl.sol";
import {Initializable} from "../dependencies/openzeppelin/upgradeability/Initializable.sol";
import {RocketStorageInterface} from "../dependencies/rocketpool/interfaces/RocketStorageInterface.sol";
import {RocketMinipoolInterface} from "../dependencies/rocketpool/interfaces/RocketMinipoolInterface.sol";
import {MinipoolStatus} from "../dependencies/rocketpool/interfaces/MinipoolStatus.sol";
import {IAtomicPriceAggregator} from "../interfaces/IAtomicPriceAggregator.sol";
import {Helpers} from "../protocol/libraries/helpers/Helpers.sol";

contract RocketPoolPosition is
    Initializable,
    ReentrancyGuard,
    AccessControl,
    ERC721Enumerable,
    IAtomicPriceAggregator
{
    bytes32 public constant DEFAULT_ISSUER_ROLE = keccak256("DEFAULT_ISSUER");
    RocketStorageInterface private immutable rocketStorage;

    //mapping of nodeAddress => tokenId , there is no token id 0
    mapping(address => uint256) private miniPoolAddressTokenId;
    mapping(uint256 => address) private tokenIdMiniPoolAddress;
    bool private allowReceiveETH;

    uint256 public existingTokenId;

    constructor(address _rocketStorage)
        ERC721("ParaSpace Rocket Pool Position", "ParaSpace-RocketPool")
    {
        rocketStorage = RocketStorageInterface(_rocketStorage);
    }

    function initialize(address _admin) public initializer {
        require(_admin != address(0), "Address cannot be zero");
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        _setupRole(DEFAULT_ISSUER_ROLE, _admin);
    }

    function mint(address miniPoolAddress, address to)
        external
        onlyRole(DEFAULT_ISSUER_ROLE)
    {
        //check mini pool address have not been minted
        require(miniPoolAddressTokenId[miniPoolAddress] == 0);

        RocketMinipoolInterface MiniPool = RocketMinipoolInterface(
            miniPoolAddress
        );
        //check minipool is Staking status
        MinipoolStatus status = MiniPool.getStatus();
        require(status == MinipoolStatus.Staking);

        //check nodeAddress's withdraw address is address(this)
        address nodeAddress = MiniPool.getNodeAddress();
        address withdrawAddress = rocketStorage.getNodeWithdrawalAddress(
            nodeAddress
        );
        require(withdrawAddress == address(this));

        uint256 nextTokenId = existingTokenId + 1;
        existingTokenId = nextTokenId;
        miniPoolAddressTokenId[miniPoolAddress] = nextTokenId;
        tokenIdMiniPoolAddress[nextTokenId] = miniPoolAddress;
        _mint(to, nextTokenId);
    }

    function burn(uint256 tokenId, address newWithdrawAddress) external {
        require(ownerOf(tokenId) == msg.sender);

        address miniPool = tokenIdMiniPoolAddress[tokenId];
        address nodeAddress = RocketMinipoolInterface(miniPool)
            .getNodeAddress();
        rocketStorage.setWithdrawalAddress(
            nodeAddress,
            newWithdrawAddress,
            true
        );

        _clearAndBurn(miniPool, tokenId);
    }

    function finaliseAndBurn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender);

        allowReceiveETH = true;
        address miniPool = tokenIdMiniPoolAddress[tokenId];
        RocketMinipoolInterface MiniPool = RocketMinipoolInterface(miniPool);
        MiniPool.finalise();
        //here is the only way to receive ETH, so we can transfer all balance to owner
        Helpers.safeTransferETH(msg.sender, address(this).balance);
        allowReceiveETH = false;

        _clearAndBurn(miniPool, tokenId);
    }

    /**
     * @notice Returns the price for the specified tokenId.
     */
    function getTokenPrice(uint256 tokenId) public view returns (uint256) {
        address miniPool = tokenIdMiniPoolAddress[tokenId];
        RocketMinipoolInterface MiniPool = RocketMinipoolInterface(miniPool);
        uint256 nodeDepositBalance = MiniPool.getNodeDepositBalance();
        uint256 nodeRefundBalance = MiniPool.getNodeRefundBalance();
        uint256 nodePendingReward = MiniPool.calculateNodeShare(
            miniPool.balance - nodeRefundBalance
        );
        return nodeDepositBalance + nodeRefundBalance + nodePendingReward;
    }

    function _clearAndBurn(address miniPool, uint256 tokenId) internal {
        delete miniPoolAddressTokenId[miniPool];
        delete tokenIdMiniPoolAddress[tokenId];

        _burn(tokenId);
    }

    receive() external payable {
        //since we reject the ETH receive, only we can finalise the minipool
        require(allowReceiveETH, "not allowed");
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
