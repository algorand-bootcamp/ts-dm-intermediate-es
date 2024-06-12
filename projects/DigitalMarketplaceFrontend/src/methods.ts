import * as algokit from '@algorandfoundation/algokit-utils'
import * as algosdk from 'algosdk'
import { DigitalMarketplaceClient } from './contracts/DigitalMarketplace'

// Iniciar el marketplace (crear)
export function create(
  algorand: algokit.AlgorandClient,
  dmClient: DigitalMarketplaceClient,
  sender: string,
  setAppId: (id: number) => void,
) {
  return async () => {
    const createResult = await dmClient.create.createApplication({})

    await algorand.send.payment({
      sender,
      receiver: createResult.appAddress,
      amount: algokit.algos(0.1),
    })

    setAppId(Number(createResult.appId))
  }
}

// Iniciar la venta (contrato optin, enviar assets, aumentar assets)
export function sell(
  algorand: algokit.AlgorandClient,
  dmClient: DigitalMarketplaceClient,
  seller: string,
  amountToSell: bigint,
  unitaryPrice: bigint,
) {
  return async () => {
    // Crear el asset a venderse
    const newAssetTxn = await algorand.send.assetCreate({
      sender: seller,
      total: BigInt(100),
      decimals: 0,
    })

    const { appAddress } = await dmClient.appClient.getAppReference()

    // Que contrato haga optin (allowAsset)
    const mbrPayTxn = await algorand.transactions.payment({
      sender: seller,
      receiver: appAddress,
      amount: algokit.algos(0.1),
      extraFee: algokit.algos(0.001),
    })
    await dmClient.allowAsset({
      mbrPay: mbrPayTxn,
      asset: newAssetTxn.confirmation.assetIndex!,
    })

    // Hacer un primer depósito
    const mbrPayDepositTxn = await algorand.transactions.payment({
      sender: seller,
      receiver: appAddress,
      amount: algokit.algos((2_500 + 400 * 56) / 1_000_000),
    })

    const firstXferTxn = await algorand.transactions.assetTransfer({
      sender: seller,
      assetId: BigInt(newAssetTxn.confirmation.assetIndex!),
      amount: amountToSell - 1n,
      receiver: appAddress,
    })

    await dmClient.firstDeposit({
      mbrPay: mbrPayDepositTxn,
      xfer: firstXferTxn,
      unitaryPrice,
    })

    // Hacer un segundo depósito
    const secondXferTxn = await algorand.transactions.assetTransfer({
      sender: seller,
      assetId: BigInt(newAssetTxn.confirmation.assetIndex!),
      amount: 1n,
      receiver: appAddress,
    })

    await dmClient.deposit({
      xfer: secondXferTxn,
    })
  }
}

// Realizar compra de assets
export function buy(
  algorand: algokit.AlgorandClient,
  dmClient: DigitalMarketplaceClient,
  buyer: string,
  seller: string,
  assetId: bigint,
  quantity: bigint,
) {
  return async () => {
    await algorand.send.assetOptIn({
      sender: buyer,
      assetId,
    })

    const boxContent = await dmClient.appClient.getBoxValue(
      new Uint8Array([...algokit.getAccountAddressAsUint8Array(seller), ...algosdk.encodeUint64(assetId)]),
    )

    const currentUnitaryPrice = algosdk.decodeUint64(boxContent.slice(8, 16), 'safe')

    const buyPayTxn = await algorand.transactions.payment({
      sender: buyer,
      receiver: seller,
      amount: algokit.microAlgos(Number(quantity) * currentUnitaryPrice),
      extraFee: algokit.algos(0.001),
    })

    await dmClient.buy({
      owner: seller,
      asset: assetId,
      buyPay: buyPayTxn,
      quantity,
    })
  }
}
