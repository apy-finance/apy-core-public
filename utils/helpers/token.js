const hre = require("hardhat");
const { artifacts, ethers } = hre;
const { send } = require("@openzeppelin/test-helpers");
const { tokenAmountToBigNumber } = require("./unit");

const IMintableERC20 = artifacts.require("IMintableERC20");

const mintERC20Tokens = async (
  tokenAddress,
  receiverAddress,
  ownerAddress,
  amount
) => {
  const token = await IMintableERC20.at(tokenAddress);
  await token.mint(receiverAddress, amount, {
    from: ownerAddress,
    gasPrice: 0,
  });
};

const transferERC20Tokens = async (
  tokenAddress,
  receiverAddress,
  ownerAddress,
  amount
) => {
  const token = await IMintableERC20.at(tokenAddress);
  await token.transfer(receiverAddress, amount, {
    from: ownerAddress,
    gasPrice: 0,
  });
};

const getERC20Balance = async (contractAddress, accountAddress) => {
  const token = await IMintableERC20.at(contractAddress);
  const balance = await token.balanceOf(accountAddress);
  const symbol = await token.symbol();
  const decimals = await token.decimals();
  console.log(
    `       --->  ${symbol} balance:`,
    balance.toString() / `1e${decimals}`
  );
  return balance;
};

async function acquireToken(sender, recipient, token, amount, ethFunder) {
  /*
    sender: address, holds the tokens to be sent
    recipient: address, receives the tokens
    token: contract instance of token (ethers)
    amount: BigNumber or string, should be in big units not wei if string
    ethFunder: unlocked address holding ETH, e.g. hardhat test account
  */
  const decimals = await token.decimals();
  amount = tokenAmountToBigNumber(amount, decimals);
  await prepareTokenSender(sender, "0.50", ethFunder);
  const fundAccountSigner = await ethers.provider.getSigner(sender);

  const trx = await token
    .connect(fundAccountSigner)
    .transfer(recipient, amount);
  await trx.wait();
  const balance = (await token.balanceOf(recipient)).toString();
  const symbol = await token.symbol();
  console.debug(`${symbol} balance: ${balance / 10 ** decimals}`);
}

async function prepareTokenSender(sender, ethAmount, ethFunder) {
  /* Need to do two things to allow sending stablecoin from the
    funding account to the recipient:

    1. ensure sender has ETH; if sender is a contract, such as a Curve
    pool that disallows receiving ETH, we need to do the selfdestruct
    trick to send it ETH.

    2. impersonate the sender account 
  */
  ethAmount = tokenAmountToBigNumber(ethAmount, "18");
  await forciblySendEth(sender, ethAmount, ethFunder);

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [sender],
  });
}

async function forciblySendEth(recipient, amount, ethFunder) {
  /* Will forcibly send ETH to any recipient, even a
    contract that rejects ETH.  Only requires that `ethFunder`
    has ETH to send to the EthSender contract, e.g. is a hardhat
    test account.
  */
  const EthSender = await ethers.getContractFactory("EthSender");
  const ethSender = await EthSender.deploy();
  await ethSender.deployed();
  await send.ether(ethFunder, ethSender.address, amount);
  await ethSender.send(recipient);
}

module.exports = {
  mintERC20Tokens,
  transferERC20Tokens,
  getERC20Balance,
  console,
  acquireToken,
};
