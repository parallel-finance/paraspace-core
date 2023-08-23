import rawBRE from "hardhat";
import {BigNumber, utils} from "ethers";
import {
  DRE,
  isFork,
  isEthereum,
  sleep,
  waitForTx,
} from "../../helpers/misc-utils";
import {ERC20TokenContractId, ERC721TokenContractId} from "../../helpers/types";
import {
  ERC20__factory,
  ERC721Enumerable__factory,
  Moonbirds__factory,
} from "../../types";
import {impersonateAddress} from "../../helpers/contracts-helpers";
import {getAllTokens, getFirstSigner} from "../../helpers/contracts-getters";

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
    !isEthereum() ||
    DRE.config.networks.hardhat.forking?.blockNumber !== 17556872
  ) {
    return;
  }

  console.time("transfer-tokens");

  const tokens = await getAllTokens();
  const signer = await getFirstSigner();
  const receiver = await signer.getAddress();

  const configs = [
    {
      name: ERC20TokenContractId.USDT,
      whale: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      address: tokens[ERC20TokenContractId.USDT].address,
      type: AssetType.ERC20,
      amount: "10000000", // 10,000,000 USDT
    },
    {
      name: ERC20TokenContractId.USDC,
      whale: "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503",
      address: tokens[ERC20TokenContractId.USDC].address,
      type: AssetType.ERC20,
      amount: "10000000", // 10,000,000 USDC
    },
    {
      name: ERC20TokenContractId.DAI,
      whale: "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8",
      address: tokens[ERC20TokenContractId.DAI].address,
      type: AssetType.ERC20,
      amount: "10000000", // 10,000,000 DAI
    },
    {
      name: ERC20TokenContractId.WBTC,
      whale: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      address: tokens[ERC20TokenContractId.WBTC].address,
      type: AssetType.ERC20,
      amount: "1000", // 1000 WBTC
    },
    {
      name: ERC20TokenContractId.APE,
      whale: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
      address: tokens[ERC20TokenContractId.APE].address,
      type: AssetType.ERC20,
      amount: "5000000", // 5,000,000 APE
    },
    {
      name: ERC20TokenContractId.cAPE,
      whale: "0x3d1Bc92B1635a76193E67e86FA0B10CD8b8b1aB9",
      address: tokens[ERC20TokenContractId.cAPE].address,
      type: AssetType.ERC20,
      amount: "200000", // 200,000 cAPE
    },
    {
      name: ERC20TokenContractId.WETH,
      whale: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
      address: tokens[ERC20TokenContractId.WETH].address,
      type: AssetType.ERC20,
      amount: "50000", // 50,000 WETH
    },
    {
      name: ERC20TokenContractId.stETH,
      whale: "0x176F3DAb24a159341c0509bB36B833E7fdd0a132",
      address: tokens[ERC20TokenContractId.stETH].address,
      type: AssetType.ERC20,
      amount: "200000", // 200,000 stETH
    },
    {
      name: ERC20TokenContractId.wstETH,
      whale: "0x5fEC2f34D80ED82370F733043B6A536d7e9D7f8d",
      address: tokens[ERC20TokenContractId.wstETH].address,
      type: AssetType.ERC20,
      amount: "100000", // 100,000 wstETH
    },
    {
      name: ERC20TokenContractId.BLUR,
      whale: "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b",
      address: tokens[ERC20TokenContractId.BLUR].address,
      type: AssetType.ERC20,
      amount: "10000000", // 10,000,000 BLUR
    },
    {
      name: ERC20TokenContractId.cbETH,
      whale: "0xED1F7bb04D2BA2b6EbE087026F03C96Ea2c357A8",
      address: tokens[ERC20TokenContractId.cbETH].address,
      type: AssetType.ERC20,
      amount: "10000", // 10,000 cbETH
    },
    {
      name: ERC20TokenContractId.rETH,
      whale: "0x7d6149aD9A573A6E2Ca6eBf7D4897c1B766841B4",
      address: tokens[ERC20TokenContractId.rETH].address,
      type: AssetType.ERC20,
      amount: "10000", // 10,000 rETH
    },
    {
      name: ERC20TokenContractId.aWETH,
      whale: "0x1111567E0954E74f6bA7c4732D534e75B81DC42E",
      address: tokens[ERC20TokenContractId.aWETH].address,
      type: AssetType.ERC20,
      amount: "20000", // 20,000 aWETH
    },
    {
      name: ERC20TokenContractId.FRAX,
      whale: "0x4C569Fcdd8b9312B8010Ab2c6D865c63C4De5609",
      address: tokens[ERC20TokenContractId.FRAX].address,
      type: AssetType.ERC20,
      amount: "2000000", // 2,000,000 FRAX
    },
    {
      name: ERC721TokenContractId.BAYC,
      whale: "0x08c1AE7E46D4A13b766566033b5C47c735e19F6f",
      address: tokens[ERC721TokenContractId.BAYC].address,
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.MAYC,
      whale: "0xe2A83b15FC300D8457eB9E176f98d92a8FF40a49",
      address: tokens[ERC721TokenContractId.MAYC].address,
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.DOODLE,
      whale: "0xaF184b4cBc73A9Ca2F51c4a4d80eD67a2578E9F4",
      address: tokens[ERC721TokenContractId.DOODLE].address,
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.MOONBIRD,
      whale: "0x2110700Ef172242dFB6a64bCBfFa70FE5AF663fA",
      address: tokens[ERC721TokenContractId.MOONBIRD].address,
      type: AssetType.ERC721_MOONBIRD,
      amount: 3,
    },
    {
      name: ERC721TokenContractId.MEEBITS,
      whale: "0x4d8E16A70F38414F33E8578913Eef6A0e4a633b5",
      address: tokens[ERC721TokenContractId.MEEBITS].address,
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.AZUKI,
      whale: "0xff3879B8A363AeD92A6EABa8f61f1A96a9EC3c1e",
      address: tokens[ERC721TokenContractId.AZUKI].address,
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.OTHR,
      whale: "0xDfd143aE8592e8E3C13aa3E401f72E1ca7deAED0",
      address: tokens[ERC721TokenContractId.OTHR].address,
      type: AssetType.ERC721,
      amount: 5,
    },
    {
      name: ERC721TokenContractId.CLONEX,
      whale: "0xb5AC414C576bD2F4291B6c51e167dB752C2C4E62",
      address: tokens[ERC721TokenContractId.CLONEX].address,
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
        await waitForTx(
          await signer.sendTransaction({
            to: whaleAddress,
            value: utils.parseEther("1"),
            gasLimit: 50000,
          })
        );
      } catch (e) {
        console.error(e);
        process.exit(1);
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
          await waitForTx(
            await token.transfer(receiver, amountWithUnits.toString())
          );
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
          await waitForTx(
            await token.transferFrom(whaleAddress, receiver, tokenId)
          );
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
          await waitForTx(
            await moonbirds.safeTransferWhileNesting(
              whaleAddress,
              receiver,
              tokenId
            )
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
