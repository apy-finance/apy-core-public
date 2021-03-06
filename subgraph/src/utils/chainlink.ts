import { AggregatorV3Interface } from "../../generated/DAI_PoolToken/AggregatorV3Interface";
import { Address, BigInt } from "@graphprotocol/graph-ts";

export function getEthUsdAggregator(network: string): AggregatorV3Interface {
    let ethUsdAgg: AggregatorV3Interface;
    if (network == "mainnet") {
        ethUsdAgg = AggregatorV3Interface.bind(
            Address.fromString("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419")
        );
    } else if (network == "kovan") {
        ethUsdAgg = AggregatorV3Interface.bind(
            Address.fromString("0x9326BFA02ADD2366b30bacB125260Af641031331")
        );
    } else {
        throw new Error(
            "Network not recognized: must be 'mainnet' or 'kovan'."
        );
    }
    return ethUsdAgg;
}

export function getStableUsdAggregator(
    network: string,
    symbol: string,
    version: number
): AggregatorV3Interface {
    let aggAddress: Address;
    if (network == "mainnet") {
        if (version == 2) {
            if (symbol == "DAI") {
                aggAddress = Address.fromString(
                    "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"
                );
            } else if (symbol == "USDC") {
                aggAddress = Address.fromString(
                    "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6"
                );
            } else if (symbol == "USDT") {
                aggAddress = Address.fromString(
                    "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D"
                );
            } else {
                throw new Error(
                    "Symbol not recognized: must be 'DAI', 'USDC', or 'USDT'."
                );
            }
        } else if (version == 1) {
            if (symbol == "DAI") {
                aggAddress = Address.fromString(
                    "0x773616E4d11A78F511299002da57A0a94577F1f4"
                );
            } else if (symbol == "USDC") {
                aggAddress = Address.fromString(
                    "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4"
                );
            } else if (symbol == "USDT") {
                aggAddress = Address.fromString(
                    "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46"
                );
            } else {
                throw new Error(
                    "Symbol not recognized: must be 'DAI', 'USDC', or 'USDT'."
                );
            }
        } else {
            throw new Error("Version not recognized: must be 1 or 2");
        }
    } else if (network == "kovan") {
        if (version == 2) {
            if (symbol == "DAI") {
                aggAddress = Address.fromString(
                    "0x777A68032a88E5A84678A77Af2CD65A7b3c0775a"
                );
            } else if (symbol == "USDC") {
                aggAddress = Address.fromString(
                    "0x9211c6b3BF41A10F78539810Cf5c64e1BB78Ec60"
                );
            } else if (symbol == "USDT") {
                aggAddress = Address.fromString(
                    "0x2ca5A90D34cA333661083F89D831f757A9A50148"
                );
            } else {
                throw new Error(
                    "Symbol not recognized: must be 'DAI', 'USDC', or 'USDT'."
                );
            }
        } else if (version == 1) {
            if (symbol == "DAI") {
                aggAddress = Address.fromString(
                    "0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541"
                );
            } else if (symbol == "USDC") {
                aggAddress = Address.fromString(
                    "0x64EaC61A2DFda2c3Fa04eED49AA33D021AeC8838"
                );
            } else if (symbol == "USDT") {
                aggAddress = Address.fromString(
                    "0x0bF499444525a23E7Bb61997539725cA2e928138"
                );
            } else {
                throw new Error(
                    "Symbol not recognized: must be 'DAI', 'USDC', or 'USDT'."
                );
            }
        } else {
            throw new Error("Version not recognized: must be 1 or 2");
        }
    } else {
        throw new Error(
            "Network not recognized: must be 'mainnet' or 'kovan'."
        );
    }
    const stableUsdAgg: AggregatorV3Interface =
        AggregatorV3Interface.bind(aggAddress);
    return stableUsdAgg;
}

export function getPriceFromAgg(aggContract: AggregatorV3Interface): BigInt {
    const roundDataResult = aggContract.try_latestRoundData();
    let price = BigInt.fromI32(0);
    if (!roundDataResult.reverted) {
        price = roundDataResult.value.value1;
    }
    return price;
}
