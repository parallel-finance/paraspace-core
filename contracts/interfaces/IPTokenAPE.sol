

import "./IPToken.sol";
import "../dependencies/yoga-labs/ApeCoinStaking.sol";

interface IPTokenAPE is IPToken {
    function getApeStaking() external view returns (ApeCoinStaking);
}