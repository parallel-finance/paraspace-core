import {ethers} from "ethers";
// standard abi
import ERC20ABI from "./erc20-abi.json";
import ERC721ABI from "./erc721-abi.json";
import PUNKABI from "./punk-abi.json";

// nft ids for whale accounts
import baycWhaleNftIds from "./current-bayc-whale-nft-ids.json";
import maycWhaleNftIds from "./current-mayc-whale-nft-ids.json";
import doodleWhaleNftIds from "./current-doodle-whale-nft-ids.json";
import punkWhaleNftIds from "./current-punk-whale-nft-ids.json";

const main = async () => {
  // use the forked mainnet RPC endpoint
  const endpoint = "https://mainnet-fork.paraspaceprotocol.xyz";

  // connect to rpc
  const provider = new ethers.providers.JsonRpcProvider(endpoint);

  // these accounts are unlocked when the network was forked
  const usdtWhale = "0x5754284f345afc66a98fbb0a0afe71e0f007b949";
  const usdcWhale = "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503";
  const daiWhale = "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8";
  const stETHWhale = "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2";
  const wBTCWhale = "0x602d9abd5671d24026e2ca473903ff2a9a957407";
  const apeWhale = "0xf977814e90da44bfa03b6295a0616a897441acec";
  const ethWhale = "0x9bf4001d307dfd62b26a2f1307ee0c0307632d59";
  const punkWhale = "0x577ebc5de943e35cdf9ecb5bbe1f7d7cb6c7c647";
  const baycWhale = "0x1b523dc90a79cf5ee5d095825e586e33780f7188";
  const maycWhale = "0xC440e04F4849708f41971A754F003FE2Fd2093A3";
  const doodleWhale = "0xC41A84d016b1391Fa0F4048D37d3131988412360";

  // these are the mainnet addresses
  const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const stETH_ADDRESS = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
  const wBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
  const APE_ADDRESS = "0x4d224452801ACEd8B2F0aebE155379bb5D594381";
  const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const PUNK_ADDRESS = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB";
  // const WPUNK_ADDRESS = "0xb7F7F6C52F2e2fdb1963Eab30438024864c313F6";
  const BAYC_ADDRESS = "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D";
  const MAYC_ADDRESS = "0x60E4d786628Fea6478F785A6d7e704777c86a7c6";
  const DOODLE_ADDRESS = "0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e";

  const listOfAddresses = [
    "0x69C33aB569816F1D564a420490AbB894a44071Fb", // shared wallet account 1
    // "0x6649E9Ce1e731f2Cb5F33084C50849cB0D5C79c3", // debasis
    // "0x3f4794e5657329FB88e4AA44BEddD5291d7f672c", // suri
    // "0x755C1bd877788739dD002B98B093c4852AbfA6c4", // ivan
    // "0x12db7fc38B124E747E1062C4c20e64B98817F4C0", // helen
    // "0x9205f412e6DDAc47ec3Fa7066c0BD09352b8Cc14", // marvin
    // "0xd360DBC17F69747DcE236d282151b04A8A54D498", // andrew
    // "0x6c641924c40B1C710742dfd2Ca1504c41C8Ef79A", // sumit
    // "0x393FD4937b25b26564528A869C0Ed8368c5422C3", // sumit
    // "0x74CDB88BAb9d4F3f94807B0A3Da90c22a0AA8149", // billy
    // "0xC8bDD07b9689fF8d0055fe761277063dA3FD5446", // alex
    // "0xaC34c896f0c0199888354FE5e0017b60A6b56216", // allen
    // "0x4737De1E94e38115571163A82207F8fE512e4ea5", // tais
    // "0xd714ec22DeaF269d059b36D984276a1E6F4115C7", // tais
    // "0xD16c6b258e91E659DBE90FFE26A35a5BD6050C1E", // tais
    // "0x007594304039C2937a12220338AAb821d819f5A4", // ron
    // "0x3Ae92a41Bd8EEd8c6A0f5e9813E1EE1797c48e9a", // kdear
    // "0x53CcF2444c1f00d98720b11d919fAe5b457460a5", // kdear
    // "0x19520186777fb8F71cba4955A902F44C8b7F7494", // kdear
  ];

  const loopMe = [
    {
      name: "USDT",
      token_address: USDT_ADDRESS,
      whale_address: usdtWhale,
      type: "ERC20",
      amount: "10000000000", // 10,000 USDT
      decimals: 6,
    },
    {
      name: "USDC",
      token_address: USDC_ADDRESS,
      whale_address: usdcWhale,
      type: "ERC20",
      amount: "10000000000", // 10,000 USDC
      decimals: 6,
    },
    {
      name: "DAI",
      token_address: DAI_ADDRESS,
      whale_address: daiWhale,
      type: "ERC20",
      amount: "10000000000000000000000", // 10,000 DAI
      decimals: 18,
    },
    {
      name: "stETH",
      token_address: stETH_ADDRESS,
      whale_address: stETHWhale,
      type: "ERC20",
      amount: "100000000000000000000", // 100 ETH
      decimals: 18,
    },
    {
      name: "wBTC",
      token_address: wBTC_ADDRESS,
      whale_address: wBTCWhale,
      type: "ERC20",
      amount: "1000000000", // 10 WBTC
      decimals: 8,
    },
    {
      name: "APE",
      token_address: APE_ADDRESS,
      whale_address: apeWhale,
      type: "ERC20",
      amount: "10000000000000000000000", // 10,000 APE
      decimals: 18,
    },
    {
      name: "ETH",
      token_address: WETH_ADDRESS,
      whale_address: ethWhale,
      type: "ETH",
    },
    {
      name: "PUNK",
      token_address: PUNK_ADDRESS,
      whale_address: punkWhale,
      type: "PUNK",
      amount: 1,
    },
    {
      name: "BAYC",
      token_address: BAYC_ADDRESS,
      whale_address: baycWhale,
      type: "ERC721",
      amount: 1,
    },
    {
      name: "MAYC",
      token_address: MAYC_ADDRESS,
      whale_address: maycWhale,
      type: "ERC721",
      amount: 1,
    },
    {
      name: "DOODLE",
      token_address: DOODLE_ADDRESS,
      whale_address: doodleWhale,
      type: "ERC721",
      amount: 1,
    },
  ];

  // ---------------------- uncomment for logging punk ids that whale owns ----------------------
  // let punk_whale_nft_ids: number[] = [];

  // const getOwner = async (index) => {
  //   const punk_whale_address = punkWhale;
  //   const punk_contract_address = PUNK_ADDRESS;

  //   let signer = provider.getSigner(punk_whale_address);
  //   let token_contract = new ethers.Contract(punk_contract_address, PUNKABI, signer);

  //   try {
  //     let punk_owner_address = await token_contract.punkIndexToAddress(index);
  //     if (punk_owner_address.toLowerCase() === punk_whale_address.toLowerCase()) {
  //       punk_whale_nft_ids.push(index);
  //       console.log("whale is owner of nft id ", index);
  //     } else {
  //       console.log("whale is not owner of nft id ", index);
  //     }
  //   } catch(e) {}
  // }

  // let calls: Promise<void>[] = [];

  // for (var i = 1; i < 10001; i++) {
  //    if (calls.length > 50) {
  //      await Promise.all(calls)
  //      calls = []
  //    }
  //    calls.push(getOwner(i))
  // }

  // console.log("punk_whale_nft_ids is ", punk_whale_nft_ids);
  // ---------------------- uncomment for logging punk ids that whale owns ----------------------

  for (let i = 0; i < loopMe.length; i++) {
    const signer = provider.getSigner(loopMe[i].whale_address);
    if (loopMe[i].type === "ERC20") {
      console.log("beginning transfer of ", loopMe[i].name);
      const token_contract = new ethers.Contract(
        loopMe[i].token_address,
        ERC20ABI,
        signer
      );

      for (let j = 0; j < listOfAddresses.length; j++) {
        console.log("transferring to ", listOfAddresses[j]);
        const txId = await token_contract.transfer(
          listOfAddresses[j],
          loopMe[i].amount
        );
        console.log("txId is ", txId);
        const balanceOf = await token_contract.balanceOf(listOfAddresses[j]);
        console.log("balance of " + listOfAddresses[j] + " is " + balanceOf);
      }
      console.log("completed transfer of ", loopMe[i].name);
    } else if (loopMe[i].type === "ERC721") {
      console.log("beginning transfer of ", loopMe[i].name);
      const token_contract = new ethers.Contract(
        loopMe[i].token_address,
        ERC721ABI,
        signer
      );

      for (let j = 0; j < listOfAddresses.length; j++) {
        if (loopMe[i].token_address === BAYC_ADDRESS) {
          // uncomment for testing bad ids
          // const ownerOf = await token_contract.ownerOf(baycWhaleNftIds[j]);
          // console.log("owner of " + baycWhaleNftIds[j] + " is " + ownerOf);
          // console.log("bayc whale address is ", baycWhale);

          await token_contract.transferFrom(
            loopMe[i].whale_address,
            listOfAddresses[j],
            baycWhaleNftIds[j]
          );
          console.log(
            "after transfer of " +
              loopMe[i].name +
              " for token id " +
              baycWhaleNftIds[j] +
              " to wallet " +
              listOfAddresses[j]
          );

          const ownerOf = await token_contract.ownerOf(baycWhaleNftIds[j]);
          console.log("owner of " + baycWhaleNftIds[j] + " is " + ownerOf);
        } else if (loopMe[i].token_address === MAYC_ADDRESS) {
          await token_contract.transferFrom(
            loopMe[i].whale_address,
            listOfAddresses[j],
            maycWhaleNftIds[j]
          );
          console.log(
            "after transfer of " +
              loopMe[i].name +
              " for token id " +
              maycWhaleNftIds[j] +
              " to wallet " +
              listOfAddresses[j]
          );

          const ownerOf = await token_contract.ownerOf(maycWhaleNftIds[j]);
          console.log("owner of " + maycWhaleNftIds[j] + " is " + ownerOf);
        } else if (loopMe[i].token_address === DOODLE_ADDRESS) {
          await token_contract.transferFrom(
            loopMe[i].whale_address,
            listOfAddresses[j],
            doodleWhaleNftIds[j]
          );
          console.log(
            "after transfer of " +
              loopMe[i].name +
              " for token id " +
              doodleWhaleNftIds[j] +
              " to wallet " +
              listOfAddresses[j]
          );

          const ownerOf = await token_contract.ownerOf(doodleWhaleNftIds[j]);
          console.log("owner of " + doodleWhaleNftIds[j] + " is " + ownerOf);
        }
      }
      console.log("completed transfer of ", loopMe[i].name);
    } else if (loopMe[i].type === "PUNK") {
      console.log("beginning transfer of ", loopMe[i].name);
      const token_contract = new ethers.Contract(
        loopMe[i].token_address,
        PUNKABI,
        signer
      );

      for (let j = 0; j < listOfAddresses.length; j++) {
        await token_contract.transferPunk(
          listOfAddresses[j],
          punkWhaleNftIds[j]
        );
        console.log(
          "after transfer of " +
            loopMe[i].name +
            " for token id " +
            punkWhaleNftIds[j] +
            " to wallet " +
            listOfAddresses[j]
        );

        const ownerOf = await token_contract.punkIndexToAddress(
          punkWhaleNftIds[j]
        );
        console.log("owner of " + punkWhaleNftIds[j] + " is " + ownerOf);
      }
      console.log("completed transfer of ", loopMe[i].name);
    } else if (loopMe[i].type === "ETH") {
      console.log("beginning transfer of ", loopMe[i].name);
      for (let j = 0; j < listOfAddresses.length; j++) {
        await signer.sendTransaction({
          to: listOfAddresses[j],
          value: ethers.utils.parseEther("100.0"), // Sends exactly 100.0 ether
        });
      }
      console.log("completed transfer of ", loopMe[i].name);
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
