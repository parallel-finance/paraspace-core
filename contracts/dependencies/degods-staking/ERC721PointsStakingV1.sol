// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {ERC721HolderUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {SafeERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {EnumerableSetUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import {IERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol";

contract ERC721PointsStakingV1 is
UUPSUpgradeable,
ERC721HolderUpgradeable,
ReentrancyGuardUpgradeable,
Ownable2StepUpgradeable,
PausableUpgradeable
{
    error NoTokenIdsProvided();
    error NotTokenOwner();
    error InvalidManagerAddress();
    error NotManager();
    error PointsInitialized();
    error NotEnoughPoints();
    error TokenIdsPointsLengthMismatch();
    error InvalidStakedTokensArgs();
    error InvalidPointsMultiplier();
    error InitPointsAfterStaking();
    error InvalidInitialPoints();
    error InvalidStakeFee();
    error InvalidUnstakeFee();

    // All can be fit into a single 256-bit storage slot.
    // - 160 + 40 + 16 + 32 = 248
    struct StakingMetadata {
        address owner;
        uint40 lastUpdated;
        uint16 multiplier;
        uint32 points;
    }

    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    /* ========== STATE VARIABLES ========== */

    IERC721Upgradeable public stakingToken;

    // Same storage slot
    IERC20Upgradeable public stakeFeeToken;
    uint96 public stakeFee;

    // Same storage slot
    IERC20Upgradeable public unstakeFeeToken;
    uint96 public unstakeFee;

    // Same storage slot
    address public manager;
    uint32 public totalStaked;

    mapping(uint256 => StakingMetadata) public stakingMetadata;
    mapping(address => EnumerableSetUpgradeable.UintSet) internal _stakedTokens;

    uint16 private constant MIN_POINTS_MULTIPLIER = 100;
    uint16 private constant MAX_POINTS_MULTIPLIER = 1000;
    uint32 private constant MAX_INITIAL_POINTS = 250000;
    uint16 private constant MAX_STAKE_FEE = 100;
    uint16 private constant MAX_UNSTAKE_FEE = 100;

    uint96 private maxStakeFeeAmount;
    uint96 private maxUnstakeFeeAmount;

    address public feeTreasury;

    /* ========== CONSTRUCTOR ========== */

    function initialize(
        address _stakingToken,
        address _stakeFeeToken,
        uint256 _stakeFee,
        address _unstakeFeeToken,
        uint256 _unstakeFee,
        address _feeTreasury
    ) public initializer {
        __UUPSUpgradeable_init();
        __ERC721Holder_init();
        __ReentrancyGuard_init();
        __Ownable2Step_init();
        __Pausable_init();

        maxStakeFeeAmount = uint96(
            MAX_STAKE_FEE * (10 ** IERC20MetadataUpgradeable(_stakeFeeToken).decimals())
        );

        maxUnstakeFeeAmount = uint96(
            MAX_UNSTAKE_FEE * (10 ** IERC20MetadataUpgradeable(_unstakeFeeToken).decimals())
        );

        feeTreasury = _feeTreasury;
        stakingToken = IERC721Upgradeable(_stakingToken);
        stakeFeeToken = IERC20Upgradeable(_stakeFeeToken);
        unstakeFeeToken = IERC20Upgradeable(_unstakeFeeToken);
        _setFees(_stakeFee, _unstakeFee);
    }

    /* ========== VIEWS ========== */

    function getPoints(uint32 _tokenId) external view returns (uint32) {
        StakingMetadata memory metadata = stakingMetadata[_tokenId];
        if (metadata.owner == address(0)) {
            return metadata.points;
        }

        uint16 multiplier = metadata.multiplier == 0 ? 100 : metadata.multiplier;
        return
        uint32(
            metadata.points + ((block.timestamp - metadata.lastUpdated) * multiplier) / 6000
        );
    }

    function numStakedTokens(address owner) external view returns (uint256) {
        return _stakedTokens[owner].length();
    }

    function allStakedTokens(address owner) external view returns (uint256[] memory) {
        return _stakedTokens[owner].values();
    }

    function stakedTokens(
        address owner,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        EnumerableSetUpgradeable.UintSet storage stakedTokenSet = _stakedTokens[owner];
        uint256 endOffset = offset + limit;
        if (endOffset > stakedTokenSet.length()) {
            endOffset = stakedTokenSet.length();
        }
        if (limit == 0 || endOffset <= offset) {
            revert InvalidStakedTokensArgs();
        }
        uint256[] memory tokens = new uint256[](endOffset - offset);
        for (uint256 i = offset; i < endOffset; ++i) {
            tokens[i - offset] = stakedTokenSet.at(i);
        }
        return tokens;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */

    // @notice Stakes user's NFTs
    // @param tokenIds The tokenIds of the NFTs which will be staked
    function stake(uint256[] calldata _tokenIds) external nonReentrant whenNotPaused {
        if (_tokenIds.length == 0) {
            revert NoTokenIdsProvided();
        }
        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            // Transfer user's NFTs to the staking contract
            _stakeNft(_tokenIds[i]);
            // Transfer stake fee to the staking contract
            stakeFeeToken.safeTransferFrom(msg.sender, feeTreasury, stakeFee);
            StakingMetadata storage metadata = stakingMetadata[_tokenIds[i]];
            // Save who is the staker/depositor of the token
            metadata.owner = msg.sender;
            // Save the last updated timestamp for the current tokenId
            metadata.lastUpdated = uint40(block.timestamp);
        }
        _updateForStake(_tokenIds);
        emit Staked(msg.sender, _tokenIds.length, _tokenIds);
    }

    // @notice Withdraws staked user's NFTs
    // @param tokenIds The tokenIds of the NFTs which will be withdrawn
    function withdraw(uint256[] calldata _tokenIds) external nonReentrant {
        if (_tokenIds.length == 0) {
            revert NoTokenIdsProvided();
        }

        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            StakingMetadata storage metadata = stakingMetadata[_tokenIds[i]];
            // Check if the user who withdraws is the owner
            if (metadata.owner != msg.sender) {
                revert NotTokenOwner();
            }
            // Transfer NFTs back to the owner
            _unstakeNft(_tokenIds[i]);
            // Transfer unstake fee to the staking contract
            unstakeFeeToken.safeTransferFrom(msg.sender, feeTreasury, unstakeFee);
            _refreshPoints(_tokenIds[i]);
            // Cleanup the staking metadata for the current tokenId
            metadata.owner = address(0);
        }
        _updateForWithdraw(_tokenIds);
        emit Withdrawn(msg.sender, _tokenIds.length, _tokenIds);
    }

    function _stakeNft(uint256 tokenId) internal virtual {
        stakingToken.safeTransferFrom(msg.sender, address(this), tokenId);
    }

    function _unstakeNft(uint256 tokenId) internal virtual {
        stakingToken.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    function _refreshPoints(uint256 _tokenId) internal {
        StakingMetadata storage metadata = stakingMetadata[_tokenId];
        if (metadata.owner != address(0)) {
            // If the last updated time is not 0, it means that the tokenId is not new
            // and we need to update the points for the current tokenId
            uint16 multiplier = metadata.multiplier == 0 ? 100 : metadata.multiplier;
            metadata.points += uint32(
                ((block.timestamp - metadata.lastUpdated) * multiplier) / 6000
            );
            metadata.lastUpdated = uint40(block.timestamp);
        }
    }

    function _updateForStake(uint256[] calldata _tokenIds) internal {
        EnumerableSetUpgradeable.UintSet storage stakedTokenSet = _stakedTokens[msg.sender];
        totalStaked += uint32(_tokenIds.length);
        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            stakedTokenSet.add(_tokenIds[i]);
        }
    }

    function _updateForWithdraw(uint256[] calldata _tokenIds) internal {
        EnumerableSetUpgradeable.UintSet storage stakedTokenSet = _stakedTokens[msg.sender];
        totalStaked -= uint32(_tokenIds.length);
        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            stakedTokenSet.remove(_tokenIds[i]);
        }
    }

    // @notice Spend points (in future upgrades, it will be called by external methods when claiming rewards).
    // @param tokenIds The tokenIds of the NFTs which will be spent
    function _spendPoints(uint256 _tokenId, uint256 _points) internal {
        if (msg.sender != stakingToken.ownerOf(_tokenId)) {
            revert NotTokenOwner();
        }

        _refreshPoints(_tokenId);

        StakingMetadata storage metadata = stakingMetadata[_tokenId];
        if (_points > metadata.points) {
            revert NotEnoughPoints();
        }
        metadata.points -= uint32(_points);
        emit SpentPoints(msg.sender, _tokenId, _points);
    }

    function _setFees(uint256 _stakeFee, uint256 _unstakeFee) internal {
        if (_stakeFee > maxStakeFeeAmount) {
            revert InvalidStakeFee();
        }
        if (_unstakeFee > maxUnstakeFeeAmount) {
            revert InvalidUnstakeFee();
        }
        uint96 oldStakeFee = stakeFee;
        uint96 oldUnstakeFee = unstakeFee;

        if (_stakeFee != oldStakeFee) {
            stakeFee = uint96(_stakeFee);
            emit StakeFeeUpdated(address(stakeFeeToken), oldStakeFee, _stakeFee);
        }

        if (_unstakeFee != oldUnstakeFee) {
            unstakeFee = uint96(_unstakeFee);
            emit UnstakeFeeUpdated(address(unstakeFeeToken), oldUnstakeFee, _unstakeFee);
        }
    }

    /* ========== RESTRICTED OWNER FUNCTIONS ========== */

    function setManager(address _manager) external onlyOwner {
        if (_manager == address(0)) {
            revert InvalidManagerAddress();
        }
        manager = _manager;
        emit ManagerUpdated(_manager);
    }

    function unsetManager() external onlyOwner {
        manager = address(0);
        emit ManagerUpdated(address(0));
    }

    function setFees(uint256 _stakeFee, uint256 _unstakeFee) external onlyOwner {
        _setFees(_stakeFee, _unstakeFee);
    }

    function setFeeTreasury(address _feeTreasury) external onlyOwner {
        address oldFeeTreasury = feeTreasury;
        feeTreasury = _feeTreasury;
        emit FeeTreasuryUpdated(oldFeeTreasury, _feeTreasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /* ========== RESTRICTED MANAGER FUNCTIONS ========== */

    function setRewardMultipliers(
        uint256[] calldata _tokenIds,
        uint256 _newMultiplier
    ) external nonReentrant managerOnly {
        if (_newMultiplier < MIN_POINTS_MULTIPLIER || _newMultiplier > MAX_POINTS_MULTIPLIER) {
            revert InvalidPointsMultiplier();
        }
        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            _refreshPoints(_tokenIds[i]);
            stakingMetadata[_tokenIds[i]].multiplier = uint16(_newMultiplier);
        }

        emit MultiplierUpdated(msg.sender, _newMultiplier, _tokenIds);
    }

    // @notice Initialize points
    // @param tokenIds The tokenIds of the NFTs to initialize points for
    function initPoints(
        uint256[] calldata _tokenIds,
        uint256[] calldata _points
    ) external nonReentrant managerOnly {
        if (_tokenIds.length != _points.length) {
            revert TokenIdsPointsLengthMismatch();
        }
        if (totalStaked > 0) {
            revert InitPointsAfterStaking();
        }
        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            StakingMetadata storage metadata = stakingMetadata[_tokenIds[i]];
            if (metadata.lastUpdated != 0) {
                revert PointsInitialized();
            }
            if (_points[i] > MAX_INITIAL_POINTS) {
                revert InvalidInitialPoints();
            }
            metadata.points = uint32(_points[i]);
            metadata.lastUpdated = uint40(block.timestamp);
            emit SetPoints(msg.sender, _tokenIds[i], metadata.points);
        }
    }

    /* ========== MODIFIERS ========== */

    modifier managerOnly() {
        if (msg.sender != manager) {
            revert NotManager();
        }
        _;
    }

    /* ========== EVENTS ========== */

    event ManagerUpdated(address indexed _manager);
    event MultiplierUpdated(address indexed _manager, uint256 _newMultiplier, uint256[] _tokenIds);
    event Staked(address indexed _user, uint256 _amount, uint256[] _tokenIds);
    event Withdrawn(address indexed _user, uint256 _amount, uint256[] _tokenIds);
    event SetPoints(address indexed _manager, uint256 _tokenId, uint256 _points);
    event SpentPoints(address indexed _manager, uint256 _tokenId, uint256 _points);
    event FeeTreasuryUpdated(address indexed _oldFeeTreasury, address indexed _newFeeTreasury);
    event StakeFeeUpdated(
        address indexed _feeToken,
        uint256 indexed _oldFee,
        uint256 indexed _newFee
    );
    event UnstakeFeeUpdated(
        address indexed _feeToken,
        uint256 indexed _oldFee,
        uint256 indexed _newFee
    );

    // @dev required by UUPSUpgradeable
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // @dev This empty reserved space is put in place to allow future versions to add new variables without shifting down
    // storage in the inheritance chain.
    // See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
    uint256[49] private __gap;
}
