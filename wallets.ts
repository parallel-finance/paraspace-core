import {ethers} from "ethers";
import dotenv from "dotenv";
import {
  DEPLOYER_MNEMONIC,
  DEPLOYER_PRIVATE_KEY,
} from "./helpers/hardhat-constants";
import {HardhatNetworkAccountUserConfig} from "hardhat/types";

dotenv.config();

const balance = "1000000000000000000000000"; // 1000000000000000000000000/1e18 = 1000,000 ETH

export const accounts: HardhatNetworkAccountUserConfig[] = [
  {
    privateKey:
      "0xc5e8f61d1ab959b397eecc0a37a6517b8e67a0e7cf1f4bce5591f3ed80199122", // 0xc783df8a850f42e7F7e57013759C285caa701eB6
    balance,
  },
  {
    privateKey:
      "0xd49743deccbccc5dc7baa8e69e5be03298da8688a15dd202e20f15d5e0e9a9fb", // 0xeAD9C93b79Ae7C1591b1FB5323BD777E86e150d4
    balance,
  },
  {
    privateKey:
      "0x23c601ae397441f3ef6f1075dcb0031ff17fb079837beadaf3c84d96c6f3e569", // 0xE5904695748fe4A84b40b3fc79De2277660BD1D3
    balance,
  },
  {
    privateKey:
      "0xee9d129c1997549ee09c0757af5939b2483d80ad649a0eda68e8b0357ad11131", // 0x92561F28Ec438Ee9831D00D1D59fbDC981b762b2
    balance,
  },
  {
    privateKey:
      "0x87630b2d1de0fbd5044eb6891b3d9d98c34c8d310c852f98550ba774480e47cc", // 0x2fFd013AaA7B5a7DA93336C2251075202b33FB2B
    balance,
  },
  {
    privateKey:
      "0x275cc4a2bfd4f612625204a20a2280ab53a6da2d14860c47a9f5affe58ad86d4", // 0x9FC9C2DfBA3b6cF204C37a5F690619772b926e39
    balance,
  },
  {
    privateKey:
      "0xaee25d55ce586148a853ca83fdfacaf7bc42d5762c6e7187e6f8e822d8e6a650", // 0xaD9fbD38281F615e7DF3DeF2Aad18935a9e0fFeE
    balance,
  },
  {
    privateKey:
      "0xa2e0097c961c67ec197b6865d7ecea6caffc68ebeb00e6050368c8f67fc9c588", // 0x8BffC896D42F07776561A5814D6E4240950d6D3a
    balance,
  },
  {
    privateKey:
      DEPLOYER_PRIVATE_KEY ||
      ethers.Wallet.fromMnemonic(DEPLOYER_MNEMONIC).privateKey,
    balance,
  },
];

export default {
  accounts,
};
