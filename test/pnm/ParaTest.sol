pragma solidity ^0.8.10;

import {PTest} from "pnm-contracts/PTest.sol";
import "forge-std/console.sol";
import "forge-std/StdJson.sol";

contract ParaTest is PTest {
    using stdJson for string;
    address[] public users;
    mapping(bytes32 => address) public db;
    string raw;
    constructor() {
        users.push(address(0x00f39fd6e51aad88f6f4ce6ab8827279cfffb92266));
        users.push(address(0x0070997970c51812dc3a010c7d01b50e0d17dc79c8));
        users.push(address(0x003c44cdddb6a900fa2b585dd299e03d12fa4293bc));
        users.push(address(0x0090f79bf6eb2c4f870365e785982e1f101e93b906));
        users.push(address(0x0015d34aaf54267db7d7c367839aaf71a00a2c6a65));
        users.push(address(0x009965507d1a55bcc2695c58ba16fb37d819b0a4dc));
        users.push(address(0x00976ea74026e726554db657fa54763abd0c3a0aa9));
        users.push(address(0x0014dc79964da2c08b23698b3d3cc7ca32193d9955));
        users.push(address(0x0023618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f));
        users.push(address(0x00a0ee7a142d267c1f36714e4a8f75612f20a79720));

        string memory root = vm.projectRoot();
        string memory path = string(abi.encodePacked(root, "/deployed-contracts.json"));
        raw = vm.readFile(path);
    }

    function get(string memory key) public returns(address) {
        address value = db[keccak256(abi.encodePacked(key))];
        if(value == address(0)) {
            string memory jq = string(abi.encodePacked(key, ".anvil.address"));
            value = raw.readAddress(jq);
            db[keccak256(abi.encodePacked(key))] = value;
        }
        return value;
    }

}
