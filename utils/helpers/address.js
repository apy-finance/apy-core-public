const { TOKEN_AGG_MAP, AGG_MAP } = require("../constants.js");

/**
 * @param {*} symbol token symbol in utils/constants.js:TOKEN_AGG_MAP
 * @param {string} network network name in utils/constants.js:CHAIN_IDS
 * @returns
 */
function getStablecoinAddress(symbol, network) {
  const aggItems = TOKEN_AGG_MAP[network.toUpperCase()];
  for (const aggItem of aggItems) {
    if (symbol.toUpperCase() == aggItem["symbol"]) {
      return aggItem["token"];
    }
  }
  throw new Error(`Could not find address for ${symbol}`);
}

/**
 * @param {*} name aggregator name in utils/constants.js:AGG_MAP
 * @param {string} network network name in utils/constants.js:CHAIN_IDS
 * @returns
 */
function getAggregatorAddress(name, network) {
  const aggAddress = AGG_MAP[network.toUpperCase()][name.toUpperCase()];
  return aggAddress;
}

module.exports = {
  getStablecoinAddress,
  getAggregatorAddress,
};
