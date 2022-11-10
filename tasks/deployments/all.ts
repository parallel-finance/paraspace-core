import {task} from "hardhat/config";

const verify = process.env.ETHERSCAN_VERIFICATION === "true" ? true : false;
const deployStart = parseInt(process.env.DEPLOY_START ?? "0");
const deployEnd = parseInt(process.env.DEPLOY_END ?? "19");

task("deploy:all", "Deploy all contracts").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");

  const {printContracts} = await import("../../deploy/helpers/misc-utils");
  const {getAllSteps} = await import(
    "../../deploy/tasks/deployments/full-deployment/steps"
  );
  const steps = await getAllSteps();

  console.time("setup");

  for (let i = deployStart; i < deployEnd; i++) {
    await steps[i](verify);
    console.log(
      `------------ step ${i.toString().padStart(2, "0")} done ------------`
    );
  }

  await printContracts();

  console.timeEnd("setup");
});
