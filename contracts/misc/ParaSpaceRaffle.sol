pragma solidity ^0.8.10;

import {VRFV2WrapperConsumerBase} from "../dependencies/chainlink/VRFV2WrapperConsumerBase.sol";
import {LinkTokenInterface} from "../dependencies/chainlink/interfaces/LinkTokenInterface.sol";
import {MerkleProof} from "../dependencies/openzeppelin/contracts/MerkleProof.sol";
import {Ownable} from "../dependencies/openzeppelin/contracts/Ownable.sol";

contract ParaSpaceRaffle is VRFV2WrapperConsumerBase, Ownable {
    address immutable linkAddress;
    address immutable wrapperAddress;

    uint32 callbackGasLimit = 100000;

    // The default is 3, but you can set this higher.
    uint16 requestConfirmations = 3;

    uint256 public numCandidates;

    mapping(uint256 => bool) public winners;

    bytes32 public merkleRoot;

    event Winner(uint256 indexed index);

    constructor(address _linkAddress, address _wrapperAddress)
        VRFV2WrapperConsumerBase(_linkAddress, _wrapperAddress)
    {
        linkAddress = _linkAddress;
        wrapperAddress = _wrapperAddress;
    }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    function setNumCandidates(uint256 _count) external onlyOwner {
        numCandidates = _count;
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

    function verifyWinner(uint256 index, bytes32[] calldata merkleProof)
        external
        view
        returns (bool)
    {
        bytes32 leaf = keccak256(abi.encode(msg.sender, index));
        return MerkleProof.verify(merkleProof, merkleRoot, leaf);
    }

    function withdrawLink() public onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(linkAddress);
        require(
            link.transfer(msg.sender, link.balanceOf(address(this))),
            "Unable to transfer"
        );
    }
}
