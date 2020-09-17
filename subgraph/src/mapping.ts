import { DepositedAPT, RedeemedAPT } from '../generated/APYLiquidityPoolImplementation/APYLiquidityPoolImplementation'
import { TotalValueLocked } from '../generated/schema'

export function handleDepositedAPT(event: DepositedAPT): void {
  let tvl = new TotalValueLocked(
    event.params.sender.toHex()
    + event.block.timestamp.toString()
    + event.logIndex.toString()
    + event.transaction.hash.toString()
  )
  tvl.totalValueLocked = event.params.totalValueLocked
  tvl.save()
}

export function handleRedeemedAPT(event: RedeemedAPT): void {
  let tvl = new TotalValueLocked(
    event.params.sender.toHex()
    + event.block.timestamp.toString()
    + event.logIndex.toString()
    + event.transaction.hash.toString()
  )
  tvl.totalValueLocked = event.params.totalValueLocked
  tvl.save()
}