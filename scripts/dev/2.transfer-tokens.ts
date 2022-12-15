import rawBRE from "hardhat";
import {BigNumber, utils} from "ethers";
import {
  DRE,
  getParaSpaceConfig,
  isFork,
  isMainnet,
  sleep,
} from "../../helpers/misc-utils";
import {ERC20TokenContractId, ERC721TokenContractId} from "../../helpers/types";
import {
  ERC20__factory,
  ERC721Enumerable__factory,
  Moonbirds__factory,
} from "../../types";
import {impersonateAddress} from "../../helpers/contracts-helpers";
import {getFirstSigner} from "../../helpers/contracts-getters";

// eslint-disable-next-line
enum AssetType {
  // eslint-disable-next-line
  ERC20,
  // eslint-disable-next-line
  ERC721,
  // eslint-disable-next-line
  ERC721_MOONBIRD,
}

const transferTokens = async () => {
  if (
    !isFork() ||
    !isMainnet() ||
    DRE.config.networks.hardhat.forking?.blockNumber !== 16119797
  ) {
    return;
  }

  console.time("transfer-tokens");

  const paraSpaceConfig = getParaSpaceConfig();
  const tokens = paraSpaceConfig.Tokens;
  const signer = await getFirstSigner();
  const receiver = await signer.getAddress();

  const configs = [
    {
      name: ERC20TokenContractId.USDT,
      whale: "0x5754284f345afc66a98fbb0a0afe71e0f007b949",
      address: tokens[ERC20TokenContractId.USDT],
      type: AssetType.ERC20,
      amount: "10000", // 10,000 USDT
    },
    {
      name: ERC20TokenContractId.USDC,
      whale: "0x55fe002aeff02f77364de339a1292923a15844b8",
      address: tokens[ERC20TokenContractId.USDC],
      type: AssetType.ERC20,
      amount: "10000", // 10,000 USDC
    },
    {
      name: ERC20TokenContractId.DAI,
      whale: "0xf977814e90da44bfa03b6295a0616a897441acec",
      address: tokens[ERC20TokenContractId.DAI],
      type: AssetType.ERC20,
      amount: "10000", // 10,000 DAI
    },
    {
      name: ERC20TokenContractId.WBTC,
      whale: "0x28c6c06298d514db089934071355e5743bf21d60",
      address: tokens[ERC20TokenContractId.WBTC],
      type: AssetType.ERC20,
      amount: "10000", // 10 WBTC
    },
    {
      name: ERC20TokenContractId.APE,
      whale: "0x5a52e96bacdabb82fd05763e25335261b270efcb",
      address: tokens[ERC20TokenContractId.APE],
      type: AssetType.ERC20,
      amount: "10000", // 10,000 APE
    },
    {
      name: ERC721TokenContractId.BAYC,
      whale: "0x54be3a794282c030b15e43ae2bb182e14c409c5e",
      address: tokens[ERC721TokenContractId.BAYC],
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.MAYC,
      whale: "0x54be3a794282c030b15e43ae2bb182e14c409c5e",
      address: tokens[ERC721TokenContractId.MAYC],
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.DOODLE,
      whale: "0xc35f3f92a9f27a157b309a9656cfea30e5c9cce3",
      address: tokens[ERC721TokenContractId.DOODLE],
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.MOONBIRD,
      whale: "0x7b557aA52d0055d84b1E3f5487D9018f318372C1",
      address: tokens[ERC721TokenContractId.MOONBIRD],
      type: AssetType.ERC721_MOONBIRD,
      amount: 3,
    },
    {
      name: ERC721TokenContractId.MEEBITS,
      whale: "0xa25803ab86a327786bb59395fc0164d826b98298",
      address: tokens[ERC721TokenContractId.MEEBITS],
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.AZUKI,
      whale: "0xff3879b8a363aed92a6eaba8f61f1a96a9ec3c1e",
      address: tokens[ERC721TokenContractId.AZUKI],
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.OTHR,
      whale: "0xdfd143ae8592e8e3c13aa3e401f72e1ca7deaed0",
      address: tokens[ERC721TokenContractId.OTHR],
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.CLONEX,
      whale: "0xb5ac414c576bd2f4291b6c51e167db752c2c4e62",
      address: tokens[ERC721TokenContractId.CLONEX],
      type: AssetType.ERC721,
      amount: 5,
    },
  ];

  for (let i = 0; i < configs.length; i += 1) {
    await sleep(3000);
    try {
      const {name, type, whale: whaleAddress, address, amount} = configs[i];
      const whale = await impersonateAddress(whaleAddress);
      // send some gas fee to whale
      try {
        await signer.sendTransaction({
          to: whaleAddress,
          value: utils.parseEther("5"),
          gasLimit: 50000,
        });
      } catch (e) {
        console.error(e);
      }

      if (type === AssetType.ERC20) {
        const token = await ERC20__factory.connect(address, whale.signer);
        const amountWithUnits = BigNumber.from("10").pow(
          await token.decimals()
        );
        const balance = await token.balanceOf(whaleAddress);
        console.log(`whale ${name} balance: ${balance.toString()}`);
        if (balance.gt(amountWithUnits)) {
          console.log(
            `transfer ${amount} ${name} from ${whaleAddress} to ${receiver}`
          );
          await token.transfer(receiver, amountWithUnits.toString());
        } else {
          console.log(`insufficient ${name} balance on ${whaleAddress}`);
        }
      } else if (type === AssetType.ERC721) {
        const token = await ERC721Enumerable__factory.connect(
          address,
          whale.signer
        );
        const balance = await token.balanceOf(whaleAddress);
        console.log(`whale ${name} balance: ${balance.toString()}`);
        for (let i = 0; i < Math.min(+amount, balance.toNumber()); i += 1) {
          const tokenId = await token.tokenOfOwnerByIndex(whaleAddress, i);
          console.log(
            `transfer ${name}#${tokenId} from ${whaleAddress} to ${receiver}`
          );
          await token.transferFrom(whaleAddress, receiver, tokenId);
        }
      } else if (type === AssetType.ERC721_MOONBIRD) {
        const moonbirds = await Moonbirds__factory.connect(
          address,
          whale.signer
        );
        const balance = await moonbirds.balanceOf(whaleAddress);
        console.log(`whale ${name} balance: ${balance.toString()}`);
        let transferred = 0;
        for (
          let tokenId = 9999;
          tokenId >= 1 && transferred <= amount;
          tokenId -= 1
        ) {
          if ((await moonbirds.ownerOf(tokenId)) !== whaleAddress) {
            continue;
          }
          console.log(
            `transfer ${name}#${tokenId} from ${whaleAddress} to ${receiver}`
          );
          await moonbirds.safeTransferWhileNesting(
            whaleAddress,
            receiver,
            tokenId
          );
          transferred += 1;
        }
      }
    } catch (err) {
      console.error(err);
      process.exit(0);
    }
  }

  console.timeEnd("transfer-tokens");
};

async function main() {
  await rawBRE.run("set-DRE");
  await transferTokens();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
