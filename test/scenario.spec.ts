import fs from "fs";
import {configuration as actionsConfiguration} from "./helpers/actions";
import {configuration as calculationsConfiguration} from "./helpers/utils/calculations";
import {executeStory} from "./helpers/scenario-engine";
import {TestEnv} from "./helpers/make-suite";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {testEnvFixture} from "./helpers/setup-env";
import {getParaSpaceConfig} from "../helpers/misc-utils";

const scenarioFolder = "./test/helpers/scenarios/";

const selectedScenarios: string[] = []; //"borrow-repay-stable-edge.json", "borrow-repay-stable.json"];

fs.readdirSync(scenarioFolder).forEach((file) => {
  if (selectedScenarios.length > 0 && !selectedScenarios.includes(file)) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const scenario = require(`./helpers/scenarios/${file}`);

  describe(scenario.title, async () => {
    let testEnv: TestEnv;
    before("Initializing configuration", async () => {
      testEnv = await loadFixture(testEnvFixture);
      actionsConfiguration.skipIntegrityCheck = false; //set this to true to execute solidity-coverage

      calculationsConfiguration.reservesParams =
        getParaSpaceConfig().ReservesConfig;
    });

    for (const story of scenario.stories) {
      it(story.description, async function () {
        // Retry the test scenarios up to 4 times in case random HEVM network errors happen
        //this.retries(4);
        await executeStory(story, testEnv);
      });
    }
  });
});
