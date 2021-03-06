const hre = require("hardhat");
const { ethers } = hre;
const { BigNumber } = ethers;
const BN = require("bignumber.js");
const coingecko = require("./coingecko");

const priceTotalValue = (allocations, quote, data) => {
  let totalValue = allocations.reduce((acc, t) => {
    const val = data[t.symbol].quote[quote].price;
    const coins = new BN(t.balance.toString()).div(10 ** t.decimals);
    return acc.plus(coins.times(val));
  }, new BN(0));
  totalValue = totalValue.times(1e8).toFixed(0);
  return BigNumber.from(totalValue);
};

const getAssetAllocationValue = async (allocations) => {
  const quote = "USD";
  const symbols = allocations.map((t) => t.symbol);
  const data = await coingecko.getPrices(symbols, quote);

  const payloadEntries = symbols.map((symbol) => {
    const key = symbol;
    const val = {
      quote: {
        [quote]: { price: data[symbol] },
      },
    };
    return [key, val];
  });

  const payload = Object.fromEntries(payloadEntries);
  const value = priceTotalValue(allocations, quote, payload);

  return value;
};

module.exports = {
  getAssetAllocationValue,
};
