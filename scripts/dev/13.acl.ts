import rawBRE from "hardhat";
import {
  getPoolAddressesProvider,
  getReservesSetupHelper,
  getTimeLockProxy,
} from "../../helpers/contracts-getters";
import {getProxyAdmin} from "../../helpers/contracts-helpers";

const acl = async () => {
  console.time("acl");
  const provider = await getPoolAddressesProvider();
  const timeLock = await getTimeLockProxy();
  const reservesSetupHelper = await getReservesSetupHelper();
  console.log("provider owner", await provider.owner());
  console.log("timeLock admin", await getProxyAdmin(timeLock.address));
  console.log("reservesSetupHelper owner", await reservesSetupHelper.owner());

  console.timeEnd("acl");
};

async function main() {
  await rawBRE.run("set-DRE");
  await acl();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
