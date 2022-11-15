import {task} from "hardhat/config";
import {
  DEPLOY_END,
  DEPLOY_START,
  ETHERSCAN_VERIFICATION,
} from "../../deploy/helpers/hardhat-constants";

task("deploy:all", "Deploy all contracts").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  //for test_only mode we run each test in a live hardhat network without redeploy
  if (process.env["TEST_ONLY"] == "true") {
    return;
  }

  const {printContracts} = await import("../../deploy/helpers/misc-utils");
  const {getAllSteps} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps"
  );
  const steps = await getAllSteps();

  console.time("setup");

  for (let i = DEPLOY_START; i < DEPLOY_END; i++) {
    await steps[i](ETHERSCAN_VERIFICATION);
    console.log(
      `------------ step ${i.toString().padStart(2, "0")} done ------------`
    );
  }

  await printContracts();

  console.timeEnd("setup");
});
