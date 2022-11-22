pragma solidity ^0.8.10;

library StringUtils {
    function equal(string memory _a, string memory _b)
        public
        pure
        returns (bool)
    {
        bytes memory a = bytes(_a);
        bytes memory b = bytes(_b);
        uint256 minLength = a.length;
        if (b.length < minLength) minLength = b.length;
        for (uint256 i = 0; i < minLength; i++) {
            if (a[i] != b[i]) {
                return false;
            }
        }

        return true;
    }
}
