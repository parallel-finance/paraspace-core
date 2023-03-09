import {BigNumber} from "ethers";
import rawBRE from "hardhat";
import {getDepositContract} from "../../helpers/contracts-getters";
import {waitForTx} from "../../helpers/misc-utils";

const registerValidators = async () => {
  console.time("register-validators");
  const depositContract = await getDepositContract(
    "0x4242424242424242424242424242424242424242"
  );
  const depositData = await import(
    "../../app/paraspace-validators-1-depositdata.json"
  );
  for (const {
    pubkey,
    withdrawal_credentials,
    signature,
    deposit_data_root,
    amount,
  } of depositData) {
    await waitForTx(
      await depositContract.deposit(
        `0x${pubkey}`,
        `0x${withdrawal_credentials}`,
        `0x${signature}`,
        `0x${deposit_data_root}`,
        {
          value: BigNumber.from(amount).mul(1e9).toString(),
        }
      )
    );
  }
  console.timeEnd("register-validators");
};

async function main() {
  await rawBRE.run("set-DRE");
  await registerValidators();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
