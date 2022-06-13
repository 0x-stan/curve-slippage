const { ethers } = require("hardhat");
const fs = require("fs")
const { parseEther } = ethers.utils;
const { MaxUint256 } = ethers.constants;
const {
  snapshotNetwork,
  revertNetwork,
  setBalance,
  impersonateAccount,
} = require("../utils/fork-utils");

const StableSwapABI = require("../abis/StableSwapABI.json");
const stETHTokenABI = require("../abis/stETHTokenABI.json");

const SELL_AMOUNT = parseEther("1000")
const LOG_DIR = "./data/slippageLog.csv"

const stETHPooladdress = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
const stETHTokenAddress = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const stETHWhales = [
  "0x2FAF487A4414Fe77e2327F0bf4AE2a264a776AD2",  // FTX exchange
  "0x7cCD3bEfb83154B99C02F4DD5AeC5dD76f1ee0b2",
  "0xca2C8b7664FA4169bd85DA72A968DaB9b78F5882",
  "0x6Cf9AA65EBaD7028536E353393630e2340ca6049",
  "0xD5C6A038950B977969e66f4823fd813C67048Ba0",
];

let stETHToken = new ethers.Contract(stETHTokenAddress, stETHTokenABI);
let stETHPool = new ethers.Contract(stETHPooladdress, StableSwapABI);

async function main() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.writeFileSync(LOG_DIR, "dyPerOne,dy,poolb0,poolb1\n", { flag: "w" })
  } else {
    console.log(`Already have simulation data. If you want to reload data, delete ${LOG_DIR} and rerun this script.`)
    return
  }

  const snapshot = await snapshotNetwork();

  const [user0] = await ethers.getSigners();
  const userAddr = await user0.getAddress();
  await setBalance(userAddr);

  // prepare stETH token
  for (let i = 0; i < stETHWhales.length; i++) {
    await prepareStETH(stETHWhales[i]);
  }

  stETHToken = stETHToken.connect(user0);
  stETHPool = stETHPool.connect(user0);

  await stETHToken.approve(stETHPool.address, MaxUint256, { gasLimit: 800000 });

  try {
    let dyPerOne, dy, poolb0, poolb1;
    [poolb0, poolb1] = await checkPoolBalances();


    while (poolb0.gt(parseEther("1"))) {
      [dyPerOne, dy, poolb0, poolb1] = await doExchange();
      let logStr = `${dyPerOne.toString()},${dy.toString()},${poolb0.toString()},${poolb1.toString()}`
      console.log(logStr);
      fs.writeFileSync(LOG_DIR, logStr + "\n", { flag: "a+" })
      if ((await stETHToken.balanceOf(userAddr)).lt(SELL_AMOUNT)) {
        console.log("seller hasn't enought stETH: ", await stETHToken.balanceOf(userAddr))
        console.log("exchange break.")
        break;
      }
    }
  } catch (error) {
    console.error(error);
    await revertNetwork(snapshot);
  }

  await revertNetwork(snapshot);

  async function doExchange() {
    const tx = await (
      await stETHPool.exchange(1, 0, SELL_AMOUNT, 0, {
        gasLimit: 800000,
      })
    ).wait();
    // get dy from transaction event
    const events = await stETHPool.queryFilter(
      stETHPool.filters.TokenExchange,
      tx.blockNumber
    );
    let dy = events[events.length - 1].args.tokens_bought;
    // get dy per 1stETH from function get_dy
    let dyPerOne = await stETHPool.get_dy(1, 0, parseEther("1"))

    let [poolb0, poolb1] = await checkPoolBalances();
    return [dyPerOne, dy, poolb0, poolb1];
  }

  async function checkPoolBalances() {
    const balance0 = await stETHPool.balances(0, { gasLimit: 800000 });
    const balance1 = await stETHPool.balances(1, { gasLimit: 800000 });
    return [balance0, balance1];
  }

  async function prepareStETH(whale) {
    // prepare stETH token
    await impersonateAccount(whale, async function (signer) {
      const tokenSigner = stETHToken.connect(signer);
      const amount = await tokenSigner.balanceOf(whale);
      await (await tokenSigner.approve(whale, MaxUint256)).wait();
      await (await tokenSigner.transferFrom(whale, userAddr, amount)).wait();

      console.log(
        "\nprepare token ",
        (await tokenSigner.balanceOf(userAddr)).toString()
      );
    });
  }
}

main();
