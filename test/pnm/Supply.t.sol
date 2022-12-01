pragma solidity ^0.8.10;

import "./ParaTest.sol";
import "../../contracts/mocks/tokens/MintableERC20.sol";

contract SupplyTest is ParaTest {
    function setUp() public {
        vm.createSelectFork("http://localhost:8545");
        MintableERC20 dai = MintableERC20(get("DAI"));
        address user1 = users[0];
        dai.mint(user1, 1000000000);
    }
    function invariantSupply() public {
        MintableERC20 dai = MintableERC20(get("DAI"));
        address user1 = users[0];
        require(dai.balanceOf(user1) >= 1000000000);
    }
}
