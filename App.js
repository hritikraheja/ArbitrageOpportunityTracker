require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const Web3 = require("web3");
const {table, getBorderCharacters} = require('table')
const uniswapRouterAbi = require("./abis/UniswapV2Router02.json");
const sushiswapRouterAbi = require("./abis/SushiSwapRouter.json");
const { db } = require("./InitialiseFirebase.js");
const { ref, push, set, child, get } = require("firebase/database");

const uniswapRouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const sushiswapRouterAddress = "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f";

const PORT = process.env.PORT || 8080;
const app = express();

const server = http
  .createServer(app)
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const web3 = new Web3(
  new Web3.providers.HttpProvider(`${process.env.MAINNET_PROVIDER}`)
);

const uniswapRouterContract = new web3.eth.Contract(
  uniswapRouterAbi,
  uniswapRouterAddress
);
const sushiswapRouterContract = new web3.eth.Contract(
  sushiswapRouterAbi,
  sushiswapRouterAddress
);

const wethContractAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const daiContractAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

const oneEth = 10 ** 18 + "";
let uniswapPrice;
let sushiswapPrice;
const dbRef = ref(db, "priceChangeLogs");

let config = process.env.FIREBASE_CONFIG
// console.log(config)

setInterval(async () => {
  let uniswapRes = await uniswapRouterContract.methods
    .getAmountsOut(oneEth, [wethContractAddress, daiContractAddress])
    .call();
  let sushiswapRes = await sushiswapRouterContract.methods
    .getAmountsOut(oneEth, [wethContractAddress, daiContractAddress])
    .call();

  let currentUniswapPrice = Web3.utils.fromWei(uniswapRes[1]);
  let currentSushiswapPrice = Web3.utils.fromWei(sushiswapRes[1]);
  if (
    currentSushiswapPrice !== sushiswapPrice ||
    currentUniswapPrice !== uniswapPrice
  ) {
    let date_obj = new Date(Date.now());
    let timeString =
      date_obj.getDate() +
      "-" +
      (date_obj.getMonth() + 1) +
      "-" +
      date_obj.getFullYear() +
      " " +
      date_obj.getHours() +
      ":" +
      date_obj.getMinutes() +
      ":" +
      date_obj.getSeconds();

      let entryLog = {
        UniswapPrice : currentUniswapPrice,
        SushiswapPrice : currentSushiswapPrice,
        timeStamp : timeString
      }

    const buyFromSushiSellAtUniPrice = await uniswapRouterContract.methods
      .getAmountsOut(sushiswapRes[1], [daiContractAddress, wethContractAddress])
      .call();

    const buyFromUniSellAtSushiPrice = await sushiswapRouterContract.methods
      .getAmountsOut(uniswapRes[1], [daiContractAddress, wethContractAddress])
      .call();

    if (
      buyFromUniSellAtSushiPrice[1] <= 10 ** 18 &&
      buyFromSushiSellAtUniPrice[1] <= 10 ** 18
    ) {
      entryLog.message = "Trade not profitable"
    } else if (buyFromUniSellAtSushiPrice[1] > 10 ** 18) {
      let profit = Web3.utils.fromWei(buyFromUniSellAtSushiPrice[1] - 10 ** 18);
      entryLog.message ="Buy from Uni, sell at Sushi trade Profitable, Profit : " + profit + ' WETH'; 
    } else if (buyFromSushiSellAtUniPrice[1] > 10 ** 18) {
      let profit = Web3.utils.fromWei(buyFromSushiSellAtUniPrice[1] - 10 ** 18);
      entryLog.message = "Buy from Sushi, sell at Uni trade Profitable, Profit : " + profit + ' WETH';
    }
    uniswapPrice = currentUniswapPrice;
    sushiswapPrice = currentSushiswapPrice;
    const newEntryLog = push(dbRef);
    set(newEntryLog, entryLog)
  }
}, 5000);

app.get('/', (req, res)=> {
    get(dbRef, "/").then((snaphot) => {
        if(snaphot.exists()){
            let entries = []
            snaphot.forEach((childSnapshot) => {
                var entry = [
                    childSnapshot.val().UniswapPrice,
                    childSnapshot.val().SushiswapPrice,
                    childSnapshot.val().message,
                    childSnapshot.val().timeStamp
                ]
                entries.push(entry);
            })
            res.write('_'.repeat(145) + '\n')
            res.write("|     Uniswap Price".padEnd(35, ' ') + '|' + "     Sushiswap Price".padEnd(35, ' ') + '|' + "     Message".padEnd(35, ' ') + '|' + "     Timestamp".padEnd(35, ' ') + '|\n')
            entries.forEach((entry) => {
                res.write(entry[0].padEnd(30, ' ') + '|' + entry[1].padEnd(30, ' ') + '|' + entry[2].padEnd(30, ' ') + '|' + entry[3].padEnd(30, ' ') + '|\n')
            })
            res.write('_'.repeat(145) + '\n')
            res.end()
            // let output = table(entries, {border: getBorderCharacters(`ramac`)})
            // console.log(output)
        } else {
            res.write('No Logs Found!')
        }
    })
})