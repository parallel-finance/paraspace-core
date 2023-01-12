export const getAllSteps = async () => {
  const {step_00} = await import("./00_deleteDb");
  const {step_01} = await import("./01_ERC20Tokens");
  const {step_02} = await import("./02_ERC721Tokens");
  const {step_03} = await import("./03_faucet");
  const {step_04} = await import("./04_addressProvider");
  const {step_05} = await import("./05_aclManager");
  const {step_06} = await import("./06_pool");
  const {step_07} = await import("./07_poolConfigurator");
  const {step_08} = await import("./08_reservesSetupHelper");
  const {step_09} = await import("./09_fallbackOracle");
  const {step_10} = await import("./10_allAggregators");
  const {step_11} = await import("./11_allReserves");
  const {step_12} = await import("./12_uiIncentiveDataProvider");
  const {step_13} = await import("./13_wethGateway");
  const {step_14} = await import("./14_punkGateway");
  const {step_15} = await import("./15_seaport");
  const {step_16} = await import("./16_looksrare");
  const {step_17} = await import("./17_x2y2");
  const {step_18} = await import("./18_blur");
  const {step_19} = await import("./19_flashClaimRegistry");
  const {step_20} = await import("./20_p2pPairStaking");
  const {step_21} = await import("./21_renounceOwnership");

  return [
    step_00,
    step_01,
    step_02,
    step_03,
    step_04,
    step_05,
    step_06,
    step_07,
    step_08,
    step_09,
    step_10,
    step_11,
    step_12,
    step_13,
    step_14,
    step_15,
    step_16,
    step_17,
    step_18,
    step_19,
    step_20,
    step_21,
  ];
};
