import {BigNumber} from "ethers";
import {
  getPoolAddressesProvider,
  getUiPoolDataProvider,
} from "../../../deploy/helpers/contracts-getters";
import {SignerWithAddress} from "../make-suite";

type TokenPositionInfo = {
  underlyingAsset: string;
  positionInfo: PositionInfo;
};

type PositionInfo = {
  xTokenBalance: BigNumber;
  // ERC20 supply & debt
  erc20XTokenDebt: BigNumber;
  collateralEnable: boolean;
  // NFT supply
  nftCollaterizedBalance: BigNumber;
};

export const getUserPositions = async (user: SignerWithAddress) => {
  const uiPoolDataProvider = await getUiPoolDataProvider();
  const raw = await uiPoolDataProvider.getUserReservesData(
    (
      await getPoolAddressesProvider()
    ).address,
    user.address
  );

  return raw.map(
    (each) =>
      ({
        underlyingAsset: each.underlyingAsset,
        positionInfo: {
          xTokenBalance: each.scaledXTokenBalance,
          erc20XTokenDebt: each.scaledVariableDebt,
          collateralEnable: each.usageAsCollateralEnabledOnUser,
          nftCollaterizedBalance: each.collaterizedBalance,
        },
      } as TokenPositionInfo)
  );
};
