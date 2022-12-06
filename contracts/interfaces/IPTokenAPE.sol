import "../dependencies/yoga-labs/ApeCoinStaking.sol";

interface IPTokenAPE {
    function getApeStaking() external view returns (ApeCoinStaking);
    function depositApeCoin(uint256 amount) external;
    function withdrawApeCoin(uint256 amount) external;
    function claimApeCoin(address _treasury) external;
}
