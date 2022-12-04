import "../dependencies/yoga-labs/ApeCoinStaking.sol";

interface IPTokenAPE {
    function getApeStaking() external view returns (ApeCoinStaking);
}
