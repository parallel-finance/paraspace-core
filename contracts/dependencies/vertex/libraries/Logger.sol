// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/utils/Strings.sol";
import "./MathHelper.sol";

library Logger {
    event VertexEVMLog(string message);

    function log(string memory message) internal {
        emit VertexEVMLog(message);
    }

    function log(string memory message, int128 value) internal {
        log(string.concat(message, " ", MathHelper.int2str(value)));
    }

    function log(string memory message, uint128 value) internal {
        log(string.concat(message, " ", MathHelper.uint2str(value)));
    }

    function log(string memory message, address value) internal {
        log(
            string.concat(message, " ", Strings.toHexString(uint160(value), 20))
        );
    }

    function log(string memory messages, bytes32 value) internal {
        log(string.concat(messages, " ", string(abi.encodePacked(value))));
    }
}
