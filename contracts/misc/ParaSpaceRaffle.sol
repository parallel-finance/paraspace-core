pragma solidity ^0.8.10;

import {VRFV2WrapperConsumerBase} from "../dependencies/chainlink/VRFV2WrapperConsumerBase.sol";
import {LinkTokenInterface} from "../dependencies/chainlink/interfaces/LinkTokenInterface.sol";
import {MerkleProof} from "../dependencies/openzeppelin/contracts/MerkleProof.sol";
import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";

contract ParaSpaceRaffle is VRFV2WrapperConsumerBase, Ownable {
    bytes32 public immutable merkleRoot;
    uint256 immutable numCandidates;

    uint32 constant callbackGasLimit = 100000;
    uint16 constant requestConfirmations = 3;

    mapping(uint256 => bool) public winners;

    event Winner(uint256 indexed index);

    constructor(
        address _linkAddress,
        address _wrapperAddress,
        uint256 _numCandidates,
        bytes32 _merkleRoot
    ) VRFV2WrapperConsumerBase(_linkAddress, _wrapperAddress) {
        numCandidates = _numCandidates;
        merkleRoot = _merkleRoot;
    }

    function drawWinners(uint16 _numWinners) external onlyOwner {
        _requestRandomness(_numWinners);
    }

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal override {
        uint16 duplicateWinners = 0;

        for (uint256 index = 0; index < _randomWords.length; index++) {
            uint256 winnerIndex = _randomWords[index] % numCandidates;

            if (winners[winnerIndex]) {
                duplicateWinners++;
            } else {
                winners[winnerIndex] = true;
                emit Winner(winnerIndex);
            }
        }

        if (duplicateWinners > 0) {
            _requestRandomness(duplicateWinners);
        }
    }

    function _requestRandomness(uint16 _wordsNum) internal {
        requestRandomness(
            uint32(callbackGasLimit * _wordsNum),
            requestConfirmations,
            _wordsNum
        );
    }

    function verifyWinner(
        uint256 index,
        address winner,
        bytes32[] calldata merkleProof
    ) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encode(index, winner));
        return (MerkleProof.verify(merkleProof, merkleRoot, leaf) &&
            winners[index]);
    }

    function withdrawLink() public onlyOwner {
        // LinkTokenInterface link = LinkTokenInterface(linkAddress);
        require(
            LINK.transfer(msg.sender, LINK.balanceOf(address(this))),
            "Unable to transfer"
        );
    }
}
