// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./interfaces/IArbAirdrop.sol";
import "./Endpoint.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ArbAirdrop is OwnableUpgradeable, IArbAirdrop {
    address token;
    address sanctions;
    uint32 pastWeeks;

    mapping(uint32 => bytes32) merkleRoots;
    mapping(uint32 => mapping(address => uint256)) claimed;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _token, address _sanctions)
        external
        initializer
    {
        __Ownable_init();
        token = _token;
        sanctions = _sanctions;
    }

    function registerMerkleRoot(uint32 week, bytes32 merkleRoot)
        external
        onlyOwner
    {
        pastWeeks += 1;
        require(week == pastWeeks, "Invalid week provided.");
        merkleRoots[week] = merkleRoot;
    }

    function _verifyProof(
        uint32 week,
        address sender,
        uint256 totalAmount,
        bytes32[] calldata proof
    ) internal {
        require(claimed[week][sender] == 0, "Already claimed.");
        require(
            merkleRoots[week] != bytes32(0),
            "Week hasn't been registered."
        );
        require(
            !ISanctionsList(sanctions).isSanctioned(sender),
            "address is sanctioned."
        );
        bytes32 leaf = keccak256(
            bytes.concat(keccak256(abi.encode(sender, totalAmount)))
        );
        bool isValidLeaf = MerkleProof.verify(proof, merkleRoots[week], leaf);
        require(isValidLeaf, "Invalid proof.");
        claimed[week][sender] = totalAmount;
    }

    function _claim(
        uint32 week,
        uint256 totalAmount,
        bytes32[] calldata proof
    ) internal {
        _verifyProof(week, msg.sender, totalAmount, proof);
        SafeERC20.safeTransfer(IERC20(token), msg.sender, totalAmount);
        emit ClaimArb(msg.sender, week, totalAmount);
    }

    function claim(ClaimProof[] calldata claimProofs) external {
        for (uint32 i = 0; i < claimProofs.length; i++) {
            _claim(
                claimProofs[i].week,
                claimProofs[i].totalAmount,
                claimProofs[i].proof
            );
        }
    }

    function getClaimed(address account)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory result = new uint256[](pastWeeks + 1);
        for (uint32 week = 1; week <= pastWeeks; week++) {
            result[week] = claimed[week][account];
        }
        return result;
    }
}
