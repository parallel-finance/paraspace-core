// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import "../../contracts/misc/NFTFloorOracle.sol";
import "ds-test/test.sol";

interface CheatCodes {
    function prank(address) external;

    function roll(uint256) external;

    function warp(uint256 x) external;

    function expectRevert(bytes calldata msg) external;
}

contract NFTFloorOracleTest is DSTest {
    CheatCodes cheats = CheatCodes(HEVM_ADDRESS);
    NFTFloorOracle _contract;
    address[] updaters = new address[](3);
    address constant admin = 0x0000000000000000000000000000000000000004;
    address[] tokens = new address[](2);
    event Data(bytes32 data);

    function setUp() public {
        updaters[0] = 0xc783df8a850f42e7F7e57013759C285caa701eB6;
        updaters[1] = 0xeAD9C93b79Ae7C1591b1FB5323BD777E86e150d4;
        updaters[2] = 0xE5904695748fe4A84b40b3fc79De2277660BD1D3;
        tokens[0] = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;
        tokens[1] = 0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D;
        _contract = new NFTFloorOracle();
        cheats.prank(admin);
        _contract.initialize(admin, updaters, tokens);
        cheats.prank(admin);
        _contract.setConfig(EXPIRATION_PERIOD, MAX_DEVIATION_RATE);
    }

    function quickSort(
        uint256[] memory arr,
        int256 left,
        int256 right
    ) internal pure {
        int256 i = left;
        int256 j = right;
        if (i == j) return;
        uint256 pivot = arr[uint256(left + (right - left) / 2)];
        while (i <= j) {
            while (arr[uint256(i)] < pivot) i++;
            while (pivot < arr[uint256(j)]) j--;
            if (i <= j) {
                (arr[uint256(i)], arr[uint256(j)]) = (
                    arr[uint256(j)],
                    arr[uint256(i)]
                );
                i++;
                j--;
            }
        }
        if (left < j) quickSort(arr, left, j);
        if (i < right) quickSort(arr, i, right);
    }

    function testArraySort() public {
        uint256[] memory arr = new uint256[](2);
        arr[0] = 2;
        arr[1] = 5;
        quickSort(arr, 0, 1);
        assertEq(arr[1], 5);
    }

    function testUpdatePricesFromOneFeeder() public {
        uint256[] memory twaps = new uint256[](1);
        twaps[0] = 1_000;
        address[] memory _tokens = new address[](1);
        _tokens[0] = tokens[0];
        cheats.prank(updaters[0]);
        _contract.setMultiplePrices(_tokens, twaps);
        assertEq(_contract.getPrice(tokens[0]), 1000);
        twaps[0] = 1200;
        cheats.warp(1200);
        cheats.prank(updaters[0]);
        _contract.setMultiplePrices(_tokens, twaps);
        // minimum_account is 3 so not enough data and use the previous
        assertEq(_contract.getPrice(tokens[0]), 1000);
    }

    function testUpdatePricesFromMultipleFeedersAtSameTime() public {
        uint256[] memory twaps = new uint256[](1);
        twaps[0] = 1_000;
        address[] memory _tokens = new address[](1);
        _tokens[0] = tokens[0];
        //from update[0] at ts 1000
        cheats.prank(updaters[0]);
        cheats.warp(2_000);
        //initial feed will always be accepted
        _contract.setMultiplePrices(_tokens, twaps);
        assertEq(_contract.getPrice(tokens[0]), 1000);
        twaps[0] = 1200;
        cheats.warp(2_000);
        //from update[1] at ts 2000
        cheats.prank(updaters[1]);
        _contract.setMultiplePrices(_tokens, twaps);
        //not enough data so use the previous one
        assertEq(_contract.getPrice(tokens[0]), 1000);
        //from update[2] as 1400
        twaps[0] = 1400;
        cheats.warp(2000);
        cheats.prank(updaters[2]);
        _contract.setMultiplePrices(_tokens, twaps);
        //now reach the minimum count 3
        //so aggregate with (1000,1200,1400) and 1200 as median price
        assertEq(_contract.getPrice(tokens[0]), 1200);
    }

    function testUpdatePricesFromMultipleFeedersWithExpiration() public {
        uint64 newExpirationPeriod = 2000;
        cheats.prank(admin);
        //we set expiration as 2000 and price deviation as 50
        _contract.setConfig(newExpirationPeriod, 50000);
        uint256[] memory twaps = new uint256[](1);
        twaps[0] = 1000;
        address[] memory _tokens = new address[](1);
        _tokens[0] = tokens[0];
        //from update[0]
        cheats.prank(updaters[0]);
        cheats.roll(1000);
        //initial feed will always be accepted
        _contract.setMultiplePrices(_tokens, twaps);
        assertEq(_contract.getPrice(tokens[0]), 1000);
        twaps[0] = 2_000;
        //from update[1] at ts 2000
        cheats.prank(updaters[1]);
        cheats.roll(2_000);
        _contract.setMultiplePrices(_tokens, twaps);
        //not enough data so use the previous one
        assertEq(_contract.getPrice(tokens[0]), 1000);
        twaps[0] = 3_000;
        cheats.roll(3_000);
        cheats.prank(updaters[2]);
        _contract.setMultiplePrices(_tokens, twaps);
        //now reach the minimum count with (updater0:1000,updater1:2000,updater2:3000)
        assertEq(_contract.getPrice(tokens[0]), 2000);
        //warp to 3200 so that price 1000 from updater0 at time 1000 will be expired
        //3200-1000=2200>2000
        cheats.roll(3200);
        twaps[0] = 4_000;
        cheats.prank(updaters[1]);
        _contract.setMultiplePrices(_tokens, twaps);
        //price 1000 expired,not enough price now so still use previous
        //updater0:1000(expired),updater1:4000,updater2:3000
        assertEq(_contract.getPrice(tokens[0]), 2000);
        cheats.roll(3200);
        cheats.prank(updaters[0]);
        _contract.setMultiplePrices(_tokens, twaps);
        //updater0:4000,updater1:4000,updater2:4000
        assertEq(_contract.getPrice(tokens[0]), 4000);
    }

    function testUpdatePriceDeviatedFailure() public {
        address[] memory _tokens = new address[](1);
        uint256[] memory twaps = new uint256[](1);
        _tokens[0] = tokens[0];
        twaps[0] = 10;
        cheats.warp(10_000);
        cheats.prank(updaters[0]);
        _contract.setMultiplePrices(_tokens, twaps);
        assertEq(_contract.getPrice(_tokens[0]), 10);
        //increase by 1.2 times should be fine
        twaps[0] = 12;
        cheats.warp(10_000);
        cheats.prank(updaters[1]);
        _contract.setMultiplePrices(_tokens, twaps);
        //require at least 3 price points,so still use previous
        assertEq(_contract.getPrice(_tokens[0]), 10);
        //accept from another feeder will finalize the price
        twaps[0] = 12;
        cheats.warp(10_000);
        cheats.prank(updaters[2]);
        _contract.setMultiplePrices(_tokens, twaps);
        //median(10,12,12)=12
        assertEq(_contract.getPrice(tokens[0]), 12);
        // //increase by 5 times cause derivation check failed,12*5=60
        twaps[0] = 60;
        cheats.warp(12_000);
        cheats.prank(updaters[0]);
        cheats.expectRevert("NFTOracle: invalid price data");
        _contract.setMultiplePrices(_tokens, twaps);
        //while admin still can feed the deviated price 60
        cheats.warp(12_000);
        cheats.prank(admin);
        _contract.setEmergencyPrice(_tokens[0], twaps[0]);
        assertEq(_contract.getPrice(tokens[0]), 60);
        //decrease by 12 times cause derivation check failed,60/12=5
        twaps[0] = 5;
        cheats.warp(12_000);
        cheats.prank(updaters[0]);
        cheats.expectRevert("NFTOracle: invalid price data");
        _contract.setMultiplePrices(_tokens, twaps);
        //decrease by 1.2 times should be fine,60/1.2=50
        twaps[0] = 50;
        cheats.warp(13_000);
        cheats.prank(updaters[1]);
        _contract.setMultiplePrices(_tokens, twaps);
        //median(50,12,12)=12
        assertEq(_contract.getPrice(tokens[0]), 12);
    }

    function testOwnershipTransfer() public {
        bytes32 _admin = _contract.getRoleAdmin(keccak256("UPDATER_ROLE"));
        assertEq(
            _admin,
            0x0000000000000000000000000000000000000000000000000000000000000000
        );
        assertTrue(
            _contract.hasRole(
                0x0000000000000000000000000000000000000000000000000000000000000000,
                admin
            )
        );
        address newOwner = 0xffdd8AD33B209e473D50676011bA979b64242510;
        cheats.prank(admin);
        _contract.grantRole(keccak256("UPDATER_ROLE"), newOwner);
        assertTrue(_contract.hasRole(keccak256("UPDATER_ROLE"), newOwner));
    }

    function testChangeOracleNodes() public {
        address[] memory newUpdaters = new address[](1);
        newUpdaters[0] = 0x0000000000000000000000000000000000000005;
        //add new updaters and remove old ones
        cheats.prank(admin);
        _contract.addFeeders(newUpdaters);
        //new updater can feed
        address[] memory _tokens = new address[](1);
        _tokens[0] = tokens[0];
        uint256[] memory twaps = new uint256[](1);
        twaps[0] = 1_000;
        cheats.prank(newUpdaters[0]);
        _contract.setMultiplePrices(_tokens, twaps);
        //feed with old updater should still be fine
        cheats.prank(updaters[0]);
        _contract.setMultiplePrices(_tokens, twaps);
    }

    function testSetUnknowAssetPrice() public {
        uint256[] memory twaps = new uint256[](1);
        twaps[0] = 1_000;
        address[] memory _tokens = new address[](1);
        //invalid token
        _tokens[0] = 0x0000000000000000000000000000000000000000;
        cheats.prank(updaters[0]);
        cheats.expectRevert("NFTOracle: asset not existed");
        _contract.setMultiplePrices(_tokens, twaps);
    }

    function testAddRemoveAssets() public {
        address unknown = 0x0000000000000000000000000000000000000001;
        uint256[] memory twaps = new uint256[](1);
        twaps[0] = 1_000;
        address[] memory _tokens = new address[](1);
        //invalid token
        _tokens[0] = unknown;
        cheats.prank(updaters[0]);
        cheats.expectRevert("NFTOracle: asset not existed");
        _contract.setMultiplePrices(_tokens, twaps);
        assertEq(_contract.getFeederSize(), 3);
        //admin add asset
        cheats.prank(admin);
        _contract.addAssets(_tokens);
        cheats.prank(updaters[0]);
        _contract.setMultiplePrices(_tokens, twaps);
        assertEq(_contract.assets(2), unknown);
        //admin remove asset
        cheats.prank(admin);
        _contract.removeAssets(_tokens);
        assertEq(
            _contract.assets(2),
            0x0000000000000000000000000000000000000000
        );
        cheats.prank(updaters[0]);
        cheats.expectRevert("NFTOracle: asset not existed");
        _contract.setMultiplePrices(_tokens, twaps);
    }

    function testSetAssetPriceWhenPaused() public {
        uint256[] memory twaps = new uint256[](1);
        twaps[0] = 1_000;
        address[] memory _tokens = new address[](1);
        _tokens[0] = tokens[0];
        //pause nft token
        cheats.prank(admin);
        _contract.setPause(_tokens[0], true);
        //updater can not feed any more
        cheats.prank(updaters[0]);
        cheats.expectRevert("NFTOracle: nft price feed paused");
        _contract.setMultiplePrices(_tokens, twaps);
        // admin can still feed even if paused
        // cheats.prank(admin);
        // _contract.setMultiplePrices(_tokens, twaps);
        // assertEq(_contract.getPrice(tokens[0]), 1_000);
    }
}
