// src/components/Home.tsx
import * as algokit from '@algorandfoundation/algokit-utils'
import { useQuery } from '@tanstack/react-query'
import { useWallet } from '@txnlab/use-wallet'
import * as algosdk from 'algosdk'
import React, { useState } from 'react'
import ConnectWallet from './components/ConnectWallet'
import MethodCall from './components/MethodCall'
import { DigitalMarketplaceClient } from './contracts/DigitalMarketplace'
import * as methods from './methods'
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

interface HomeProps {}

const Home: React.FC<HomeProps> = () => {
  const [openWalletModal, setOpenWalletModal] = useState<boolean>(false)
  const [appId, setAppId] = useState<number>(0)
  const [amountToSell, setAmountToSell] = useState<bigint>(0n)
  const [sellingPrice, setSellingPrice] = useState<bigint>(0n)
  const [sellerAddress, setSellerAddress] = useState<string>('')
  const [assetToBuy, setAssetToBuy] = useState<bigint>(0n)
  const [amountToBuy, setAmountToBuy] = useState<bigint>(0n)
  const { activeAddress, signer } = useWallet()
  const listingsQuery = useQuery({
    queryKey: ['listings', appId],
    queryFn: async () => {
      const allBoxesNames = await algorand.client.algod.getApplicationBoxes(appId).do()
      return await Promise.all(
        allBoxesNames.boxes.map(async (box) => {
          const boxContent = await algorand.client.algod.getApplicationBoxByName(appId, box.name).do()
          return {
            seller: algosdk.encodeAddress(box.name.slice(0, 32)),
            assetId: algosdk.decodeUint64(box.name.slice(32, 40), 'bigint'),
            amount: algosdk.decodeUint64(boxContent.value.slice(0, 8), 'bigint'),
            unitaryPrice: algosdk.decodeUint64(boxContent.value.slice(8, 16), 'bigint'),
          }
        }),
      )
    },
    staleTime: 1_000,
  })

  algokit.Config.configure({ populateAppCallResources: true })

  const algodConfig = getAlgodConfigFromViteEnvironment()
  const algorand = algokit.AlgorandClient.fromConfig({ algodConfig })
  algorand.setDefaultSigner(signer)

  const dmClient = new DigitalMarketplaceClient(
    {
      resolveBy: 'id',
      id: appId,
      sender: { addr: activeAddress!, signer },
    },
    algorand.client.algod,
  )

  const toggleWalletModal = () => {
    setOpenWalletModal(!openWalletModal)
  }

  return (
    <div className="hero min-h-screen bg-teal-400">
      <div className="hero-content text-center rounded-lg p-6  bg-white mx-auto">
        <div>
          <h1 className="text-4xl">
            Bienvenido <div className="font-bold">Marketplace del Bootcamp 🙂</div>
          </h1>
          <p className="py-6">Proyecto demo del Bootcamp intermedio de typescript de Algorand</p>

          <div className="grid">
            <button data-test-id="connect-wallet" className="btn m-2" onClick={toggleWalletModal}>
              Wallet Connection
            </button>
            <div className="divider" />

            {/* Input para apuntar a un marketplace */}
            <label className="label">App ID</label>
            <input
              type="number"
              className="input input-bordered m-2"
              value={appId}
              onChange={(e) => setAppId(e.currentTarget.valueAsNumber || 0)}
            />

            {/* Procedimiento para crear marketplace */}
            {activeAddress && appId === 0 && (
              <div>
                <MethodCall methodFunction={methods.create(algorand, dmClient, activeAddress, setAppId)} text="Inicializar Marketplace" />
              </div>
            )}

            {/* Procedimiento para vender assets */}

            {activeAddress && appId !== 0 && (
              // Ingreso de monto a vender
              <div>
                <div className="divider" />
                <label className="label">Monto a vender</label>
                <input
                  type="text"
                  className="input input-bordered m-2"
                  value={amountToSell.toString()}
                  onChange={(e) => setAmountToSell(BigInt(e.currentTarget.value || 0))}
                />
                {/* // Ingreso de precio unitario */}
                <label className="label">Precio de venta</label>
                <input
                  type="text"
                  className="input input-bordered m-2"
                  value={sellingPrice.toString()}
                  onChange={(e) => setSellingPrice(BigInt(e.currentTarget.value || 0))}
                />
                {/* // Llamada al método */}
                <MethodCall
                  methodFunction={methods.sell(algorand, dmClient, activeAddress, amountToSell, sellingPrice)}
                  text="Iniciar venta"
                />
              </div>
            )}

            {/* Lista de assets del marketplace cargado */}

            {appId !== 0 && (
              <div>
                <div className="divider" />
                <label className="label">Lista de ventas</label>
                <ul>
                  {listingsQuery.data?.map((listing) => (
                    <li key={listing.seller + listing.assetId.toString()}>
                      {`Vendedor:${listing.seller} | assetId: ${listing.assetId} | Monto: ${listing.amount} | Precio: ${listing.unitaryPrice}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Boton de comprar assets */}
            {activeAddress && appId !== 0 && (
              // Address del vendedor
              <div>
                <div className="divider" />
                <label className="label">Vendedor</label>
                <input
                  type="text"
                  className="input input-bordered m-2"
                  value={sellerAddress}
                  onChange={(e) => setSellerAddress(e.currentTarget.value)}
                />
                {/* ID del asset */}
                <label className="label">Asset a comprar</label>
                <input
                  type="text"
                  className="input input-bordered m-2"
                  value={assetToBuy.toString()}
                  onChange={(e) => setAssetToBuy(BigInt(e.currentTarget.value || 0))}
                />
                {/* Monto a comprar */}
                <label className="label">Monto a comprar</label>
                <input
                  type="text"
                  className="input input-bordered m-2"
                  value={amountToBuy.toString()}
                  onChange={(e) => setAmountToBuy(BigInt(e.currentTarget.value || 0))}
                />
                <MethodCall
                  methodFunction={methods.buy(algorand, dmClient, activeAddress, sellerAddress, assetToBuy, amountToBuy)}
                  text="Realizar compra"
                />
              </div>
            )}
          </div>

          <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
        </div>
      </div>
    </div>
  )
}

export default Home
