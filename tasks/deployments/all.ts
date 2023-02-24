import {task} from "hardhat/config";
import {
  DEPLOY_END,
  DEPLOY_START,
  ETHERSCAN_VERIFICATION,
} from "../../helpers/hardhat-constants";

task("deploy:all", "Deploy all contracts").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  //for test_only mode we run each test in a live hardhat network without redeploy
  if (DEPLOY_END - DEPLOY_START < 1) {
    return;
  }

  const {printContracts} = await import("../../helpers/misc-utils");
  const {getAllSteps} = await import("../../scripts/deployments/steps");
  const {beforeAll} = await import(
    "../../scripts/deployments/steps/before-all"
  );
  const {afterAll} = await import("../../scripts/deployments/steps/after-all");
  const steps = await getAllSteps();

  console.time("setup");

  await beforeAll();
  for (let i = DEPLOY_START; i < DEPLOY_END; i++) {
    await steps[i](ETHERSCAN_VERIFICATION);
    console.log(
      `------------ step ${i.toString().padStart(2, "0")} done ------------`
    );
  }
  await afterAll();

  await printContracts();

  console.timeEnd("setup");
});
