import {accounts} from "../../../deploy/test-wallets";

export const getTestWallets = (): {privateKey: string; balance: string}[] => {
  if (!accounts.every((element) => element.privateKey) || accounts.length === 0)
    throw new Error("INVALID_TEST_WALLETS");
  return accounts;
};
