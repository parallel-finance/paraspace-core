// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./IClearinghouseState.sol";
import "./IClearinghouseEventEmitter.sol";
import "../engine/IProductEngine.sol";
import "../IEndpoint.sol";
import "../IEndpointGated.sol";
import "../IVersion.sol";

interface IClearinghouse is
    IClearinghouseState,
    IClearinghouseEventEmitter,
    IEndpointGated,
    IVersion
{
    function addEngine(address engine, IProductEngine.EngineType engineType)
        external;

    function registerProductForId(
        address book,
        RiskStore memory riskStore,
        uint32 healthGroup
    ) external returns (uint32);

    function modifyProductConfig(uint32 productId, RiskStore memory riskStore)
        external;

    function depositCollateral(IEndpoint.DepositCollateral calldata tx)
        external;

    function withdrawCollateral(IEndpoint.WithdrawCollateral calldata tx)
        external;

    function mintLp(IEndpoint.MintLp calldata tx) external;

    function mintLpSlowMode(IEndpoint.MintLp calldata tx) external;

    function burnLp(IEndpoint.BurnLp calldata tx) external;

    function burnLpAndTransfer(IEndpoint.BurnLpAndTransfer calldata tx)
        external;

    function liquidateSubaccount(IEndpoint.LiquidateSubaccount calldata tx)
        external;

    function depositInsurance(IEndpoint.DepositInsurance calldata tx) external;

    function settlePnl(IEndpoint.SettlePnl calldata tx) external;

    function updateFeeRates(IEndpoint.UpdateFeeRates calldata tx) external;

    function claimSequencerFees(
        IEndpoint.ClaimSequencerFees calldata tx,
        int128[] calldata fees
    ) external;

    /// @notice Retrieve quote ERC20 address
    function getQuote() external view returns (address);

    /// @notice Returns all supported engine types for the clearinghouse
    function getSupportedEngines()
        external
        view
        returns (IProductEngine.EngineType[] memory);

    /// @notice Returns the registered engine address by type
    function getEngineByType(IProductEngine.EngineType engineType)
        external
        view
        returns (address);

    /// @notice Returns the engine associated with a product ID
    function getEngineByProduct(uint32 productId)
        external
        view
        returns (address);

    /// @notice Returns the orderbook associated with a product ID
    function getOrderbook(uint32 productId) external view returns (address);

    /// @notice Returns number of registered products
    function getNumProducts() external view returns (uint32);

    /// @notice Returns health for the subaccount across all engines
    function getHealth(bytes32 subaccount, IProductEngine.HealthType healthType)
        external
        view
        returns (int128);

    /// @notice Returns the amount of insurance remaining in this clearinghouse
    function getInsurance() external view returns (int128);

    function getAllBooks() external view returns (address[] memory);
}
